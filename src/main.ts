import { loadConfig } from './config';
import { createEvenDisplay, type EvenDisplay } from './even/evenDisplay';
import { bindEvenInput } from './even/evenInput';
import { sendTurn } from './gatewayClient';
import { bindKeyboardInput, type InputEventName } from './input';
import { render } from './renderer';
import { backHome, initialState, movePage, moveSelection, showError, showLoading, showPages } from './state';
import { MODES, type AppState } from './types';
import './style.css';

const root = document.querySelector<HTMLDivElement>('#app');

if (!root) {
  throw new Error('Missing app root element');
}

const appRoot: HTMLDivElement = root;

let state: AppState = initialState();
let evenDisplay: EvenDisplay | null = null;
const config = loadConfig();

function commit(nextState: AppState): void {
  state = nextState;
  render(appRoot, state);
  bindModeClicks();

  if (evenDisplay) {
    evenDisplay.render(state).catch(() => undefined);
  }
}

async function runSelectedMode(): Promise<void> {
  const selected = MODES[state.selectedModeIndex];
  if (!selected) {
    commit(showError(state, 'No mode selected'));
    return;
  }

  commit(showLoading(state));

  try {
    const response = await sendTurn(config, selected.mode, selected.prompt);
    commit(showPages(state, response));
  } catch (error) {
    console.warn('[gateway]', error);
    commit(showError(state, toUserErrorMessage(error)));
  }
}

function bindModeClicks(): void {
  appRoot.querySelectorAll<HTMLElement>('[data-mode-index]').forEach((element) => {
    element.addEventListener('click', () => {
      const modeIndex = Number(element.dataset.modeIndex);

      if (!Number.isInteger(modeIndex) || modeIndex < 0 || modeIndex >= MODES.length) {
        return;
      }

      state = {
        ...state,
        selectedModeIndex: modeIndex
      };

      void runSelectedMode();
    });
  });
}

function handleInput(eventName: InputEventName): void {
  if (state.screen === 'home') {
    if (eventName === 'up') commit(moveSelection(state, -1));
    if (eventName === 'down') commit(moveSelection(state, 1));
    if (eventName === 'press') void runSelectedMode();
    return;
  }

  if (state.screen === 'pages') {
    if (eventName === 'up') commit(movePage(state, -1));
    if (eventName === 'down') commit(movePage(state, 1));
    if (eventName === 'press' || eventName === 'doublePress') commit(backHome(state));
    return;
  }

  if (state.screen === 'loading' && eventName === 'doublePress') {
    commit(backHome(state));
    return;
  }

  if (state.screen === 'error' && (eventName === 'press' || eventName === 'doublePress')) {
    commit(backHome(state));
  }
}

async function initializeEvenDisplay(): Promise<void> {
  evenDisplay = await createEvenDisplay();

  if (evenDisplay) {
    await evenDisplay.render(state);
  }
}

function toUserErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Gateway request failed.';
  }

  if (error.message === 'Gateway timed out') {
    return 'Gateway timed out. Try again.';
  }

  if (error.message === 'Could not reach gateway') {
    return 'Could not reach gateway.';
  }

  if (/^Gateway returned HTTP \d+$/.test(error.message)) {
    return `${error.message}.`;
  }

  return 'Gateway request failed.';
}

bindKeyboardInput(handleInput);
bindEvenInput(handleInput).catch(() => undefined);
render(appRoot, state);
bindModeClicks();
initializeEvenDisplay().catch(() => undefined);
