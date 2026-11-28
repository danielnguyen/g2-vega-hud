import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConversationInput } from './conversationInput';
import type { AppState } from './types';
import { Conversation, MIC_UNCERTAIN } from './conversation';
import type { SpeechToTextHandlers, SpeechToTextSession } from './speechToText';
import type { AppConfig } from './config';
import type { GatewayPageResponse } from './types';

const config: AppConfig = { gatewayUrl: 'https://example.invalid', authValue: 'test' };
const answer: GatewayPageResponse = { request_id: 'r', conversation_id: 'same', title: 'Answer', pages: ['one', 'two'], source: 'chat-orchestrator', raw_length: 6 };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function flush() { for (let i = 0; i < 50; i++) await Promise.resolve(); }
function setup() {
  const handlers: SpeechToTextHandlers[] = [];
  const sessions: SpeechToTextSession[] = [];
  const deps = {
    ready: vi.fn(() => true),
    microphone: vi.fn(async (_enabled: boolean) => true),
    phase: vi.fn(), answer: vi.fn(), stopped: vi.fn(), error: vi.fn(),
    bootstrap: vi.fn(async () => ({ provider: 'deepgram', token: `token-${handlers.length}`, expires_in: 60 })),
    provider: vi.fn(() => ({ start: vi.fn(async (_token: string, h: SpeechToTextHandlers) => {
      handlers.push(h);
      const session = { sendPcm: vi.fn(), cancel: vi.fn(), finish: vi.fn() };
      sessions.push(session);
      return session;
    }) })),
    submit: vi.fn(async () => answer),
    poll: vi.fn()
  };
  const conversation = new Conversation(deps);
  return { conversation, deps, handlers, sessions };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => { expect(vi.getTimerCount()).toBe(0); vi.useRealTimers(); });

