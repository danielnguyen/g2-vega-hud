import { loadConfig } from './config';
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

let state: AppState = initialState();
const config = loadConfig();

function commit(nextState: AppState): void {
  state = nextState;
  render(root, state);
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
    commit(showError(state, error instanceof Error ? error.message : 'Gateway request failed'));
  }
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

bindKeyboardInput(handleInput);
render(root, state);
