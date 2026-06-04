import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';
import type { InputEventName } from '../input';

type EvenInputBridgeLike = {
  onEvenHubEvent(callback: (event: unknown) => void): () => void;
};

export async function bindEvenInput(
  handler: (eventName: InputEventName) => void,
  timeoutMs = 1500
): Promise<(() => void) | null> {
  try {
    const bridge = await withTimeout(waitForEvenAppBridge(), timeoutMs);
    const unsubscribe = (bridge as unknown as EvenInputBridgeLike).onEvenHubEvent((event) => {
      console.debug('EvenHub event:', event);

      const mapped = mapEvenHubEvent(event);
      if (mapped) {
        handler(mapped);
      }
    });

    return unsubscribe;
  } catch {
    return null;
  }
}

function mapEvenHubEvent(event: unknown): InputEventName | null {
  const record = asRecord(event);
  const listEvent = asRecord(record.listEvent);
  const textEvent = asRecord(record.textEvent);
  const sysEvent = asRecord(record.sysEvent);

  const haystack = JSON.stringify({ listEvent, textEvent, sysEvent }).toLowerCase();

  if (containsAny(haystack, ['double', 'dbl', 'two_click', 'twoclick'])) {
    return 'doublePress';
  }

  if (containsAny(haystack, ['swipeup', 'swipe_up', 'slideup', 'slide_up', 'up', 'previous', 'prev'])) {
    return 'up';
  }

  if (containsAny(haystack, ['swipedown', 'swipe_down', 'slidedown', 'slide_down', 'down', 'next'])) {
    return 'down';
  }

  if (containsAny(haystack, ['single', 'click', 'tap', 'press', 'select', 'confirm', 'enter'])) {
    return 'press';
  }

  if (listEvent.currentSelectItemName || listEvent.currentSelectIndex !== undefined) {
    return 'press';
  }

  if (Object.keys(textEvent).length > 0) {
    return 'press';
  }

  return null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null) {
    return value as Record<string, unknown>;
  }

  return {};
}

function containsAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle));
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
