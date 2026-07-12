import assert from 'node:assert/strict';
import test from 'node:test';
import { OsEventTypeList } from '@evenrealities/even_hub_sdk';
import { normalizeEvenHubEvent } from './evenInput.ts';

test('native list selection uses the supplied item index', () => {
  const event = normalizeEvenHubEvent({
    listEvent: { currentSelectItemIndex: 1, eventType: OsEventTypeList.CLICK_EVENT }
  });
  assert.equal(event.mappedAction, 'press');
  assert.equal(event.selectedIndex, 1);
});

test('native list selection defaults an omitted first-item index to zero', () => {
  const event = normalizeEvenHubEvent({ listEvent: { eventType: OsEventTypeList.CLICK_EVENT } });
  assert.equal(event.mappedAction, 'press');
  assert.equal(event.selectedIndex, 0);
});

test('text events map only text-container scroll gestures', () => {
  const up = normalizeEvenHubEvent({ textEvent: { eventType: OsEventTypeList.SCROLL_TOP_EVENT } });
  const down = normalizeEvenHubEvent({ textEvent: { eventType: OsEventTypeList.SCROLL_BOTTOM_EVENT } });
  const click = normalizeEvenHubEvent({ textEvent: { eventType: OsEventTypeList.CLICK_EVENT } });
  assert.equal(up.mappedAction, 'up');
  assert.equal(down.mappedAction, 'down');
  assert.equal(click.mappedAction, null);
});

test('system events map single and double press', () => {
  const single = normalizeEvenHubEvent({ sysEvent: { eventType: OsEventTypeList.CLICK_EVENT } });
  const double = normalizeEvenHubEvent({ sysEvent: { eventType: OsEventTypeList.DOUBLE_CLICK_EVENT } });
  assert.equal(single.mappedAction, 'press');
  assert.equal(double.mappedAction, 'doublePress');
});

test('system lifecycle events are classified without gesture mapping', () => {
  const cases = [
    [OsEventTypeList.FOREGROUND_ENTER_EVENT, 'foreground-enter'],
    [OsEventTypeList.FOREGROUND_EXIT_EVENT, 'foreground-exit'],
    [OsEventTypeList.ABNORMAL_EXIT_EVENT, 'abnormal-exit'],
    [OsEventTypeList.SYSTEM_EXIT_EVENT, 'system-exit']
  ];

  for (const [eventType, expected] of cases) {
    const event = normalizeEvenHubEvent({ sysEvent: { eventType } });
    assert.equal(event.lifecycleEvent, expected);
    assert.equal(event.mappedAction, null);
  }
});
