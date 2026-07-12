import { OsEventTypeList, type EvenHubEvent } from '@evenrealities/even_hub_sdk';
import type { InputEventName } from '../input';
import type { GlassesInputDebugEvent } from '../types';

export type EvenInputBridge = {
  onEvenHubEvent(callback: (event: EvenHubEvent) => void): () => void;
};

export type NormalizedEvenInputEvent = GlassesInputDebugEvent & {
  mappedAction: InputEventName | null;
  dedupeKey: string;
};

export function bindEvenInput(
  bridge: EvenInputBridge,
  handler: (event: NormalizedEvenInputEvent) => void
): () => void {
  return bridge.onEvenHubEvent((event) => handler(normalizeEvenHubEvent(event)));
}

function normalizeEvenHubEvent(event: EvenHubEvent): NormalizedEvenInputEvent {
  const timestamp = new Date().toISOString();
  const listEvent = event.listEvent;
  const sysEvent = event.sysEvent;
  const textEvent = event.textEvent;
  const listType = listEvent?.eventType;
  const sysType = sysEvent?.eventType;
  const textType = textEvent?.eventType;
  const channel = listEvent ? 'listEvent' : textEvent ? 'textEvent' : sysEvent ? 'sysEvent' : 'unknown';
  const type = listType ?? textType ?? sysType;
  const eventType = eventTypeLabel(type);
  const mappedAction = mapEvenHubEvent(listType, textType, sysType, Boolean(listEvent), Boolean(textEvent), Boolean(sysEvent));
  const target = listEvent?.containerName ?? textEvent?.containerName ?? null;
  const selectedIndex = Number.isInteger(listEvent?.currentSelectItemIndex)
    ? (listEvent?.currentSelectItemIndex ?? null)
    : null;
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
    selectedIndex,
    summary: summaryParts.join(' '),
    handling: mappedAction ? 'accepted' : 'ignored',
    dedupeKey: inputDedupeKey(mappedAction, selectedIndex)
  };
}

function mapEvenHubEvent(
  listType: OsEventTypeList | undefined,
  textType: OsEventTypeList | undefined,
  sysType: OsEventTypeList | undefined,
  hasListEvent: boolean,
  hasTextEvent: boolean,
  hasSysEvent: boolean
): InputEventName | null {
  if (
    listType === OsEventTypeList.DOUBLE_CLICK_EVENT ||
    sysType === OsEventTypeList.DOUBLE_CLICK_EVENT ||
    textType === OsEventTypeList.DOUBLE_CLICK_EVENT
  ) {
    return 'doublePress';
  }

  if (listType === OsEventTypeList.SCROLL_TOP_EVENT || textType === OsEventTypeList.SCROLL_TOP_EVENT) {
    return 'up';
  }

  if (listType === OsEventTypeList.SCROLL_BOTTOM_EVENT || textType === OsEventTypeList.SCROLL_BOTTOM_EVENT) {
    return 'down';
  }

  if (hasListEvent && (listType ?? OsEventTypeList.CLICK_EVENT) === OsEventTypeList.CLICK_EVENT) return 'press';

  if (hasTextEvent && (textType ?? OsEventTypeList.CLICK_EVENT) === OsEventTypeList.CLICK_EVENT) {
    return 'press';
  }

  if (hasSysEvent && (sysType ?? OsEventTypeList.CLICK_EVENT) === OsEventTypeList.CLICK_EVENT) {
    return 'press';
  }

  return null;
}

function inputDedupeKey(action: InputEventName | null, selectedIndex: number | null): string {
  if (!action) return 'ignored';
  if (action === 'doublePress') return action;
  return `${action}:${selectedIndex ?? 'none'}`;
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
