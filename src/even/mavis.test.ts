import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImageRawDataUpdateResult, waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';
import { createEvenDisplay, frameForState } from './evenDisplay';
import { mavisBytes, mavisForState } from '../mavis';
import { initialState, movePage, showConnecting, showListening, showPages } from '../state';
import { initialRuntimeStatus } from '../runtimeStatus';
import type { Screen } from '../types';

vi.mock('@evenrealities/even_hub_sdk', async original => ({
  ...await original<typeof import('@evenrealities/even_hub_sdk')>(), waitForEvenAppBridge: vi.fn()
}));
const settings = { gatewayUrl: '', authValue: '' };
const state = initialState(true, settings, initialRuntimeStatus(true), {
  appVersion: 'test', currentSettings: settings, lastGlassesInputEvent: null, lastGatewayRequest: null, lastError: null
});
const answer = showPages(state, {
  request_id: 'r', title: 'Answer', pages: ['first', 'second'], source: 'chat-orchestrator', raw_length: 11
});
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function bridge() {
  return {
    createStartUpPageContainer: vi.fn().mockResolvedValue(0),
    textContainerUpgrade: vi.fn().mockResolvedValue(true),
    updateImageRawData: vi.fn().mockResolvedValue(ImageRawDataUpdateResult.success),
    rebuildPageContainer: vi.fn().mockResolvedValue(true)
  };
}
async function displayFor(mock = bridge()) {
  vi.mocked(waitForEvenAppBridge).mockResolvedValue(mock as any);
  return { mock, display: (await createEvenDisplay())! };
}
afterEach(() => { vi.clearAllMocks(); vi.useRealTimers(); });

describe('Mavis state and exact artwork', () => {
  it.each<[Screen, string]>([
    ['home', 'ready'], ['connecting', 'connecting'], ['listening', 'listening'],
    ['thinking', 'thinking'], ['stopping', 'ready'], ['error', 'issue'], ['settings', 'blank'], ['pages', 'done']
  ])('maps %s from actual state, including a previous answer', (screen, sprite) => {
    expect(mavisForState({ ...answer, screen, errorMessage: 'offline listening done' })).toBe(sprite);
  });
  it('never celebrates missing/degraded/failed answers or infers offline from error text', () => {
    expect(mavisForState({ ...state, screen: 'pages' })).toBe('issue');
    for (const status of ['degraded', 'failed'] as const) {
      expect(mavisForState({ ...answer, response: { ...answer.response!, status } })).toBe('issue');
    }
    expect(mavisForState({ ...state, screen: 'error', errorMessage: 'Disconnected' })).toBe('issue');
  });
  it('keeps rearm status and page position truthful, independently of the previous answer', () => {
    const connecting = showConnecting(movePage(answer, 1));
    expect(mavisForState(connecting)).toBe('connecting');
    expect(frameForState(connecting)).toMatchObject({ title: 'Connecting... 2/2', body: 'second' });
    expect(mavisForState(showListening(connecting))).toBe('listening');
    expect(mavisForState({ ...connecting, screen: 'stopping' })).toBe('ready');
  });

});

