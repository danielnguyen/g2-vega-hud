import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';

export type EvenBridge = Awaited<ReturnType<typeof waitForEvenAppBridge>>;

type WaitForEvenBridgeOptions = {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
};

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_RETRIES = 4;
const DEFAULT_RETRY_DELAY_MS = 250;

let bridgePromise: Promise<EvenBridge> | null = null;

export function getEvenBridge(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<EvenBridge> {
  if (!bridgePromise) {
    bridgePromise = withTimeout(waitForEvenAppBridge(), timeoutMs).catch((error) => {
      bridgePromise = null;
      throw error;
    });
  }

  return bridgePromise;
}

export async function waitForEvenBridge({
  timeoutMs = DEFAULT_TIMEOUT_MS,
  retries = DEFAULT_RETRIES,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS
}: WaitForEvenBridgeOptions = {}): Promise<EvenBridge> {
  let lastError: unknown;

  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      return await getEvenBridge(timeoutMs);
    } catch (error) {
      lastError = error;

      if (attempt === retries - 1) {
        break;
      }

      await delay(retryDelayMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Even bridge unavailable');
}

function delay(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, timeoutMs);
  });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('Even bridge unavailable')), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
