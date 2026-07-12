import assert from 'node:assert/strict';
import test from 'node:test';
import { DUPLICATE_EVENT_WINDOW_MS, filterDuplicateInput } from './inputDedupe.ts';

test('an entire exact-duplicate burst is suppressed', () => {
  const first = filterDuplicateInput(null, { key: 'doublePress', receivedAt: 0 });
  const second = filterDuplicateInput(first.state, { key: 'doublePress', receivedAt: 100 });
  const third = filterDuplicateInput(second.state, { key: 'doublePress', receivedAt: 200 });
  assert.equal(first.accepted, true);
  assert.equal(second.accepted, false);
  assert.equal(third.accepted, false);
  assert.equal(third.state?.receivedAt, 200);
});

test('different rapid actions are preserved', () => {
  const first = filterDuplicateInput(null, { key: 'down:1', receivedAt: 1000 });
  const second = filterDuplicateInput(first.state, { key: 'press:1', receivedAt: 1010 });
  assert.equal(second.accepted, true);
});

test('the same action is accepted after a quiet period', () => {
  const first = filterDuplicateInput(null, { key: 'press:0', receivedAt: 0 });
  const duplicate = filterDuplicateInput(first.state, { key: 'press:0', receivedAt: 100 });
  const afterQuiet = filterDuplicateInput(duplicate.state, {
    key: 'press:0',
    receivedAt: 100 + DUPLICATE_EVENT_WINDOW_MS + 1
  });
  assert.equal(afterQuiet.accepted, true);
});
