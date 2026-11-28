import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DeviceConnectType, OsEventTypeList as Event, waitForEvenAppBridge, type DeviceStatus, type EvenHubEvent } from '@evenrealities/even_hub_sdk';
import { Conversation, MIC_UNCERTAIN } from '../conversation';
import { ConversationInput } from '../conversationInput';
import { initialState, movePage, showConnecting, showListening, showPages } from '../state';
import { initialRuntimeStatus } from '../runtimeStatus';
import type { SpeechToTextHandlers } from '../speechToText';
import type { GatewayPageResponse } from '../types';
import { bindEvenInput } from './evenInput';
import { frameForState } from './evenDisplay';

vi.mock('@evenrealities/even_hub_sdk', async original => ({
  ...await original<typeof import('@evenrealities/even_hub_sdk')>(), waitForEvenAppBridge: vi.fn()
}));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}
async function flush() { for (let i = 0; i < 60; i++) await Promise.resolve(); }
const config = { gatewayUrl: 'https://example.invalid', authValue: 'synthetic' };
const answer: GatewayPageResponse = { request_id: 'r', title: 'Answer', pages: ['first', 'second'], source: 'chat-orchestrator', raw_length: 11 };

async function setup() {
  const reply = deferred<boolean>();
  const shutdown = vi.fn(() => reply.promise);
  const microphone = vi.fn(async (_enabled: boolean) => true);
  let event!: (value: EvenHubEvent) => void;
  let device!: (value: DeviceStatus) => void;
  vi.mocked(waitForEvenAppBridge).mockResolvedValue({
    shutDownPageContainer: shutdown, audioControl: microphone,
    onEvenHubEvent: (fn: typeof event) => { event = fn; return () => {}; },
    onDeviceStatusChanged: (fn: typeof device) => { device = fn; return () => {}; }
  } as any);
  let state = initialState(true, config, initialRuntimeStatus(true), {
    appVersion: 'test', currentSettings: config, lastGlassesInputEvent: null, lastGatewayRequest: null, lastError: null
  });
  state = movePage(showPages(state, answer), 1);
  const handlers: SpeechToTextHandlers[] = [];
  const submit = vi.fn(async () => answer);
  const bootstrap = vi.fn(async () => ({ provider: 'deepgram', token: 'synthetic', expires_in: 60 }));
  const error = vi.fn((message: string) => { state = { ...state, screen: 'error', errorMessage: message }; });
  const conversation = new Conversation({
    ready: () => true, microphone: enabled => binding!.setMicrophoneEnabled(enabled), bootstrap, submit,
    provider: () => ({ start: async (_token, callbacks) => {
      handlers.push(callbacks);
      return { sendPcm: vi.fn(), cancel: vi.fn(), finish: vi.fn() };
    } }),
    phase: (phase, transcript) => {
      state = phase === 'connecting' ? showConnecting(state) : phase === 'listening' ? showListening(state, transcript) : { ...state, screen: phase };
    },
    answer: response => { state = showPages(state, response); },
    stopped: message => { state = { ...state, screen: 'pages', homeMessage: message }; }, error
  });
  const message = vi.fn((text: string) => { state = { ...state, homeMessage: text, errorMessage: text }; });
  const input = new ConversationInput({
    state: () => state, busy: () => conversation.busy, canExit: () => conversation.canExit,
    start: () => conversation.start(config), stop: () => conversation.stop(),
    movePage: delta => { state = movePage(state, delta); }, home: vi.fn(),
    exit: () => binding!.requestExit(), message
  });
  const binding = await bindEvenInput({
    onInput: normalized => {
      state = { ...state, debug: { ...state.debug, lastGlassesInputEvent: normalized } };
      if (normalized.mappedAction) input.handle(normalized.mappedAction);
    },
    onPcm: chunk => conversation.sendPcm(chunk),
    onExit: () => conversation.stop(true),
    onOverlayChanged: visible => {
      conversation.setOverlayVisible(visible);
      input.setOverlayVisible(visible);
    }
  });
  const emit = (type: Event, channel: 'sysEvent' | 'textEvent' = 'sysEvent') => event({ [channel]: { eventType: type } } as EvenHubEvent);
  return {
    conversation, input, reply, microphone, shutdown, message, error, bootstrap, submit, handlers, emit, event, device,
    state: () => state,
    close: async () => { conversation.stop(true); reply.resolve(true); await flush(); binding!.dispose(); }
  };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => { expect(vi.getTimerCount()).toBe(0); vi.useRealTimers(); vi.clearAllMocks(); });

