import assert from 'node:assert/strict';
import test from 'node:test';
import { initialG2Navigation, transitionG2Navigation } from './navigation.ts';

test('home selection opens Dashboard and Ask as sibling routes', () => {
  const initial = initialG2Navigation();
  const dashboard = transitionG2Navigation(initial, { type: 'open-selected' });
  assert.equal(dashboard.state.route, 'dashboard');

  const askSelection = transitionG2Navigation(initial, { type: 'select', index: 1 });
  const ask = transitionG2Navigation(askSelection.state, { type: 'open-selected' });
  assert.equal(ask.state.route, 'ask-setup');
});

test('back climbs exactly one level and home requests host exit', () => {
  const child = transitionG2Navigation(initialG2Navigation(), { type: 'open-selected' });
  const home = transitionG2Navigation(child.state, { type: 'back-or-exit' });
  assert.deepEqual(home.state, initialG2Navigation());
  assert.equal(home.effect, 'none');

  const exit = transitionG2Navigation(home.state, { type: 'back-or-exit' });
  assert.equal(exit.state.route, 'home');
  assert.equal(exit.effect, 'request-host-exit');
});

test('selection changes are ignored on child screens', () => {
  const child = transitionG2Navigation(initialG2Navigation(), { type: 'open-selected' }).state;
  const selected = transitionG2Navigation(child, { type: 'select', index: 1 });
  const moved = transitionG2Navigation(selected.state, { type: 'move-selection', delta: 1 });
  assert.deepEqual(moved.state, child);
});
