import type { AppConfig } from './config';
import type { GatewayPageResponse, SttSessionBootstrap } from './types';

const DEFAULT_TIMEOUT_MS = 20_000;
const TIMEOUT_ERROR = 'Gateway timed out';
const NETWORK_ERROR = 'Could not reach gateway';

export type SendTurnOptions = {
  inputMode?: 'tap_menu' | 'typed' | 'voice_transcribed';
  conversationId?: string;
};

export async function sendTurn(
  config: AppConfig,
  text: string,
  options: SendTurnOptions = {},
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<GatewayPageResponse> {
  return fetchGatewayJson<GatewayPageResponse>(
    config,
    '/g2/turn',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode: 'ask',
        text,
        input_mode: options.inputMode ?? 'typed',
        ...(options.conversationId ? { conversation_id: options.conversationId } : {})
      })
    },
    timeoutMs
  );
}

export async function createSttSession(
  config: AppConfig,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<SttSessionBootstrap> {
  const result = await fetchGatewayJson<unknown>(
    config,
    '/g2/stt/session',
    { method: 'POST' },
    timeoutMs
  );

  if (!isSttSessionBootstrap(result)) {
    throw new Error('Invalid STT session response');
  }

  return result;
}

export async function checkGateway(
  config: AppConfig,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<void> {
  await fetchGatewayJson<unknown>(config, '/g2/status', { method: 'GET' }, timeoutMs);
}

async function fetchGatewayJson<T>(
  config: AppConfig,
  path: string,
  init: RequestInit,
  timeoutMs: number
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${config.gatewayUrl}${path}`, {
      ...init,
      headers: {
        ...init.headers,
        authorization: `Bearer ${config.authValue}`
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Gateway returned HTTP ${response.status}`);
    }

    return (await response.json()) as T;
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(TIMEOUT_ERROR);
    }

    if (error instanceof TypeError) {
      throw new Error(NETWORK_ERROR);
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function isSttSessionBootstrap(value: unknown): value is SttSessionBootstrap {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.provider === 'string' &&
    candidate.provider.length > 0 &&
    typeof candidate.token === 'string' &&
    candidate.token.length > 0 &&
    typeof candidate.expires_in === 'number' &&
    Number.isFinite(candidate.expires_in) &&
    candidate.expires_in > 0
  );
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
