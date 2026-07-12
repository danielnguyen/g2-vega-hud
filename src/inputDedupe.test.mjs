import assert from 'node:assert/strict';
import test from 'node:test';
import { DUPLICATE_EVENT_WINDOW_MS, filterDuplicateInput } from './inputDedupe.ts';

test('an exact firmware duplicate inside the bounded window is suppressed', () => {
  const first = filterDuplicateInput(null, { key: 'doublePress', receivedAt: 1000 });
  const duplicate = filterDuplicateInput(first.state, { key: 'doublePress', receivedAt: 1050 });
  assert.equal(first.accepted, true);
  assert.equal(duplicate.accepted, false);
});

test('different rapid actions are preserved', () => {
  const first = filterDuplicateInput(null, { key: 'down:1', receivedAt: 1000 });
  const second = filterDuplicateInput(first.state, { key: 'press:1', receivedAt: 1010 });
  assert.equal(second.accepted, true);
});

test('intentional repeated input after the narrow window is preserved', () => {
  const first = filterDuplicateInput(null, { key: 'press:0', receivedAt: 1000 });
  const repeated = filterDuplicateInput(first.state, {
    key: 'press:0',
    receivedAt: 1000 + DUPLICATE_EVENT_WINDOW_MS + 1
  });
  assert.equal(repeated.accepted, true);
});