describe('noncritical native image transport', () => {
  it('uses one 80px image and nonoverlapping text inside 576x288; body alone captures input', async () => {
    const { mock, display } = await displayFor();
    const page = mock.createStartUpPageContainer.mock.calls[0][0];
    expect(page.containerTotalNum).toBe(4);
    expect(page.imageObject).toEqual([{ containerID: 4, containerName: 'mavis', xPosition: 24, yPosition: 8, width: 80, height: 80 }]);
    const containers = [...page.textObject, ...page.imageObject];
    for (const c of containers) {
      expect(c.xPosition + c.width).toBeLessThanOrEqual(576);
      expect(c.yPosition + c.height).toBeLessThanOrEqual(288);
      for (const other of containers.filter(x => x !== c)) {
        expect(c.xPosition + c.width <= other.xPosition || other.xPosition + other.width <= c.xPosition ||
          c.yPosition + c.height <= other.yPosition || other.yPosition + other.height <= c.yPosition).toBe(true);
      }
    }
    expect(page.textObject.filter((x: any) => x.isEventCapture === 1).map((x: any) => x.containerName)).toEqual(['body']);
    await display.render(showListening(state));
    expect(mock.updateImageRawData).toHaveBeenCalledWith({ containerID: 4, containerName: 'mavis', imageData: mavisBytes('listening') });
    await display.render(showListening(state, 'new transcript'));
    expect(mock.updateImageRawData).toHaveBeenCalledTimes(1);
  });
  it('coalesces delayed writes while text/scroll/stop finish; stale queued poses never send', async () => {
    let release!: (value: ImageRawDataUpdateResult) => void;
    const mock = bridge();
    mock.updateImageRawData.mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
    const { display } = await displayFor(mock);
    await display.render(showConnecting(answer));
    await display.render(showListening(movePage(answer, 1)));
    await display.render({ ...answer, screen: 'thinking' });
    await display.render({ ...answer, screen: 'stopping' });
    expect(mock.updateImageRawData).toHaveBeenCalledTimes(1);
    expect(mock.textContainerUpgrade).toHaveBeenCalledWith(expect.objectContaining({ content: 'second', containerName: 'body' }));
    expect(mock.textContainerUpgrade).toHaveBeenCalledWith(expect.objectContaining({ content: 'Stopping microphone... 1/2' }));
    release(ImageRawDataUpdateResult.success); await settle();
    expect(mock.updateImageRawData).toHaveBeenCalledTimes(2);
    expect(mock.updateImageRawData.mock.calls[1][0].imageData).toEqual(mavisBytes('ready'));
  });
  it.each(['reject', 'failure', 'throw', 'timeout'])('falls back to text for %s without blocking render or resending a timed-out image', async mode => {
    vi.useFakeTimers();
    const mock = bridge();
    let release!: (value: ImageRawDataUpdateResult) => void;
    if (mode === 'reject') mock.updateImageRawData.mockRejectedValue(new Error('unsupported'));
    if (mode === 'failure') mock.updateImageRawData.mockResolvedValue(ImageRawDataUpdateResult.imageSizeInvalid);
    if (mode === 'throw') mock.updateImageRawData.mockImplementation(() => { throw new Error('unsupported'); });
    if (mode === 'timeout') mock.updateImageRawData.mockReturnValue(new Promise(resolve => { release = resolve; }));
    const { display } = await displayFor(mock);
    await display.render(showListening(state));
    await vi.advanceTimersByTimeAsync(1501); await settle();
    expect(mock.rebuildPageContainer).toHaveBeenCalledTimes(1);
    expect(mock.rebuildPageContainer.mock.calls[0][0]).toMatchObject({ containerTotalNum: 3 });
    expect(mock.rebuildPageContainer.mock.calls[0][0].imageObject).toBeUndefined();
    await display.render({ ...state, screen: 'error' });
    if (release) { release(ImageRawDataUpdateResult.success); await settle(); }
    expect(mock.updateImageRawData).toHaveBeenCalledTimes(1);
    expect(mock.textContainerUpgrade).toHaveBeenCalledWith(expect.objectContaining({ content: 'Conversation error' }));
  });
  it('restores latest text after delayed fallback rebuild and does not await rebuild', async () => {
    let release!: (value: boolean) => void;
    const mock = bridge();
    mock.updateImageRawData.mockResolvedValue(ImageRawDataUpdateResult.sendFailed);
    mock.rebuildPageContainer.mockReturnValue(new Promise(resolve => { release = resolve; }));
    const { display } = await displayFor(mock);
    await display.render(showListening(state));
    await display.render({ ...state, screen: 'stopping' });
    release(true); await settle();
    expect(mock.textContainerUpgrade.mock.calls.slice(-3)[0][0].content).toBe('Stopping microphone...');
  });
  it('clears the mascot in settings', async () => {
    const { mock, display } = await displayFor();
    await display.render(showListening(state));
    await display.render({ ...state, screen: 'settings' }); await settle();
    expect(mock.updateImageRawData.mock.calls[1][0].imageData).toEqual(mavisBytes('blank'));
  });
  it('supports missing image APIs and a rejected image layout without losing the startup/input surface', async () => {
    const missing = bridge();
    delete (missing as any).updateImageRawData;
    const { display } = await displayFor(missing);
    expect(display).not.toBeNull();
    expect(missing.createStartUpPageContainer.mock.calls[0][0].containerTotalNum).toBe(3);
    const rejected = bridge();
    rejected.createStartUpPageContainer.mockResolvedValueOnce(1);
    const fallback = await displayFor(rejected);
    expect(fallback.display).not.toBeNull();
    expect(rejected.createStartUpPageContainer.mock.calls[1][0].containerTotalNum).toBe(3);
    await fallback.display.render(state);
    expect(rejected.updateImageRawData).not.toHaveBeenCalled();
  });
});