describe('deliberate sequential conversation', () => {
  it('uses fresh tokens/sessions and one submission per utterance for three turns, with no mic during CCP', async () => {
    const { conversation: c, deps, handlers, sessions } = setup();
    c.start(config); c.start(config); await flush();
    for (let turn = 0; turn < 3; turn++) {
      const pending = deferred<GatewayPageResponse>();
      deps.submit.mockImplementationOnce(() => pending.promise);
      handlers[turn].onUtteranceComplete(`question ${turn}`);
      handlers[turn].onUtteranceComplete('duplicate');
      c.start(config); await flush();
      expect(deps.submit).toHaveBeenCalledTimes(turn + 1);
      expect(deps.microphone.mock.calls.at(-1)).toEqual([false]);
      c.sendPcm(new Uint8Array([1]));
      expect(sessions[turn].sendPcm).not.toHaveBeenCalled();
      pending.resolve(answer); await flush();
      expect(handlers).toHaveLength(turn + 2);
      expect(deps.answer).toHaveBeenCalledTimes(turn + 1);
    }
    expect(deps.bootstrap).toHaveBeenCalledTimes(4);
    expect(deps.provider.mock.results.map(r => r.value.start.mock.calls[0][0])).toEqual(['token-0', 'token-1', 'token-2', 'token-3']);
    expect(deps.submit.mock.calls.slice(1).every(call => (call as unknown as [unknown, unknown, { conversationId: string }])[2].conversationId === 'same')).toBe(true);
    c.stop(); await flush();
    expect(sessions.every(s => vi.mocked(s.cancel).mock.calls.length === 1)).toBe(true);
    expect(c.busy).toBe(false);
    expect(c.canExit).toBe(true);
    c.start(config); await flush(); expect(handlers).toHaveLength(5);
    c.stop(); await flush();
  });

  it('requires a successful startup page before any capture', () => {
    const { conversation: c, deps } = setup(); deps.ready.mockReturnValue(false);
    c.start(config); expect(deps.bootstrap).not.toHaveBeenCalled(); expect(deps.error).toHaveBeenCalled();
  });

  it.each([false, 'reject'] as const)('never claims listening on %s enable acknowledgement', async result => {
    const { conversation: c, deps } = setup();
    if (result === false) deps.microphone.mockResolvedValueOnce(false);
    else deps.microphone.mockRejectedValueOnce(new Error('bridge'));
    c.start(config); await flush();
    expect(deps.phase).not.toHaveBeenCalledWith('listening');
    expect(deps.submit).not.toHaveBeenCalled(); expect(deps.error).toHaveBeenCalled();
    expect(deps.microphone.mock.calls.at(-1)).toEqual([false]);
  });

  it('waits for delayed enable then disables before allowing a new start', async () => {
    const { conversation: c, deps, handlers } = setup(); const enable = deferred<boolean>();
    deps.microphone.mockImplementationOnce(() => enable.promise);
    c.start(config); await flush(); c.stop(); c.start(config); await flush();
    expect(deps.microphone).toHaveBeenCalledTimes(1);
    enable.resolve(true); await flush();
    expect(deps.phase).not.toHaveBeenCalledWith('listening');
    expect(deps.microphone.mock.calls).toEqual([[true], [false]]);
    c.start(config); await flush();
    handlers[0].onError(); handlers[0].onUtteranceComplete('stale'); await flush();
    expect(deps.submit).not.toHaveBeenCalled(); expect(deps.microphone.mock.calls.at(-1)).toEqual([true]);
    c.stop(); await flush();
  });

  it.each([false, 'reject', 'timeout'] as const)('blocks submission and rearm on %s shutdown', async result => {
    const { conversation: c, deps, handlers } = setup(); c.start(config); await flush();
    if (result === false) deps.microphone.mockResolvedValueOnce(false);
    else if (result === 'reject') deps.microphone.mockRejectedValueOnce(new Error('bridge'));
    else deps.microphone.mockImplementationOnce(() => new Promise(() => {}));
    handlers[0].onUtteranceComplete('hello'); await flush();
    if (result === 'timeout') await vi.advanceTimersByTimeAsync(10_000);
    expect(deps.error).toHaveBeenCalledWith(MIC_UNCERTAIN);
    expect(c.canExit).toBe(false);
    expect(deps.submit).not.toHaveBeenCalled();
    c.start(config); await flush(); expect(deps.bootstrap).toHaveBeenCalledTimes(1);
  });

  it('quarantines a timed out enable; late completion only triggers queued cleanup', async () => {
    const { conversation: c, deps } = setup(); const enable = deferred<boolean>();
    deps.microphone.mockImplementationOnce(() => enable.promise);
    c.start(config); await flush(); await vi.advanceTimersByTimeAsync(15_000);
    expect(deps.error).toHaveBeenCalledWith(MIC_UNCERTAIN);
    expect(c.canExit).toBe(false);
    c.start(config); enable.resolve(true); await flush();
    expect(deps.microphone.mock.calls).toEqual([[true], [false], [false]]);
    expect(deps.bootstrap).toHaveBeenCalledTimes(1);
  });

  it('does not submit until disable is acknowledged, and cancellation during cleanup discards the turn', async () => {
    const { conversation: c, deps, handlers } = setup(); c.start(config); await flush();
    const disable = deferred<boolean>(); deps.microphone.mockImplementationOnce(() => disable.promise);
    handlers[0].onUtteranceComplete('hello'); await flush();
    expect(deps.submit).not.toHaveBeenCalled();
    expect(deps.phase.mock.calls.at(-1)).toEqual(['stopping']);
    c.stop(); c.start(config);
    disable.resolve(true); await flush(); expect(deps.submit).not.toHaveBeenCalled(); expect(c.busy).toBe(false);
  });

  it.each(['silence', 'absolute', 'empty', 'provider'] as const)('stops on %s without rearming, preserving manual resume', async reason => {
    const { conversation: c, deps, handlers } = setup(); c.start(config); await flush();
    if (reason === 'silence') await vi.advanceTimersByTimeAsync(30_000);
    if (reason === 'absolute') { handlers[0].onTranscriptUpdate('ongoing'); await vi.advanceTimersByTimeAsync(60_000); }
    if (reason === 'empty') handlers[0].onUtteranceComplete('  ');
    if (reason === 'provider') handlers[0].onError();
    await flush(); expect(deps.submit).not.toHaveBeenCalled(); expect(c.busy).toBe(false);
    expect(c.canExit).toBe(true);
    c.start(config); await flush(); expect(deps.bootstrap).toHaveBeenCalledTimes(2); c.stop(); await flush();
  });

  it.each(['bootstrap', 'socket', 'gateway', 'poll'].flatMap(stage => [false, true].map(exit => ({ stage, exit }))))('fences cancellation during $stage (exit=$exit) and stale completions', async ({ stage, exit }) => {
    const { conversation: c, deps, handlers } = setup();
    const pending = deferred<any>();
    if (stage === 'bootstrap') deps.bootstrap.mockImplementationOnce(() => pending.promise);
    if (stage === 'socket') deps.provider.mockReturnValueOnce({ start: vi.fn(() => pending.promise) });
    if (stage === 'gateway') deps.submit.mockImplementationOnce(() => pending.promise);
    if (stage === 'poll') {
      deps.submit.mockResolvedValueOnce({ ...answer, delivery_status: 'pending', work_id: 'work' } as any);
      deps.poll.mockImplementationOnce(() => pending.promise);
    }
    c.start(config); await flush();
    if (stage === 'gateway' || stage === 'poll') { handlers[0].onUtteranceComplete('hello'); await flush(); }
    c.stop(exit); const counts = [deps.phase.mock.calls.length, deps.answer.mock.calls.length, deps.error.mock.calls.length];
    const lateSession = { sendPcm: vi.fn(), cancel: vi.fn(), finish: vi.fn() };
    pending.resolve(stage === 'socket' ? lateSession : stage === 'bootstrap' ? { provider: 'deepgram', token: 'late', expires_in: 60 } : { ...answer, state: 'completed' });
    await flush();
    expect([deps.phase.mock.calls.length, deps.answer.mock.calls.length, deps.error.mock.calls.length]).toEqual(counts);
    if (stage === 'socket') expect(lateSession.cancel).toHaveBeenCalled();
    expect(deps.bootstrap).toHaveBeenCalledTimes(1); expect(c.busy).toBe(false);
    if (exit) { c.start(config); expect(deps.bootstrap).toHaveBeenCalledTimes(1); }
  });

  it('rearms after deferred success and retains admitted identity on failed work', async () => {
    const { conversation: c, deps, handlers } = setup();
    deps.submit.mockResolvedValueOnce({ ...answer, delivery_status: 'pending', work_id: 'work' } as any);
    deps.poll.mockResolvedValueOnce({ ...answer, state: 'completed' });
    c.start(config); await flush(); handlers[0].onUtteranceComplete('hello'); await flush();
    expect(handlers).toHaveLength(2); expect(deps.answer).toHaveBeenCalledTimes(1);
    deps.submit.mockResolvedValueOnce({ ...answer, delivery_status: 'pending', work_id: 'work' } as any);
    deps.poll.mockResolvedValueOnce({ state: 'failed' });
    handlers[1].onUtteranceComplete('again'); await flush();
    expect(handlers).toHaveLength(2); expect(c.busy).toBe(false);
    expect(c.canExit).toBe(true);
    c.start(config); await flush(); handlers[2].onUtteranceComplete('resume'); await flush();
    expect((deps.submit.mock.calls[2] as any)[2].conversationId).toBe('same');
    c.stop(); await flush();
  });

  it.each(['failed', 'empty', 'non_current', 'network'] as const)('does not rearm on %s; preserves disposition and generic failure semantics', async kind => {
    const { conversation: c, deps, handlers } = setup();
    c.start(config); await flush(); handlers[0].onUtteranceComplete('first'); await flush();
    if (kind === 'network') deps.submit.mockRejectedValueOnce(new Error('network'));
    else deps.submit.mockResolvedValueOnce({ ...answer, status: kind === 'empty' ? 'ok' : 'failed', ...(kind === 'empty' ? { pages: [] } : {}), ...(kind === 'non_current' ? { conversation_disposition: 'non_current' } : {}) });
    handlers[1].onUtteranceComplete('second'); await flush();
    expect(handlers).toHaveLength(2); c.start(config); await flush(); handlers[2].onUtteranceComplete('third'); await flush();
    expect((deps.submit.mock.calls[2] as any)[2].conversationId).toBe(kind === 'non_current' ? undefined : 'same');
    c.stop(); await flush();
  });
});


