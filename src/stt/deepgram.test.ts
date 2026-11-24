import { describe, expect, it, vi } from 'vitest';
import { DeepgramSpeechToTextProvider } from './deepgram';
const mock = vi.hoisted(() => ({ connect: vi.fn(), options: vi.fn() }));
vi.mock('@deepgram/sdk', () => ({ DeepgramClient: class {
  constructor(options: unknown) { mock.options(options); }
  listen = { v2: { connect: mock.connect } };
} }));
function setup() {
  const callbacks: Record<string, (event: any) => void> = {};
  let open!: () => void;
  let fail!: (error: Error) => void;
  const pending = new Promise<void>((yes, no) => { open = yes; fail = no; });
  const socket = {
    on: vi.fn((event: string, callback: (value: any) => void) => { callbacks[event] = callback; }),
    connect: vi.fn(), waitForOpen: vi.fn(() => pending),
    close: vi.fn(() => { fail(new Error('closed')); }), sendMedia: vi.fn(), sendCloseStream: vi.fn()
  };
  mock.connect.mockResolvedValueOnce(socket);
  const handlers = { onTranscriptUpdate: vi.fn(), onUtteranceComplete: vi.fn(), onError: vi.fn() };
  return { socket, callbacks, handlers, open };
}
describe('Deepgram single-utterance adapter', () => {
  it('keeps Flux PCM contract, closes on cancel, and ignores late messages', async () => {
    const { socket, callbacks, handlers, open } = setup();
    const pending = new DeepgramSpeechToTextProvider().start('fresh-token', handlers);
    open(); const session = await pending;
    expect(mock.options).toHaveBeenLastCalledWith({ accessToken: 'fresh-token', reconnect: false });
    expect(mock.connect).toHaveBeenLastCalledWith({ model: 'flux-general-en', encoding: 'linear16', sample_rate: 16000, reconnectAttempts: 0, connectionTimeoutInSeconds: 10 });
    session.sendPcm(new Uint8Array(2560)); expect(socket.sendMedia).toHaveBeenCalledTimes(1);
    callbacks.message({ type: 'TurnInfo', event: 'EndOfTurn', transcript: 'hello' });
    callbacks.message({ type: 'TurnInfo', event: 'EndOfTurn', transcript: 'duplicate' });
    expect(handlers.onUtteranceComplete).toHaveBeenCalledTimes(1);
    session.cancel(); callbacks.message({ type: 'TurnInfo', event: 'EndOfTurn', transcript: 'stale' });
    expect(handlers.onTranscriptUpdate).toHaveBeenCalledTimes(2);
    expect(socket.close).toHaveBeenCalledTimes(1);
  });

  it('closes the socket when cancelled before open', async () => {
    const { socket, handlers } = setup(); const controller = new AbortController();
    const pending = new DeepgramSpeechToTextProvider().start('token', handlers, controller.signal);
    await Promise.resolve(); controller.abort();
    await expect(pending).rejects.toThrow('speech_connection_failed');
    expect(socket.close).toHaveBeenCalledTimes(1);
  });
});
