import assert from 'node:assert/strict';
import test from 'node:test';
import { RecoverableSerialQueue } from './serialQueue.ts';

test('serial queue exposes failure and runs a later retry', async () => {
  const queue = new RecoverableSerialQueue();
  const order = [];

  const failed = queue.run(async () => {
    order.push('failed-start');
    throw new Error('expected failure');
  });
  const recovered = queue.run(async () => {
    order.push('retry-start');
    return 'recovered';
  });

  await assert.rejects(failed, /expected failure/);
  assert.equal(await recovered, 'recovered');
  assert.deepEqual(order, ['failed-start', 'retry-start']);
});

test('serial queue does not overlap tasks', async () => {
  const queue = new RecoverableSerialQueue();
  const order = [];
  let releaseFirst;
  const firstGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });

  const first = queue.run(async () => {
    order.push('first-start');
    await firstGate;
    order.push('first-end');
  });
  const second = queue.run(async () => {
    order.push('second-start');
  });

  await Promise.resolve();
  assert.deepEqual(order, ['first-start']);
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(order, ['first-start', 'first-end', 'second-start']);
});
