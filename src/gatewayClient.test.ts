import { afterEach, describe, expect, it, vi } from 'vitest';
import { getWork, pollWork, sendTurn } from './gatewayClient';
import type { GatewayDeferredResponse } from './types';

const config = { gatewayUrl: 'https://gateway.test', authValue: 'test-token' };
const deferred: GatewayDeferredResponse = {
  request_id: 'request-1', conversation_id: '10000000-0000-4000-8000-000000000001',
  work_id: '20000000-0000-4000-8000-000000000002', delivery_status: 'pending',
  title: 'VEGA', source: 'chat-orchestrator'
};
const identity = {
  request_id: deferred.request_id, conversation_id: deferred.conversation_id,
  work_id: deferred.work_id, source: deferred.source
};
const pages = [' Canonical first page\n', 'Second   page.'];
const completed = { ...identity, state: 'completed', pages, raw_length: 43 };
const synchronous = {
  request_id: deferred.request_id, conversation_id: deferred.conversation_id,
  title: deferred.title, source: deferred.source, pages, raw_length: 43,
  status: 'degraded', conversation_disposition: 'non_current'
};

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status });
}

function assertGets(mock: ReturnType<typeof vi.fn<typeof fetch>>, count: number) {
  const gets = mock.mock.calls.filter(([, init]) => init?.method === 'GET');
  expect(gets).toHaveLength(count);
  for (const [url, init] of gets) {
    expect(String(url)).toBe(`${config.gatewayUrl}/g2/work-items/${deferred.work_id}?conversation_id=${deferred.conversation_id}`);
    expect(init?.headers).toEqual({ authorization: 'Bearer test-token' });
    expect(init?.body).toBeUndefined();
  }
}

