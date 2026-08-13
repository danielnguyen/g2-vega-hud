import { DeepgramClient } from '@deepgram/sdk';
import type {
  SpeechToTextHandlers,
  SpeechToTextProvider,
  SpeechToTextSession
} from '../speechToText';

const FLUX_MODEL = 'flux-general-en';
const PCM_ENCODING = 'linear16';
const SAMPLE_RATE = 16_000;
const PCM_BYTES_PER_SAMPLE = 2;
const FLUX_CHUNK_MS = 80;
const FLUX_CHUNK_BYTES = (SAMPLE_RATE * PCM_BYTES_PER_SAMPLE * FLUX_CHUNK_MS) / 1_000;

type DeepgramConnection = Awaited<ReturnType<DeepgramClient['listen']['v2']['connect']>>;

export class DeepgramSpeechToTextProvider implements SpeechToTextProvider {
  async start(
    token: string,
    handlers: SpeechToTextHandlers
  ): Promise<SpeechToTextSession> {
    const client = new DeepgramClient({ accessToken: token, reconnect: false });
    const connection = await client.listen.v2.connect({
      model: FLUX_MODEL,
      encoding: PCM_ENCODING,
      sample_rate: SAMPLE_RATE,
      reconnectAttempts: 0,
      connectionTimeoutInSeconds: 10
    });
    const session = new DeepgramSpeechToTextSession(connection, handlers);

    connection.connect();
    try {
      await connection.waitForOpen();
    } catch {
      session.cancel();
      throw new Error('speech_connection_failed');
    }

    return session;
  }
}

class DeepgramSpeechToTextSession implements SpeechToTextSession {
  private pendingPcm: Uint8Array<ArrayBufferLike> = new Uint8Array();
  private terminal = false;
  private utteranceCompleted = false;

  constructor(
    private readonly connection: DeepgramConnection,
    private readonly handlers: SpeechToTextHandlers
  ) {
    connection.on('message', (message) => {
      if (message.type === 'Error') {
        this.fail();
        return;
      }

      if (message.type !== 'TurnInfo') {
        return;
      }

      this.handlers.onTranscriptUpdate(message.transcript);

      if (message.event === 'EndOfTurn' && !this.utteranceCompleted) {
        this.utteranceCompleted = true;
        this.handlers.onUtteranceComplete(message.transcript.trim());
      }
    });
    connection.on('error', () => this.fail());
    connection.on('close', () => {
      if (!this.terminal && !this.utteranceCompleted) {
        this.fail();
      }
    });
  }

  sendPcm(chunk: Uint8Array): void {
    if (this.terminal || chunk.byteLength === 0) {
      return;
    }

    this.pendingPcm = appendBytes(this.pendingPcm, chunk);
    while (this.pendingPcm.byteLength >= FLUX_CHUNK_BYTES) {
      this.connection.sendMedia(this.pendingPcm.slice(0, FLUX_CHUNK_BYTES));
      this.pendingPcm = this.pendingPcm.slice(FLUX_CHUNK_BYTES);
    }
  }

  finish(): void {
    if (this.terminal) {
      return;
    }

    this.terminal = true;
    try {
      this.flushPendingPcm();
      this.connection.sendCloseStream({ type: 'CloseStream' });
    } finally {
      this.connection.close();
    }
  }

  cancel(): void {
    if (this.terminal) {
      return;
    }

    this.terminal = true;
    this.pendingPcm = new Uint8Array();
    this.connection.close();
  }

  private flushPendingPcm(): void {
    if (this.pendingPcm.byteLength > 0) {
      this.connection.sendMedia(this.pendingPcm);
      this.pendingPcm = new Uint8Array();
    }
  }

  private fail(): void {
    if (this.terminal) {
      return;
    }

    this.terminal = true;
    this.pendingPcm = new Uint8Array();
    this.connection.close();
    this.handlers.onError();
  }
}

function appendBytes(
  left: Uint8Array<ArrayBufferLike>,
  right: Uint8Array<ArrayBufferLike>
): Uint8Array<ArrayBufferLike> {
  const combined = new Uint8Array(left.byteLength + right.byteLength);
  combined.set(left, 0);
  combined.set(right, left.byteLength);
  return combined;
}