it.each(['before-overlay', 'on-dismissal', 'after-tap'] as const)('keeps the answer unchanged and resumes on the first post-cancel tap when reply is %s', async timing => {
  const h = await setup(); const before = frameForState(h.state());
  h.emit(Event.DOUBLE_CLICK_EVENT); await flush();
  if (timing === 'before-overlay') { h.reply.resolve(true); await flush(); }
  h.emit(Event.FOREGROUND_ENTER_EVENT);
  h.emit(Event.CLICK_EVENT); h.conversation.start(config); await flush();
  expect(h.bootstrap).not.toHaveBeenCalled();
  h.emit(Event.FOREGROUND_EXIT_EVENT, 'textEvent');
  if (timing === 'on-dismissal') { h.reply.resolve(true); await flush(); }
  expect(h.message).not.toHaveBeenCalled(); expect(frameForState(h.state())).toEqual(before);
  expect(h.bootstrap).not.toHaveBeenCalled(); // dismissal alone never rearms
  h.emit(Event.CLICK_EVENT); await flush(); // no extra 600 ms delay
  expect(h.state().screen).toBe('listening');
  expect(h.bootstrap).toHaveBeenCalledOnce(); expect(h.microphone).toHaveBeenCalledExactlyOnceWith(true);
  expect(h.shutdown).toHaveBeenCalledExactlyOnceWith(1);
  if (timing === 'after-tap') { h.reply.resolve(true); await flush(); }
  expect(h.message).not.toHaveBeenCalled(); expect(h.state().screen).toBe('listening');
  expect(h.state().pageIndex).toBe(1); expect(h.state().response).toEqual(answer);
  await h.close();
});

it.each(['pending', 'settled'] as const)('allows a distinct single tap without foreground notifications while the host reply is %s', async timing => {
  const h = await setup(); h.emit(Event.DOUBLE_CLICK_EVENT); await flush();
  h.emit(Event.CLICK_EVENT); expect(h.bootstrap).not.toHaveBeenCalled(); // same gesture burst
  await vi.advanceTimersByTimeAsync(700);
  if (timing === 'settled') { h.reply.resolve(true); await flush(); }
  h.emit(Event.CLICK_EVENT); await flush(); // resolution must not restart the cooldown
  expect(h.bootstrap).toHaveBeenCalledOnce(); expect(h.state().screen).toBe('listening');
  expect(h.message).not.toHaveBeenCalled(); await h.close();
});

it('accepts dismissal without a preceding enter, but still suppresses duplicate double taps', async () => {
  const h = await setup(); h.emit(Event.DOUBLE_CLICK_EVENT); await flush();
  h.reply.resolve(true); await flush();
  h.emit(Event.FOREGROUND_EXIT_EVENT);
  h.emit(Event.DOUBLE_CLICK_EVENT, 'textEvent'); await flush();
  expect(h.shutdown).toHaveBeenCalledOnce(); expect(h.bootstrap).not.toHaveBeenCalled();
  h.emit(Event.FOREGROUND_EXIT_EVENT); h.emit(Event.CLICK_EVENT); await flush();
  expect(h.bootstrap).toHaveBeenCalledOnce(); await h.close();
});

it('stops on overlay entry, waits for delayed cleanup, and only resumes on a deliberate tap', async () => {
  const h = await setup(); h.emit(Event.CLICK_EVENT); await flush();
  const off = deferred<boolean>(); h.microphone.mockImplementationOnce(() => off.promise);
  h.emit(Event.FOREGROUND_ENTER_EVENT); await flush();
  h.emit(Event.FOREGROUND_EXIT_EVENT); h.emit(Event.CLICK_EVENT); await flush();
  expect(h.bootstrap).toHaveBeenCalledOnce(); expect(h.conversation.busy).toBe(true);
  off.resolve(true); await flush();
  expect(h.conversation.busy).toBe(false); expect(h.bootstrap).toHaveBeenCalledOnce();
  h.emit(Event.CLICK_EVENT); await flush(); expect(h.bootstrap).toHaveBeenCalledTimes(2);
  expect(h.microphone.mock.calls).toEqual([[true], [false], [true]]);
  expect(h.submit).not.toHaveBeenCalled(); await h.close();
});

