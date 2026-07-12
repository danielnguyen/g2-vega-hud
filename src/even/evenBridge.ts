import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';

export type EvenBridge = Awaited<ReturnType<typeof waitForEvenAppBridge>>;

const DEFAULT_TIMEOUT_MS = 5000;
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
