import assert from 'node:assert/strict';
import test from 'node:test';
import { retryBounded } from './boundedRetry.ts';

test('bounded retry recovers after a transient failure', async () => {
  let calls = 0;
  const waits = [];
  const result = await retryBounded(
    async () => {
      calls += 1;
      if (calls === 1) throw new Error('transient');
      return 'ready';
    },
    { attempts: 3, delayMs: 25 },
    async (delayMs) => {
      waits.push(delayMs);
    }
  );

  assert.equal(result, 'ready');
  assert.equal(calls, 2);
  assert.deepEqual(waits, [25]);
});

test('bounded retry stops after the configured attempt count', async () => {
  let calls = 0;
  const waits = [];
  await assert.rejects(
    retryBounded(
      async () => {
        calls += 1;
        throw new Error('unavailable');
      },
      { attempts: 3, delayMs: 25 },
      async (delayMs) => {
        waits.push(delayMs);
      }
    ),
    /unavailable/
  );

  assert.equal(calls, 3);
  assert.deepEqual(waits, [25, 25]);
});
