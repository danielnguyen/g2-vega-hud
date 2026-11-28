import type { InputEventName } from './input';
import type { AppState } from './types';

// The SDK supplies no gesture ID. Require a quiet interval after a double tap
// so a burst delivered on both event channels cannot become stop then exit.
export const DOUBLE_PRESS_QUIET_MS = 600;
export type ExitResult = 'requested' | 'failed' | 'unsupported';

type Dependencies = {
  state(): AppState;
  busy(): boolean;
  canExit(): boolean;
  start(): void;
  stop(): void;
  movePage(delta: number): void;
  home(): void;
  exit(): Promise<ExitResult>;
  message(message: string): void;
};

export class ConversationInput {
  private lastDoublePress = -Infinity;
  private exiting = false;
  private overlayVisible = false;
  private suppressPressUntil = -Infinity;
  constructor(private readonly deps: Dependencies) {}

  get exitPending(): boolean { return this.exiting; }

  setOverlayVisible(visible: boolean): void {
    this.overlayVisible = visible;
    // Dismissing the native overlay separates its gesture from the next tap.
    // Do not reset double-tap burst suppression or resume automatically.
    if (!visible) this.suppressPressUntil = -Infinity;
  }

  handle(event: InputEventName): void {
    if (this.overlayVisible) return;
    const state = this.deps.state();
    if (state.response && ['pages', 'connecting', 'listening', 'thinking', 'stopping'].includes(state.screen)) {
      if (event === 'up') this.deps.movePage(-1);
      if (event === 'down') this.deps.movePage(1);
    }
    const now = performance.now();
    const duplicate = now - this.lastDoublePress < DOUBLE_PRESS_QUIET_MS;
    if (event === 'doublePress') {
      this.lastDoublePress = now;
      this.suppressPressUntil = now + DOUBLE_PRESS_QUIET_MS;
    }
    if (this.deps.busy()) {
      if (event === 'doublePress') this.deps.stop();
      return;
    }
    // The request reply is not a dialog outcome. Deduplicate exit requests,
    // but accept a deliberate app tap after dismissal even if the reply is late.
    if (event === 'doublePress' && (duplicate || this.exiting)) return;
    if (event === 'press' && now < this.suppressPressUntil) return;
    if (['home', 'pages', 'error'].includes(state.screen) && event === 'doublePress') {
      if (!this.deps.canExit()) {
        this.deps.message('Microphone shutdown unconfirmed. Use the Even host to close the app.');
        return;
      }
      void this.requestExit();
    } else if (state.screen === 'home' || state.screen === 'pages') {
      if (event === 'press') this.deps.start();
    } else if (state.screen === 'error' && event === 'press') this.deps.home();
  }

  private async requestExit(): Promise<void> {
    this.exiting = true;
    try {
      const result = await this.deps.exit();
      if (result === 'requested') return;
      this.deps.message(result === 'unsupported'
          ? 'Host exit unavailable. Close Vega HUD in the Even host or close this browser tab.'
          : 'Exit could not be confirmed. Use the Even host to close Vega HUD.');
    } catch {
      this.deps.message('Exit could not be confirmed. Use the Even host to close Vega HUD.');
    } finally {
      this.exiting = false;
    }
  }
}
