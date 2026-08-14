import { DeepgramSpeechToTextProvider } from './stt/deepgram';

export type SpeechToTextHandlers = {
  onTranscriptUpdate(transcript: string): void;
  onUtteranceComplete(transcript: string): void;
  onError(): void;
};

export interface SpeechToTextSession {
  sendPcm(chunk: Uint8Array): void;
  finish(): void;
  cancel(): void;
}

export interface SpeechToTextProvider {
  start(token: string, handlers: SpeechToTextHandlers): Promise<SpeechToTextSession>;
}

export function createSpeechToTextProvider(provider: string): SpeechToTextProvider | null {
  if (provider === 'deepgram') {
    return new DeepgramSpeechToTextProvider();
  }

  return null;
}
