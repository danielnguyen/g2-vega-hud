import type { AppConfig } from './config';
import type { GatewayPageResponse, Mode } from './types';

const DEFAULT_TIMEOUT_MS = 20_000;
const TIMEOUT_ERROR = 'Gateway timed out';
const NETWORK_ERROR = 'Could not reach gateway';

export async function sendTurn(
  config: AppConfig,
  mode: Mode,
  text: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<GatewayPageResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${config.gatewayUrl}/g2/turn`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.authValue}`
      },
      body: JSON.stringify({ mode, text }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Gateway returned HTTP ${response.status}`);
    }

    return (await response.json()) as GatewayPageResponse;
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

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
