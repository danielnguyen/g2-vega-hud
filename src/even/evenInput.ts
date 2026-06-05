import { OsEventTypeList, waitForEvenAppBridge, type EvenHubEvent } from '@evenrealities/even_hub_sdk';
import type { InputEventName } from '../input';

type EvenInputBridgeLike = {
  onEvenHubEvent(callback: (event: EvenHubEvent) => void): () => void;
};

export async function bindEvenInput(
  handler: (eventName: InputEventName) => void,
  timeoutMs = 1500
): Promise<(() => void) | null> {
  try {
    const bridge = await withTimeout(waitForEvenAppBridge(), timeoutMs);
    const unsubscribe = (bridge as unknown as EvenInputBridgeLike).onEvenHubEvent((event) => {
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

function mapEvenHubEvent(event: EvenHubEvent): InputEventName | null {
  const sysEvent = event.sysEvent;
  const textEvent = event.textEvent;
  const sysType = sysEvent?.eventType;
  const textType = textEvent?.eventType;

  console.debug('[even-input]', {
    sysType: sysType ?? null,
    textType: textType ?? null,
    event
  });

  if (sysType === OsEventTypeList.DOUBLE_CLICK_EVENT) {
    return 'doublePress';
  }

  if (textType === OsEventTypeList.DOUBLE_CLICK_EVENT) {
    return 'doublePress';
  }

  if (textType === OsEventTypeList.SCROLL_TOP_EVENT) {
    return 'up';
  }

  if (textType === OsEventTypeList.SCROLL_BOTTOM_EVENT) {
    return 'down';
  }

  if (textEvent && (textType ?? OsEventTypeList.CLICK_EVENT) === OsEventTypeList.CLICK_EVENT) {
    return 'press';
  }

  if (sysEvent && (sysType ?? OsEventTypeList.CLICK_EVENT) === OsEventTypeList.CLICK_EVENT) {
    return 'press';
  }

  if (isLifecycleEvent(sysType) || isLifecycleEvent(textType)) {
    console.debug('[even-input] lifecycle', {
      sysType: sysType ?? null,
      textType: textType ?? null,
      event
    });
  }

  return null;
}

function isLifecycleEvent(eventType: OsEventTypeList | undefined): boolean {
  return (
    eventType === OsEventTypeList.FOREGROUND_ENTER_EVENT ||
    eventType === OsEventTypeList.FOREGROUND_EXIT_EVENT ||
    eventType === OsEventTypeList.ABNORMAL_EXIT_EVENT ||
    eventType === OsEventTypeList.SYSTEM_EXIT_EVENT
  );
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
