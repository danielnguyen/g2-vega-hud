import { OsEventTypeList, waitForEvenAppBridge, type EvenHubEvent } from '@evenrealities/even_hub_sdk';
import type { InputEventName } from '../input';
import type { GlassesInputDebugEvent } from '../types';

type EvenInputBridgeLike = {
  onEvenHubEvent(callback: (event: EvenHubEvent) => void): () => void;
};

export type NormalizedEvenInputEvent = GlassesInputDebugEvent & {
  mappedAction: InputEventName | null;
};

export async function bindEvenInput(
  handler: (event: NormalizedEvenInputEvent) => void,
  timeoutMs = 1500
): Promise<(() => void) | null> {
  try {
    const bridge = await withTimeout(waitForEvenAppBridge(), timeoutMs);
    const unsubscribe = (bridge as unknown as EvenInputBridgeLike).onEvenHubEvent((event) => {
      handler(normalizeEvenHubEvent(event));
    });

    return unsubscribe;
  } catch {
    return null;
  }
}

function normalizeEvenHubEvent(event: EvenHubEvent): NormalizedEvenInputEvent {
  const timestamp = new Date().toISOString();
  const sysEvent = event.sysEvent;
  const textEvent = event.textEvent;
  const sysType = sysEvent?.eventType;
  const textType = textEvent?.eventType;
  const channel = textEvent ? 'textEvent' : sysEvent ? 'sysEvent' : 'unknown';
  const type = textType ?? sysType;
  const eventType = eventTypeLabel(type);
  const mappedAction = mapEvenHubEvent(textType, sysType, Boolean(textEvent), Boolean(sysEvent));
  const target = textEvent?.containerName ?? null;
  const eventSource = eventSourceLabel(sysEvent?.eventSource);
  const summaryParts = [channel, eventType];

  if (mappedAction) {
    summaryParts.push(`-> ${mappedAction}`);
  }

  if (target) {
    summaryParts.push(`(${target})`);
  }

  if (eventSource) {
    summaryParts.push(`[${eventSource}]`);
  }

  console.debug('[even-input]', {
    channel,
    mappedAction,
    sysType: sysType ?? null,
    textType: textType ?? null,
    event
  });

  if (isLifecycleEvent(sysType) || isLifecycleEvent(textType)) {
    console.debug('[even-input] lifecycle', {
      sysType: sysType ?? null,
      textType: textType ?? null,
      event
    });
  }

  return {
    timestamp,
    channel,
    eventType,
    mappedAction,
    eventSource,
    target,
    summary: summaryParts.join(' ')
  };
}

function mapEvenHubEvent(
  textType: OsEventTypeList | undefined,
  sysType: OsEventTypeList | undefined,
  hasTextEvent: boolean,
  hasSysEvent: boolean
): InputEventName | null {
  if (sysType === OsEventTypeList.DOUBLE_CLICK_EVENT || textType === OsEventTypeList.DOUBLE_CLICK_EVENT) {
    return 'doublePress';
  }

  if (textType === OsEventTypeList.SCROLL_TOP_EVENT) {
    return 'up';
  }

  if (textType === OsEventTypeList.SCROLL_BOTTOM_EVENT) {
    return 'down';
  }

  if (hasTextEvent && (textType ?? OsEventTypeList.CLICK_EVENT) === OsEventTypeList.CLICK_EVENT) {
    return 'press';
  }

  if (hasSysEvent && (sysType ?? OsEventTypeList.CLICK_EVENT) === OsEventTypeList.CLICK_EVENT) {
    return 'press';
  }

  return null;
}

function eventTypeLabel(eventType: OsEventTypeList | undefined): string {
  switch (eventType) {
    case OsEventTypeList.CLICK_EVENT:
      return 'CLICK_EVENT';
    case OsEventTypeList.SCROLL_TOP_EVENT:
      return 'SCROLL_TOP_EVENT';
    case OsEventTypeList.SCROLL_BOTTOM_EVENT:
      return 'SCROLL_BOTTOM_EVENT';
    case OsEventTypeList.DOUBLE_CLICK_EVENT:
      return 'DOUBLE_CLICK_EVENT';
    case OsEventTypeList.FOREGROUND_ENTER_EVENT:
      return 'FOREGROUND_ENTER_EVENT';
    case OsEventTypeList.FOREGROUND_EXIT_EVENT:
      return 'FOREGROUND_EXIT_EVENT';
    case OsEventTypeList.ABNORMAL_EXIT_EVENT:
      return 'ABNORMAL_EXIT_EVENT';
    case OsEventTypeList.SYSTEM_EXIT_EVENT:
      return 'SYSTEM_EXIT_EVENT';
    case OsEventTypeList.IMU_DATA_REPORT:
      return 'IMU_DATA_REPORT';
    default:
      return `UNKNOWN_EVENT(${eventType ?? 'null'})`;
  }
}

function eventSourceLabel(eventSource: number | undefined): string | null {
  switch (eventSource) {
    case 0:
      return 'dummy';
    case 1:
      return 'glasses-right';
    case 2:
      return 'ring';
    case 3:
      return 'glasses-left';
    default:
      return null;
  }
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
