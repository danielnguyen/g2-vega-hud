import type { AppConfig } from './config';
import { createSttSession, pollWork, sendTurn } from './gatewayClient';
import { createSpeechToTextProvider, type SpeechToTextSession } from './speechToText';
import type { GatewayPageResponse } from './types';

export const INITIAL_SILENCE_MS = 30_000;
export const CAPTURE_LIMIT_MS = 60_000;
const MIC_TIMEOUT_MS = 5_000;
export const MIC_UNCERTAIN = 'Microphone shutdown unconfirmed. Exit the app before trying again.';

type Dependencies = {
  ready(): boolean;
  microphone(enabled: boolean): Promise<boolean>;
  phase(phase: 'connecting' | 'listening' | 'thinking' | 'stopping', transcript?: string): void;
  answer(response: GatewayPageResponse): void;
  stopped(message: string): void;
  error(message: string): void;
  bootstrap?: typeof createSttSession;
  provider?: typeof createSpeechToTextProvider;
  submit?: typeof sendTurn;
  poll?: typeof pollWork;
};

// One deliberate session owns the full capture -> cleanup -> CCP -> rearm loop.
// A new session cannot start until the previous loop has finished its cleanup.
export class Conversation {
  private controller: AbortController | null = null;
  private capture: SpeechToTextSession | null = null;
  private acceptingAudio = false;
  private micQueue: Promise<unknown> = Promise.resolve();
  private micUncertain = false;
  private conversationId: string | undefined;
  private exited = false;

  constructor(private readonly deps: Dependencies) {}

  get busy(): boolean { return this.controller !== null; }

  start(config: AppConfig): void {
    if (this.busy || this.exited) return;
    if (this.micUncertain) { this.deps.error(MIC_UNCERTAIN); return; }
    if (!this.deps.ready()) { this.deps.error('G2 microphone or startup page unavailable.'); return; }
    const controller = new AbortController();
    this.controller = controller;
    void this.run(config, controller);
  }

  stop(exit = false): void {
    this.exited ||= exit;
    this.acceptingAudio = false;
    if (!this.controller || this.controller.signal.aborted) return;
    this.controller.abort();
    if (!exit) this.deps.phase('stopping');
  }

  sendPcm(chunk: Uint8Array): void {
    if (this.acceptingAudio) {
      try { this.capture?.sendPcm(chunk); }
      catch { this.stop(); }
    }
  }

  private async run(config: AppConfig, controller: AbortController): Promise<void> {
    const signal = controller.signal;
    try {
      while (!signal.aborted) {
        const transcript = await this.listen(config, signal);
        signal.throwIfAborted();
        if (!transcript.trim()) { this.deps.stopped('Nothing heard. Tap to resume.'); return; }
        this.deps.phase('thinking');
        const submission = await (this.deps.submit ?? sendTurn)(config, transcript.trim(), {
          inputMode: 'voice_transcribed',
          ...(this.conversationId ? { conversationId: this.conversationId } : {}),
          signal
        });
        signal.throwIfAborted();
        let response: GatewayPageResponse;
        if ('delivery_status' in submission) {
          this.conversationId = submission.conversation_id;
          const work = await (this.deps.poll ?? pollWork)(config, submission, 1000, signal);
          signal.throwIfAborted();
          if (work.state !== 'completed') throw new Error('Gateway request failed.');
          response = {
            request_id: work.request_id, conversation_id: work.conversation_id,
            title: submission.title, pages: work.pages, source: work.source, raw_length: work.raw_length
          };
        } else response = submission;
        if (response.conversation_disposition === 'non_current') this.conversationId = undefined;
        else if (response.status !== 'failed' && response.conversation_id) this.conversationId = response.conversation_id;
        if (response.status === 'failed') throw new Error('Gateway request failed.');
        if (!Array.isArray(response.pages) || !response.pages.length ||
            !response.pages.every(page => typeof page === 'string' && page.trim())) {
          throw new Error('Gateway returned no renderable pages.');
        }
        this.deps.answer(response);
      }
    } catch (error) {
      if (!this.exited) {
        if (this.micUncertain) this.deps.error(MIC_UNCERTAIN);
        else if (signal.aborted) this.deps.stopped('Stopped. Tap to resume.');
        else if (error instanceof CaptureIdle) this.deps.stopped(error.message);
        else this.deps.error(userMessage(error));
      }
    } finally {
      controller.abort();
      this.controller = null;
    }
  }

