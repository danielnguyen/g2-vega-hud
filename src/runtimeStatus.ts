export type RuntimeOperation = 'conversation' | 'status-check';

export type RuntimeStatus = {
  configured: boolean;
  connected: boolean | null;
  lastCheckedAt: string | null;
  lastRequestAt: string | null;
  lastOperation: RuntimeOperation | null;
  lastStatus: 'ok' | 'degraded' | 'failed' | null;
  lastError: string | null;
};

export function initialRuntimeStatus(configured: boolean): RuntimeStatus {
  return {
    configured,
    connected: null,
    lastCheckedAt: null,
    lastRequestAt: null,
    lastOperation: null,
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
      lastOperation: 'status-check',
      lastError: null
    };
  }

  if (outcome === 'success') {
    return {
      ...status,
      connected: true,
      lastCheckedAt: now,
      lastOperation: 'status-check',
      lastStatus: nextStatus ?? 'ok',
      lastError: null
    };
  }

  return {
    ...status,
    connected: false,
    lastCheckedAt: now,
    lastOperation: 'status-check',
    lastStatus: 'failed',
    lastError: error ?? 'Gateway request failed.'
  };
}

export function markRequestStart(status: RuntimeStatus): RuntimeStatus {
  return {
    ...status,
    lastOperation: 'conversation',
    lastError: null
  };
}

export function markRequestSuccess(
  status: RuntimeStatus,
  requestStatus: RuntimeStatus['lastStatus']
): RuntimeStatus {
  return {
    ...status,
    connected: true,
    lastRequestAt: new Date().toISOString(),
    lastOperation: 'conversation',
    lastStatus: requestStatus ?? 'ok',
    lastError: null
  };
}

export function markRequestFailure(status: RuntimeStatus, error: string): RuntimeStatus {
  return {
    ...status,
    connected: false,
    lastRequestAt: new Date().toISOString(),
    lastOperation: 'conversation',
    lastStatus: 'failed',
    lastError: error
  };
}
