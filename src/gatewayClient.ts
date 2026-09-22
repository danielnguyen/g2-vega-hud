import type { AppConfig } from './config';
import type { GatewayDeferredResponse, GatewayPageResponse, GatewayTurnResponse, GatewayWorkResponse, SttSessionBootstrap } from './types';

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
): Promise<GatewayTurnResponse> {
  return fetchGatewayJson<GatewayTurnResponse>(
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
    timeoutMs,
    (value, status) => {
      if (status === 200 && isPageResponse(value)) return value;
      if (status === 202 && isDeferredResponse(value)) return value;
      throw new Error('Invalid gateway turn response');
    }
  );
}

export async function getWork(
  config: AppConfig, workId: string, conversationId: string
): Promise<GatewayWorkResponse> {
  if (!isUuid(workId) || !isUuid(conversationId)) throw new Error('Invalid work identity');
  return fetchGatewayJson<GatewayWorkResponse>(
    config,
    `/g2/work-items/${encodeURIComponent(workId)}?conversation_id=${encodeURIComponent(conversationId)}`,
    { method: 'GET' },
    DEFAULT_TIMEOUT_MS,
    (value, status) => {
      if (status !== 200 || !isWorkResponse(value) ||
          value.work_id !== workId || value.conversation_id !== conversationId) {
        throw new Error('Invalid gateway work response');
      }
      return value;
    }
  );
}

export async function pollWork(
  config: AppConfig, deferred: GatewayDeferredResponse, pollIntervalMs = 1000
): Promise<Extract<GatewayWorkResponse, { state: 'completed' | 'failed' }>> {
  const { work_id, conversation_id, request_id } = deferred;
  while (true) {
    await new Promise<void>((resolve) => setTimeout(resolve, pollIntervalMs));
    const work = await getWork(config, work_id, conversation_id);
    if (work.request_id !== request_id) throw new Error('Invalid gateway work response');
    if (work.state === 'completed' || work.state === 'failed') return work;
  }
}

export async function createSttSession(
  config: AppConfig,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<SttSessionBootstrap> {
  const result = await fetchGatewayJson<unknown>(
    config,
    '/g2/stt/session',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({})
    },
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
  timeoutMs: number,
  validate?: (value: unknown, status: number) => T
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

    const value: unknown = await response.json();
    return validate ? validate(value, response.status) : value as T;
  } catch (error) {
    if (validate && error instanceof SyntaxError) {
      throw new Error('Invalid gateway response');
    }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function onlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
}

function isRequestId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 120 && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value);
}

function hasPages(value: Record<string, unknown>): boolean {
  return Array.isArray(value.pages) && value.pages.length > 0 &&
    value.pages.every((page) => typeof page === 'string' && /\S/.test(page)) &&
    typeof value.raw_length === 'number' && Number.isSafeInteger(value.raw_length) && value.raw_length >= 0;
}

function isPageResponse(value: unknown): value is GatewayPageResponse {
  return isRecord(value) && onlyKeys(value, ['request_id', 'conversation_id', 'title', 'pages', 'source', 'status', 'conversation_disposition', 'raw_length']) &&
    typeof value.request_id === 'string' && value.request_id.length > 0 &&
    (value.conversation_id === undefined || typeof value.conversation_id === 'string') &&
    typeof value.title === 'string' && value.source === 'chat-orchestrator' && hasPages(value) &&
    (value.status === undefined || ['ok', 'degraded', 'failed'].includes(value.status as string)) &&
    (value.conversation_disposition === undefined || value.conversation_disposition === 'non_current');
}

function isDeferredResponse(value: unknown): value is GatewayDeferredResponse {
  return isRecord(value) && onlyKeys(value, ['request_id', 'conversation_id', 'work_id', 'delivery_status', 'title', 'source']) &&
    isRequestId(value.request_id) && isUuid(value.conversation_id) && isUuid(value.work_id) &&
    value.delivery_status === 'pending' && typeof value.title === 'string' && value.source === 'chat-orchestrator';
}

function isWorkResponse(value: unknown): value is GatewayWorkResponse {
  if (!isRecord(value) || !isUuid(value.work_id) || !isUuid(value.conversation_id) ||
      !isRequestId(value.request_id) || value.source !== 'chat-orchestrator') return false;
  const keys = ['work_id', 'conversation_id', 'request_id', 'state', 'source'];
  if (value.state === 'pending' || value.state === 'running') return onlyKeys(value, keys);
  if (value.state === 'completed') return onlyKeys(value, [...keys, 'pages', 'raw_length']) && hasPages(value);
  if (value.state === 'failed') {
    return onlyKeys(value, [...keys, 'failure_code']) &&
      ['interrupted', 'execution_failed', 'dependency_unavailable', 'authority_unavailable'].includes(value.failure_code as string);
  }
  return false;
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