it.each(['system', 'abnormal', 'disconnect', 'connection-failed', 'offline'] as const)('never clears permanent closure after %s, even on later overlay dismissal', async reason => {
  const h = await setup(); h.emit(Event.CLICK_EVENT); await flush();
  if (reason === 'system' || reason === 'abnormal') {
    h.event({ sysEvent: { eventType: reason === 'system' ? Event.SYSTEM_EXIT_EVENT : Event.ABNORMAL_EXIT_EVENT }, textEvent: { eventType: Event.CLICK_EVENT } } as EvenHubEvent);
  } else if (reason === 'offline') h.conversation.stop(true); // main's offline/beforeunload cleanup
  else h.device({ connectType: reason === 'disconnect' ? DeviceConnectType.Disconnected : DeviceConnectType.ConnectionFailed } as DeviceStatus);
  await flush();
  h.emit(Event.FOREGROUND_ENTER_EVENT); h.emit(Event.FOREGROUND_EXIT_EVENT); h.emit(Event.CLICK_EVENT);
  h.conversation.start(config); h.handlers[0].onUtteranceComplete('stale'); await flush();
  expect(h.bootstrap).toHaveBeenCalledOnce(); expect(h.submit).not.toHaveBeenCalled();
  expect(h.microphone.mock.calls).toEqual([[true], [false]]); await h.close();
});

it.each([false, 'reject'] as const)('retains microphone quarantine after overlay dismissal and %s shutdown', async result => {
  const h = await setup(); h.emit(Event.CLICK_EVENT); await flush();
  if (result === false) h.microphone.mockResolvedValueOnce(false);
  else h.microphone.mockRejectedValueOnce(new Error('mic'));
  h.emit(Event.FOREGROUND_ENTER_EVENT); await flush();
  h.emit(Event.FOREGROUND_EXIT_EVENT); h.emit(Event.CLICK_EVENT); h.conversation.start(config); await flush();
  expect(h.bootstrap).toHaveBeenCalledOnce(); expect(h.error).toHaveBeenCalledWith(MIC_UNCERTAIN);
  expect(h.conversation.canExit).toBe(false); expect(h.submit).not.toHaveBeenCalled(); await h.close();
});

it('does not accept stale answers or rearm after overlay cancellation of pending work', async () => {
  const h = await setup(); const pending = deferred<GatewayPageResponse>(); h.submit.mockReturnValueOnce(pending.promise);
  h.emit(Event.CLICK_EVENT); await flush(); h.handlers[0].onUtteranceComplete('question'); await flush();
  expect(h.state().screen).toBe('thinking');
  h.emit(Event.FOREGROUND_ENTER_EVENT); h.emit(Event.FOREGROUND_EXIT_EVENT);
  pending.resolve({ ...answer, pages: ['stale'] }); await flush();
  expect(h.state().response).toEqual(answer); expect(h.bootstrap).toHaveBeenCalledOnce();
  h.emit(Event.CLICK_EVENT); await flush(); expect(h.bootstrap).toHaveBeenCalledTimes(2);
  h.handlers[0].onUtteranceComplete('duplicate'); await flush(); expect(h.submit).toHaveBeenCalledOnce();
  h.emit(Event.SCROLL_TOP_EVENT, 'textEvent'); expect(h.state().pageIndex).toBe(0);
  await h.close();
});

it('gives overlay lifecycle precedence over a click in the other envelope', async () => {
  const h = await setup();
  h.event({ sysEvent: { eventType: Event.FOREGROUND_ENTER_EVENT }, textEvent: {} } as EvenHubEvent);
  h.event({ textEvent: { eventType: Event.FOREGROUND_EXIT_EVENT }, sysEvent: {} } as EvenHubEvent);
  await flush(); expect(h.bootstrap).not.toHaveBeenCalled();
  h.emit(Event.CLICK_EVENT); await flush(); expect(h.bootstrap).toHaveBeenCalledOnce(); await h.close();
});
