import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';
import { retryBounded } from '../boundedRetry';

export type EvenBridge = Awaited<ReturnType<typeof waitForEvenAppBridge>>;

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 150;
let bridgePromise: Promise<EvenBridge> | null = null;

export function getEvenBridge(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<EvenBridge> {
  if (!bridgePromise) {
    bridgePromise = withTimeout(waitForEvenAppBridge(), timeoutMs).catch(() => {
      bridgePromise = null;
      throw new Error('Even bridge unavailable.');
    });
  }

  return bridgePromise;
}

export function waitForEvenBridge(
  timeoutMs = DEFAULT_TIMEOUT_MS,
  attempts = DEFAULT_ATTEMPTS,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS
): Promise<EvenBridge> {
  return retryBounded(() => getEvenBridge(timeoutMs), { attempts, delayMs: retryDelayMs });
}

export function resetEvenBridge(): void {
  bridgePromise = null;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('Even bridge unavailable.')), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
