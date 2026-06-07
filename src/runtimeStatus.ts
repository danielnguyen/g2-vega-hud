import type { Mode } from './types';

export type RuntimeStatus = {
  configured: boolean;
  connected: boolean | null;
  lastCheckedAt: string | null;
  lastRequestAt: string | null;
  lastMode: Mode | null;
  lastStatus: 'ok' | 'degraded' | 'failed' | null;
  lastError: string | null;
};

export function initialRuntimeStatus(configured: boolean): RuntimeStatus {
  return {
    configured,
    connected: null,
    lastCheckedAt: null,
    lastRequestAt: null,
    lastMode: null,
    lastStatus: null,
    lastError: null
  };
}

export function markConfigured(status: RuntimeStatus, configured: boolean): RuntimeStatus {
  return {
    ...status,
    configured,
    connected: configured ? status.connected : null
  };
}

export function markConnectionCheck(
  status: RuntimeStatus,
  outcome: 'start' | 'success' | 'failure',
  nextStatus?: RuntimeStatus['lastStatus'],
  error?: string
): RuntimeStatus {
  const now = new Date().toISOString();

  if (outcome === 'start') {
    return {
      ...status,
      lastCheckedAt: now,
      lastMode: 'status',
      lastError: null
    };
  }

  if (outcome === 'success') {
    return {
      ...status,
      connected: true,
      lastCheckedAt: now,
      lastMode: 'status',
      lastStatus: nextStatus ?? 'ok',
      lastError: null
    };
  }

  return {
    ...status,
    connected: false,
    lastCheckedAt: now,
    lastMode: 'status',
    lastStatus: 'failed',
    lastError: error ?? 'Gateway request failed.'
  };
}

export function markRequestStart(status: RuntimeStatus, mode: Mode): RuntimeStatus {
  return {
    ...status,
    lastMode: mode,
    lastError: null
  };
}

export function markRequestSuccess(
  status: RuntimeStatus,
  mode: Mode,
  requestStatus: RuntimeStatus['lastStatus']
): RuntimeStatus {
  return {
    ...status,
    connected: true,
    lastRequestAt: new Date().toISOString(),
    lastMode: mode,
    lastStatus: requestStatus ?? 'ok',
    lastError: null
  };
}

export function markRequestFailure(status: RuntimeStatus, mode: Mode, error: string): RuntimeStatus {
  return {
    ...status,
    connected: false,
    lastRequestAt: new Date().toISOString(),
    lastMode: mode,
    lastStatus: 'failed',
    lastError: error
  };
}
