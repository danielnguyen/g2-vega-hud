export type BoundedRetryOptions = {
  attempts: number;
  delayMs: number;
};

export async function retryBounded<T>(
  operation: () => Promise<T>,
  options: BoundedRetryOptions,
  wait: (delayMs: number) => Promise<void> = delay
): Promise<T> {
  const attempts = Math.max(1, Math.floor(options.attempts));
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await wait(options.delayMs);
    }
  }

  throw lastError;
}

function delay(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}
