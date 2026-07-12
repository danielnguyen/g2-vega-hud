import assert from 'node:assert/strict';
import test from 'node:test';
import { createEvenDisplay } from './evenDisplay.ts';

test('refreshing rendered home forces a native list rebuild', async () => {
  const bridge = fakeBridge();
  const display = await createEvenDisplay(bridge);

  await display.refresh({ route: 'home', selectedIndex: 0 });

  assert.equal(bridge.rebuilds.length, 1);
  assert.equal(bridge.rebuilds[0].listObject?.[0]?.containerName, 'g2-home');
  assert.equal(bridge.rebuilds[0].textObject, undefined);
});

test('refreshing a rendered child forces a text-container rebuild', async () => {
  const bridge = fakeBridge();
  const display = await createEvenDisplay(bridge);
  const dashboard = { route: 'dashboard', selectedIndex: 0 };
  await display.render(dashboard);
  bridge.rebuilds.length = 0;

  await display.refresh(dashboard);

  assert.equal(bridge.rebuilds.length, 1);
  assert.equal(bridge.rebuilds[0].textObject?.[0]?.containerName, 'g2-child');
  assert.match(bridge.rebuilds[0].textObject?.[0]?.content ?? '', /DASHBOARD/);
  assert.equal(bridge.rebuilds[0].listObject, undefined);
});

test('a failed refresh is observable and later queued work can retry', async () => {
  const bridge = fakeBridge([false, true, true]);
  const display = await createEvenDisplay(bridge);
  const ask = { route: 'ask-setup', selectedIndex: 1 };

  await assert.rejects(display.refresh(ask), /Even display refresh failed/);
  await display.render(ask);
  await display.refresh(ask);

  assert.equal(bridge.rebuilds.length, 3);
  assert.equal(bridge.rebuilds[1].textObject?.[0]?.containerName, 'g2-child');
  assert.equal(bridge.rebuilds[2].textObject?.[0]?.containerName, 'g2-child');
});

function fakeBridge(rebuildResults = []) {
  return {
    rebuilds: [],
    async createStartUpPageContainer() {
      return 0;
    },
    async rebuildPageContainer(page) {
      this.rebuilds.push(page);
      return rebuildResults.length > 0 ? rebuildResults.shift() : true;
    },
    async textContainerUpgrade() {
      return true;
    },
    async shutDownPageContainer() {
      return true;
    }
  };
}