  private async listen(config: AppConfig, signal: AbortSignal): Promise<string> {
    this.deps.phase('connecting');
    let session: SpeechToTextSession | null = null;
    let micAttempted = false;
    let settled = false;
    let silence: ReturnType<typeof setTimeout> | undefined;
    let absolute: ReturnType<typeof setTimeout> | undefined;
    let resolve!: (text: string) => void;
    let reject!: (reason: unknown) => void;
    const utterance = new Promise<string>((yes, no) => { resolve = yes; reject = no; });
    // Errors can arrive while the bridge enable acknowledgement is still pending.
    void utterance.catch(() => undefined);
    const finish = (text?: string, error?: unknown) => {
      if (settled) return;
      settled = true;
      this.acceptingAudio = false;
      if (error) reject(error); else resolve(text ?? '');
    };
    const abort = () => finish(undefined, signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    try {
      const bootstrap = await (this.deps.bootstrap ?? createSttSession)(config, undefined, signal);
      signal.throwIfAborted();
      const provider = (this.deps.provider ?? createSpeechToTextProvider)(bootstrap.provider);
      if (!provider) throw new Error('Speech service unavailable.');
      const opening = provider.start(bootstrap.token, {
        onTranscriptUpdate: text => {
          if (settled || signal.aborted || !this.acceptingAudio) return;
          if (text.trim()) clearTimeout(silence);
          this.deps.phase('listening', text);
        },
        onUtteranceComplete: text => {
          if (this.acceptingAudio && !signal.aborted) finish(text);
        },
        onError: () => finish(undefined, new Error('Speech service unavailable.'))
      }, signal);
      // An adapter that resolves after cancellation must still release its socket.
      void opening.then(late => {
        if (signal.aborted || settled) { try { late.cancel(); } catch { /* Already closed. */ } }
      }, () => undefined);
      session = await bounded(opening, 20_000, signal);
      signal.throwIfAborted();
      if (settled) return await utterance;
      this.capture = session;
      micAttempted = true;
      const enabled = await this.microphone(true);
      signal.throwIfAborted();
      if (!enabled) throw new Error('Microphone could not start.');
      if (settled) return await utterance;
      this.acceptingAudio = true;
      this.deps.phase('listening');
      silence = setTimeout(() => finish(undefined, new CaptureIdle('Nothing heard. Tap to resume.')), INITIAL_SILENCE_MS);
      absolute = setTimeout(() => finish(undefined, new CaptureIdle('Capture time limit reached. Tap to resume.')), CAPTURE_LIMIT_MS);
      return await utterance;
    } finally {
      settled = true;
      this.acceptingAudio = false;
      this.capture = null;
      clearTimeout(silence);
      clearTimeout(absolute);
      signal.removeEventListener('abort', abort);
      try { session?.cancel(); } catch { /* Continue microphone cleanup. */ }
      if (micAttempted) {
        if (!signal.aborted) this.deps.phase('stopping');
        const disabled = await this.microphone(false).catch(() => false);
        if (!disabled) {
          this.micUncertain = true;
          // One bounded retry, serialized behind any outstanding bridge command.
          await this.microphone(false).catch(() => false);
          throw new Error(MIC_UNCERTAIN);
        }
        if (this.micUncertain) throw new Error(MIC_UNCERTAIN);
      }
    }
  }

  private async microphone(enabled: boolean): Promise<boolean> {
    const operation = this.micQueue.then(() => this.deps.microphone(enabled));
    this.micQueue = operation.catch(() => undefined);
    try { return await bounded(operation, MIC_TIMEOUT_MS); }
    catch (error) {
      this.micUncertain = true;
      throw error;
    }
  }
}

class CaptureIdle extends Error {}

function userMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (['Microphone could not start.', 'Speech service unavailable.', 'Gateway returned no renderable pages.'].includes(message)) return message;
  if (message === 'Gateway timed out') return 'Gateway timed out. Tap to try again.';
  if (message === 'Could not reach gateway') return 'Could not reach gateway.';
  return 'Conversation failed. Tap to return home.';
}

function bounded<T>(promise: Promise<T>, ms: number, signal?: AbortSignal): Promise<T> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
    const abort = () => { cleanup(); reject(signal?.reason); };
    const timer = setTimeout(() => { cleanup(); reject(new Error('Operation timed out')); }, ms);
    signal?.addEventListener('abort', abort, { once: true });
    promise.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
  });
}