describe('gateway turn and exact work transport', () => {
  it('preserves synchronous pages, disposition, conversation forwarding and bearer auth with one POST', async () => {
    const mock = vi.fn<typeof fetch>().mockResolvedValue(json(synchronous));
    vi.stubGlobal('fetch', mock);
    expect(await sendTurn(config, 'Neutral transcript', { conversationId: deferred.conversation_id, inputMode: 'voice_transcribed' })).toEqual(synchronous);
    expect(mock).toHaveBeenCalledTimes(1);
    const [url, init] = mock.mock.calls[0];
    expect(url).toBe(`${config.gatewayUrl}/g2/turn`);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'content-type': 'application/json', authorization: 'Bearer test-token' });
    expect(JSON.parse(init?.body as string)).toEqual({ mode: 'ask', text: 'Neutral transcript', input_mode: 'voice_transcribed', conversation_id: deferred.conversation_id });
    assertGets(mock, 0);
  });

  it('accepts only the deferred identity/title on 202, without manufacturing pages', async () => {
    const mock = vi.fn<typeof fetch>().mockResolvedValue(json(deferred, 202));
    vi.stubGlobal('fetch', mock);
    const result = await sendTurn(config, 'Neutral transcript');
    expect(result).toEqual(deferred);
    expect(result).not.toHaveProperty('pages');
    expect(result).not.toHaveProperty('answer');
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it('uses one POST then three exact reads for pending, running and completed, preserving pages', async () => {
    const mock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json(deferred, 202))
      .mockResolvedValueOnce(json({ ...identity, state: 'pending' }))
      .mockResolvedValueOnce(json({ ...identity, state: 'running' }))
      .mockResolvedValueOnce(json(completed));
    vi.stubGlobal('fetch', mock);
    const submission = await sendTurn(config, 'Neutral transcript');
    if (!('delivery_status' in submission)) throw new Error('Expected deferred');
    const result = await pollWork(config, submission, 0);
    expect(result).toEqual(completed);
    expect(submission.title).toBe(deferred.title);
    expect(mock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
    expect(mock).toHaveBeenCalledTimes(4);
    assertGets(mock, 3);
  });

  it.each(['interrupted', 'execution_failed', 'dependency_unavailable', 'authority_unavailable'])(
    'stops on terminal failure %s without resubmission', async (failure_code) => {
      const failed = { ...identity, state: 'failed', failure_code };
      const mock = vi.fn<typeof fetch>().mockResolvedValueOnce(json(deferred, 202)).mockResolvedValueOnce(json(failed));
      vi.stubGlobal('fetch', mock);
      const submission = await sendTurn(config, 'Neutral transcript');
      if (!('delivery_status' in submission)) throw new Error('Expected deferred');
      expect(await pollWork(config, submission, 0)).toEqual(failed);
      expect(mock).toHaveBeenCalledTimes(2);
      expect(mock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
      assertGets(mock, 1);
    }
  );

  it.each(['work_id', 'conversation_id', 'request_id'])('rejects mismatched %s without alternate lookup', async (key) => {
    const mock = vi.fn<typeof fetch>().mockResolvedValue(json({ ...completed, [key]: key === 'request_id' ? 'other-request' : '30000000-0000-4000-8000-000000000003' }));
    vi.stubGlobal('fetch', mock);
    await expect(pollWork(config, deferred, 0)).rejects.toThrow('Invalid gateway work response');
    expect(mock).toHaveBeenCalledTimes(1);
    assertGets(mock, 1);
  });

  it.each([
    null, { ...identity, state: 'unknown' },
    { ...identity, state: 'failed' }, { ...identity, state: 'failed', failure_code: 'private-detail' },
    { ...identity, state: 'completed', raw_length: 1 },
    { ...completed, pages: [12] }, { ...completed, pages: [] }, { ...completed, pages: [' \n'] },
    { ...completed, raw_length: undefined }, { ...completed, raw_length: -1 }, { ...completed, raw_length: 1.5 },
    { ...identity, state: 'pending', pages }, { ...identity, state: 'running', answer: 'not canonical' },
    { ...completed, source: 'other' }, { ...completed, owner_id: 'private' }
  ])('rejects malformed work %# without retry', async (body) => {
    const mock = vi.fn<typeof fetch>().mockResolvedValue(json(body));
    vi.stubGlobal('fetch', mock);
    await expect(pollWork(config, deferred, 0)).rejects.toThrow('Invalid gateway work response');
    expect(mock).toHaveBeenCalledTimes(1);
    assertGets(mock, 1);
  });

  it.each([201, 202, 404, 503, 'network', 'json'])('stops polling on %s failure with no retries or POST', async (failure) => {
    const mock = vi.fn<typeof fetch>();
    if (failure === 'network') mock.mockRejectedValue(new TypeError('private transport detail'));
    else if (failure === 'json') mock.mockResolvedValue(new Response('private invalid JSON'));
    else mock.mockResolvedValue(json(completed, failure as number));
    vi.stubGlobal('fetch', mock);
    await expect(pollWork(config, deferred, 0)).rejects.toThrow(
      failure === 'network' ? 'Could not reach gateway' : failure === 'json' ? 'Invalid gateway response' :
      typeof failure === 'number' && failure >= 400 ? `Gateway returned HTTP ${failure}` : 'Invalid gateway work response'
    );
    expect(mock).toHaveBeenCalledTimes(1);
    assertGets(mock, 1);
  });

  it.each([
    [200, deferred], [202, synchronous], [201, synchronous], [200, { ...synchronous, pages: [null] }],
    [202, { ...deferred, work_id: 'bad' }], [202, { ...deferred, pages }], [202, { ...deferred, request_id: '' }]
  ])('rejects malformed submission/status %# without retry', async (status, body) => {
    const mock = vi.fn<typeof fetch>().mockResolvedValue(json(body, status as number));
    vi.stubGlobal('fetch', mock);
    await expect(sendTurn(config, 'Neutral transcript')).rejects.toThrow('Invalid gateway turn response');
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid exact locators before making any request', async () => {
    const mock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', mock);
    await expect(getWork(config, '../other', deferred.conversation_id)).rejects.toThrow('Invalid work identity');
    await expect(getWork(config, deferred.work_id, '')).rejects.toThrow('Invalid work identity');
    expect(mock).not.toHaveBeenCalled();
  });

  it.each(['submit', 'status'])('keeps the 20-second %s timeout and bounded error', async (operation) => {
    vi.useFakeTimers();
    const mock = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    vi.stubGlobal('fetch', mock);
    const promise = operation === 'submit' ? sendTurn(config, 'Neutral transcript') : getWork(config, deferred.work_id, deferred.conversation_id);
    const assertion = expect(promise).rejects.toThrow('Gateway timed out');
    await vi.advanceTimersByTimeAsync(19_999);
    expect(mock.mock.calls[0][1]?.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
    expect(mock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('waits 1000ms before each serialized read', async () => {
    vi.useFakeTimers();
    let release!: (response: Response) => void;
    const mock = vi.fn<typeof fetch>()
      .mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }))
      .mockResolvedValueOnce(json({ ...identity, state: 'running' }))
      .mockResolvedValueOnce(json(completed));
    vi.stubGlobal('fetch', mock);
    const promise = pollWork(config, deferred);
    await vi.advanceTimersByTimeAsync(999);
    expect(mock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(mock).toHaveBeenCalledTimes(1);
    release(json({ ...identity, state: 'pending' }));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(999);
    expect(mock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(mock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await promise).toEqual(completed);
    assertGets(mock, 3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('continues valid pending work beyond a minute without a total polling horizon', async () => {
    vi.useFakeTimers();
    const mock = vi.fn<typeof fetch>().mockImplementation(async () => json(
      mock.mock.calls.length <= 70 ? { ...identity, state: 'pending' } : completed
    ));
    vi.stubGlobal('fetch', mock);
    const promise = pollWork(config, deferred);
    await vi.advanceTimersByTimeAsync(71_000);
    expect(await promise).toEqual(completed);
    expect(mock).toHaveBeenCalledTimes(71);
    assertGets(mock, 71);
  });
});