it.each(['connecting', 'listening', 'thinking'] as const)('real controller stops %s before a distinct exit without stale work', async phase => {
  const { conversation: c, deps, handlers } = setup();
  const pending = deferred<any>();
  const micOff = deferred<boolean>();
  if (phase === 'connecting') deps.bootstrap.mockReturnValueOnce(pending.promise);
  if (phase === 'thinking') deps.submit.mockReturnValueOnce(pending.promise);
  const state = { screen: 'home', response: null } as AppState;
  deps.phase.mockImplementation(screen => { state.screen = screen; });
  deps.stopped.mockImplementation(() => { state.screen = 'home'; });
  const exit = vi.fn(async () => 'requested' as const);
  const input = new ConversationInput({
    state: () => state, busy: () => c.busy, canExit: () => c.canExit,
    start: () => c.start(config), stop: () => c.stop(), movePage: vi.fn(),
    home: vi.fn(), exit, message: vi.fn()
  });
  input.handle('press'); await flush();
  if (phase === 'thinking') { handlers[0].onUtteranceComplete('question'); await flush(); }
  if (phase === 'listening') deps.microphone.mockImplementationOnce(() => micOff.promise);
  input.handle('doublePress'); await flush();
  await vi.advanceTimersByTimeAsync(601);
  input.handle('doublePress'); input.handle('press');
  expect(exit).not.toHaveBeenCalled(); expect(c.canExit).toBe(false);
  if (phase === 'listening') micOff.resolve(true);
  else pending.resolve(phase === 'thinking' ? answer : { provider: 'deepgram', token: 'late', expires_in: 60 });
  await flush();
  input.handle('doublePress'); expect(exit).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(601);
  input.handle('doublePress'); await flush();
  expect(exit).toHaveBeenCalledOnce(); expect(c.canExit).toBe(true);
  expect(deps.answer).not.toHaveBeenCalled();
  expect(deps.submit).toHaveBeenCalledTimes(phase === 'thinking' ? 1 : 0);
  expect(deps.bootstrap).toHaveBeenCalledTimes(1);
  c.stop(true); c.start(config); await flush();
  expect(deps.bootstrap).toHaveBeenCalledTimes(1);
});
