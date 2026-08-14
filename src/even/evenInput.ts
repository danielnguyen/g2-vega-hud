import { OsEventTypeList, waitForEvenAppBridge, type EvenHubEvent } from '@evenrealities/even_hub_sdk';
import type { InputEventName } from '../input';
import type { GlassesInputDebugEvent } from '../types';

type EvenInputBridgeLike = {
  onEvenHubEvent(callback: (event: EvenHubEvent) => void): () => void;
  audioControl(enabled: boolean): Promise<boolean>;
};

export type NormalizedEvenInputEvent = GlassesInputDebugEvent & {
  mappedAction: InputEventName | null;
};

export type EvenInputHandlers = {
  onInput(event: NormalizedEvenInputEvent): void;
  onPcm(chunk: Uint8Array): void;
  onExit(): void;
};

export type EvenInputBinding = {
  setMicrophoneEnabled(enabled: boolean): Promise<void>;
  dispose(): void;
};

export async function bindEvenInput(
  handlers: EvenInputHandlers,
  timeoutMs = 1500
): Promise<EvenInputBinding | null> {
  try {
    const bridge = (await withTimeout(
      waitForEvenAppBridge(),
      timeoutMs
    )) as unknown as EvenInputBridgeLike;
    const unsubscribe = bridge.onEvenHubEvent((event) => {
      const pcm = event.audioEvent?.audioPcm;
      if (pcm) {
        handlers.onPcm(pcm);
      }

      if (!event.sysEvent && !event.textEvent) {
        return;
      }

      const normalized = normalizeEvenHubEvent(event);
      handlers.onInput(normalized);

      if (isExitEvent(eventTypeOf(event.sysEvent), eventTypeOf(event.textEvent))) {
        handlers.onExit();
      }
    });

    return {
      async setMicrophoneEnabled(enabled: boolean): Promise<void> {
        await bridge.audioControl(enabled);
      },
      dispose(): void {
        unsubscribe();
      }
    };
  } catch {
    return null;
  }
}

function normalizeEvenHubEvent(event: EvenHubEvent): NormalizedEvenInputEvent {
  const timestamp = new Date().toISOString();
  const sysEvent = event.sysEvent;
  const textEvent = event.textEvent;
  const sysType = eventTypeOf(sysEvent);
  const textType = eventTypeOf(textEvent);
  const channel = textEvent ? 'textEvent' : sysEvent ? 'sysEvent' : 'unknown';
  const type = textType ?? sysType;
  const eventType = eventTypeLabel(type);
  const mappedAction = mapEvenHubEvent(textType, sysType);
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

// CLICK_EVENT is protobuf zero. Resolve that default only inside a real event
// envelope so an audio-only frame can never be mistaken for a tap.
function eventTypeOf(envelope?: { eventType?: OsEventTypeList }): OsEventTypeList | null {
  if (!envelope) {
    return null;
  }

  return envelope.eventType ?? OsEventTypeList.CLICK_EVENT;
}

function mapEvenHubEvent(
  textType: OsEventTypeList | null,
  sysType: OsEventTypeList | null
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

  if (sysType === OsEventTypeList.CLICK_EVENT || textType === OsEventTypeList.CLICK_EVENT) {
    return 'press';
  }

  return null;
}

function eventTypeLabel(eventType: OsEventTypeList | null): string {
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

function isExitEvent(
  sysType: OsEventTypeList | null,
  textType: OsEventTypeList | null
): boolean {
  return [sysType, textType].some(
    (eventType) =>
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
