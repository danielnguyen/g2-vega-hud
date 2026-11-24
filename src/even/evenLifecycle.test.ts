import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeviceConnectType, OsEventTypeList, type DeviceStatus, type EvenHubEvent, waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';
import { bindEvenInput } from './evenInput';
import { createEvenDisplay, frameForState } from './evenDisplay';
import { initialState, movePage, showConnecting, showListening, showPages } from '../state';
import { initialRuntimeStatus } from '../runtimeStatus';

vi.mock('@evenrealities/even_hub_sdk', async original => ({
  ...await original<typeof import('@evenrealities/even_hub_sdk')>(), waitForEvenAppBridge: vi.fn()
}));
const settings = { gatewayUrl: '', authValue: '' };
const state = initialState(true, settings, initialRuntimeStatus(true), {
  appVersion: 'test', currentSettings: settings, lastGlassesInputEvent: null, lastGatewayRequest: null, lastError: null
});
afterEach(() => vi.clearAllMocks());

describe('Even lifecycle and answer surface', () => {
  it('retains a scrollable answer/index during rearm and live transcript without implying listening early', () => {
    let next = showPages(state, { request_id: 'r', title: 'Answer', pages: ['first', 'second', 'third'], source: 'chat-orchestrator', raw_length: 16 });
    next = movePage(next, 1); next = showConnecting(next);
    expect(frameForState(next)).toMatchObject({ title: 'Connecting... 2/3', body: 'second' });
    next = movePage(next, 1); next = showListening(next, 'follow up');
    expect(frameForState(next)).toMatchObject({ title: 'Listening... 3/3', body: 'third', help: 'follow up' });
    next = movePage(next, 1); expect(next.pageIndex).toBe(0);
    next = showPages(next, { ...next.response!, pages: ['new answer'] });
    expect(frameForState(next)).toMatchObject({ title: 'Answer 1/1', body: 'new answer' });
  });

  it('does not return a ready display when startup page acknowledgement fails', async () => {
    vi.mocked(waitForEvenAppBridge).mockResolvedValue({ createStartUpPageContainer: vi.fn(async () => 1) } as any);
    expect(await createEvenDisplay()).toBeNull();
  });

  it('serializes display updates and coalesces queued frames so stale listening cannot overwrite stopped', async () => {
    let release!: (value: boolean) => void;
    const pending = new Promise<boolean>(resolve => { release = resolve; });
    const upgrade = vi.fn().mockReturnValueOnce(pending).mockResolvedValue(true);
    vi.mocked(waitForEvenAppBridge).mockResolvedValue({ createStartUpPageContainer: vi.fn(async () => 0), textContainerUpgrade: upgrade } as any);
    const display = (await createEvenDisplay())!;
    const first = display.render(showListening(state)); await Promise.resolve(); await Promise.resolve();
    const skipped = display.render(showConnecting(state));
    const last = display.render({ ...state, screen: 'stopping' });
    expect(upgrade).toHaveBeenCalledTimes(3);
    release(true); await Promise.all([first, skipped, last]);
    expect(upgrade).toHaveBeenCalledTimes(6);
    expect(upgrade.mock.calls[3][0].content).toBe('Stopping microphone...');
  });

  it('forwards boolean mic acknowledgements, handles disconnect/exit, and preserves protobuf zero and audio input', async () => {
    let input!: (event: EvenHubEvent) => void;
    let status!: (event: DeviceStatus) => void;
    const unsubscribe = vi.fn(); const unsubscribeStatus = vi.fn();
    const microphone = vi.fn(async () => false);
    vi.mocked(waitForEvenAppBridge).mockResolvedValue({
      audioControl: microphone,
      onEvenHubEvent: (fn: typeof input) => { input = fn; return unsubscribe; },
      onDeviceStatusChanged: (fn: typeof status) => { status = fn; return unsubscribeStatus; }
    } as any);
    const handlers = { onInput: vi.fn(), onPcm: vi.fn(), onExit: vi.fn() };
    const binding = (await bindEvenInput(handlers))!;
    expect(await binding.setMicrophoneEnabled(true)).toBe(false);
    input({ audioEvent: { audioPcm: new Uint8Array([1]) } } as any);
    expect(handlers.onInput).not.toHaveBeenCalled(); expect(handlers.onPcm).toHaveBeenCalledTimes(1);
    input({ sysEvent: {} } as any); expect(handlers.onInput.mock.calls[0][0].mappedAction).toBe('press');
    input({ textEvent: { eventType: OsEventTypeList.SCROLL_BOTTOM_EVENT } } as any);
    expect(handlers.onInput.mock.calls[1][0].mappedAction).toBe('down');
    input({ sysEvent: { eventType: OsEventTypeList.FOREGROUND_EXIT_EVENT } } as any);
    status({ connectType: DeviceConnectType.Disconnected } as DeviceStatus);
    status({ connectType: DeviceConnectType.ConnectionFailed } as DeviceStatus);
    expect(handlers.onExit).toHaveBeenCalledTimes(3);
    binding.dispose(); expect(unsubscribe).toHaveBeenCalled(); expect(unsubscribeStatus).toHaveBeenCalled();
  });
});
