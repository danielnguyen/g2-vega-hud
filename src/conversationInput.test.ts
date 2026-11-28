import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ConversationInput, DOUBLE_PRESS_QUIET_MS, type ExitResult } from './conversationInput';
import { bindKeyboardInput } from './input';
import type { AppState, Screen } from './types';

function setup(screen: Screen = 'home') {
  const state = { screen, response: { pages: ['one', 'two'] } } as AppState;
  const deps = {
    state: () => state, busy: vi.fn(() => false), canExit: vi.fn(() => true),
    start: vi.fn(), stop: vi.fn(), movePage: vi.fn(), home: vi.fn(),
    exit: vi.fn(async (): Promise<ExitResult> => 'requested'), message: vi.fn()
  };
  return { state, deps, input: new ConversationInput(deps) };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const quiet = () => vi.advanceTimersByTime(DOUBLE_PRESS_QUIET_MS + 1);

it.each(['connecting', 'listening', 'thinking', 'stopping'] as const)('stops %s without exiting; ignores duplicates and presses through delayed cleanup', async screen => {
  const { input, deps, state } = setup(screen);
  deps.busy.mockReturnValue(true);
  input.handle('doublePress');
  input.handle('press'); input.handle('doublePress');
  quiet(); input.handle('doublePress');
  expect(deps.exit).not.toHaveBeenCalled(); expect(deps.start).not.toHaveBeenCalled();
  deps.busy.mockReturnValue(false); state.screen = 'pages';
  input.handle('doublePress'); // duplicate delivered just after cleanup
  expect(deps.exit).not.toHaveBeenCalled();
  quiet(); input.handle('doublePress'); await vi.runAllTimersAsync();
  expect(deps.exit).toHaveBeenCalledTimes(1);
});

it.each(['home', 'pages', 'error'] as const)('requests host exit from %s without navigating home', async screen => {
  const { input, deps } = setup(screen);
  input.handle('doublePress'); await vi.runAllTimersAsync();
  expect(deps.exit).toHaveBeenCalledTimes(1); expect(deps.home).not.toHaveBeenCalled();
  expect(deps.message).not.toHaveBeenCalled();
});

it('preserves single tap, scrolling, error recovery and settings', () => {
  const { input, deps, state } = setup('pages');
  input.handle('up'); input.handle('down'); input.handle('press');
  expect(deps.movePage.mock.calls).toEqual([[-1], [1]]); expect(deps.start).toHaveBeenCalledTimes(1);
  state.screen = 'error'; input.handle('press'); expect(deps.home).toHaveBeenCalledOnce();
  state.screen = 'settings'; input.handle('doublePress'); expect(deps.exit).not.toHaveBeenCalled();
});

it('deduplicates a pending request and permits deliberate resume after cancelling native confirmation', async () => {
  const { input, deps } = setup();
  let release!: (result: ExitResult) => void;
  deps.exit.mockReturnValue(new Promise(resolve => { release = resolve; }));
  input.handle('doublePress'); input.setOverlayVisible(true); quiet(); input.handle('doublePress'); input.handle('press');
  expect(input.exitPending).toBe(true); expect(deps.start).not.toHaveBeenCalled();
  expect(deps.exit).toHaveBeenCalledOnce();
  release('requested'); await vi.runAllTimersAsync(); input.setOverlayVisible(false); input.handle('press');
  expect(input.exitPending).toBe(false); expect(deps.start).toHaveBeenCalledOnce();
});

it.each(['failed', 'unsupported', 'reject'] as const)('reports %s without claiming closure', async result => {
  const { input, deps } = setup();
  if (result === 'reject') deps.exit.mockRejectedValue(new Error('bridge'));
  else deps.exit.mockResolvedValue(result);
  input.handle('doublePress'); await vi.runAllTimersAsync();
  expect(deps.message).toHaveBeenCalledWith(expect.stringMatching(/unavailable|could not be confirmed/));
  expect(input.exitPending).toBe(false);
});

it('does not request shutdown with uncertain microphone cleanup', () => {
  const { input, deps } = setup('error'); deps.canExit.mockReturnValue(false);
  input.handle('doublePress'); expect(deps.exit).not.toHaveBeenCalled();
  expect(deps.message).toHaveBeenCalledWith(expect.stringContaining('Microphone shutdown unconfirmed'));
});

it('keyboard Escape uses host exit fallback and held keys cannot become a second gesture', async () => {
  let keydown!: (event: { key: string; repeat: boolean }) => void;
  vi.stubGlobal('window', { addEventListener: (_: string, fn: typeof keydown) => { keydown = fn; } });
  const { input, deps } = setup(); deps.exit.mockResolvedValue('unsupported');
  bindKeyboardInput(event => input.handle(event));
  keydown({ key: 'Escape', repeat: false }); await vi.runAllTimersAsync(); quiet();
  keydown({ key: 'Escape', repeat: true });
  expect(deps.exit).toHaveBeenCalledOnce();
  expect(deps.message).toHaveBeenCalledWith(expect.stringContaining('browser tab'));
  keydown({ key: 'Enter', repeat: false }); expect(deps.start).toHaveBeenCalledOnce();
});
