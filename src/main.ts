import { configFromSettings, loadConfig, loadEnvConfig, type AppConfig } from './config';
import { createEvenDisplay, type EvenDisplay } from './even/evenDisplay';
import { bindEvenInput } from './even/evenInput';
import { sendTurn } from './gatewayClient';
import { bindKeyboardInput, type InputEventName } from './input';
import { render } from './renderer';
import { clearSettings, saveSettings, type RuntimeSettings } from './settings';
import {
  applyConfig,
  backHome,
  initialState,
  movePage,
  moveSelection,
  openSettings,
  showError,
  showLoading,
  showPages
} from './state';
import { MODES, type AppState } from './types';
import './style.css';

const root = document.querySelector<HTMLDivElement>('#app');

if (!root) {
  throw new Error('Missing app root element');
}

const appRoot: HTMLDivElement = root;

let state: AppState = initialState(false, emptySettings());
let evenDisplay: EvenDisplay | null = null;
let config: AppConfig | null = null;

function commit(nextState: AppState): void {
  state = nextState;
  render(appRoot, state);
  bindModeClicks();
  bindSettingsControls();

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

  if (!config) {
    commit(openSettings(state, state.settingsDraft, 'Settings required before use.'));
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

function bindSettingsControls(): void {
  const form = appRoot.querySelector<HTMLFormElement>('[data-settings-form="true"]');
  if (form) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      void handleSaveSettings();
    });
  }

  appRoot.querySelectorAll<HTMLElement>('[data-settings-action]').forEach((element) => {
    element.addEventListener('click', () => {
      const action = element.dataset.settingsAction;

      if (action === 'open') {
        commit(openSettings(state, currentDraft()));
        return;
      }

      if (action === 'back') {
        commit(backHome(state));
        return;
      }

      if (action === 'clear') {
        void handleClearSettings();
        return;
      }

      if (action === 'test') {
        void handleTestConnection();
      }
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

async function bootstrap(): Promise<void> {
  config = await loadConfig();
  const envFallback = loadEnvConfig();
  const settingsDraft = config
    ? { gatewayUrl: config.gatewayUrl, authValue: config.authValue }
    : emptySettings(envFallback ?? undefined);

  commit(initialState(Boolean(config), settingsDraft));
}

async function handleSaveSettings(): Promise<void> {
  const draft = readSettingsForm();
  const nextConfig = configFromSettings(draft);

  if (!nextConfig) {
    commit(openSettings(state, draft, 'Enter both gateway URL and auth token.'));
    return;
  }

  await saveSettings(draft);
  config = nextConfig;
  commit(applyConfig(state, draft, true, 'Settings saved.'));
}

async function handleClearSettings(): Promise<void> {
  const fallbackConfig = loadEnvConfig();

  await clearSettings();
  config = fallbackConfig;

  if (fallbackConfig) {
    commit(
      applyConfig(
        state,
        { gatewayUrl: fallbackConfig.gatewayUrl, authValue: fallbackConfig.authValue },
        true,
        'Saved settings cleared. Using env fallback.'
      )
    );
    return;
  }

  commit(applyConfig(state, emptySettings(), false, 'Saved settings cleared. Settings required before use.'));
}

async function handleTestConnection(): Promise<void> {
  const draft = readSettingsForm();
  const nextConfig = configFromSettings(draft);

  if (!nextConfig) {
    commit(openSettings(state, draft, 'Enter both gateway URL and auth token.'));
    return;
  }

  commit(openSettings(state, draft, 'Testing connection...'));

  try {
    await sendTurn(nextConfig, 'status', 'Connection test. Reply with one short sentence.');
    commit(openSettings(state, draft, 'Connection ok.'));
  } catch (error) {
    commit(openSettings(state, draft, toUserErrorMessage(error)));
  }
}

function currentDraft(): RuntimeSettings {
  return readSettingsForm();
}

function readSettingsForm(): RuntimeSettings {
  const form = appRoot.querySelector<HTMLFormElement>('[data-settings-form="true"]');
  if (!form) {
    return state.settingsDraft;
  }

  const gatewayUrlInput = form.elements.namedItem('gatewayUrl');
  const authValueInput = form.elements.namedItem('authValue');
  const gatewayUrl = gatewayUrlInput instanceof HTMLInputElement ? gatewayUrlInput.value : state.settingsDraft.gatewayUrl;
  const authValue = authValueInput instanceof HTMLInputElement ? authValueInput.value : state.settingsDraft.authValue;

  return { gatewayUrl, authValue };
}

function emptySettings(seed?: Partial<RuntimeSettings>): RuntimeSettings {
  return {
    gatewayUrl: seed?.gatewayUrl ?? '',
    authValue: seed?.authValue ?? ''
  };
}

bindKeyboardInput(handleInput);
bindEvenInput(handleInput).catch(() => undefined);
initializeEvenDisplay().catch(() => undefined);
commit(state);
bootstrap().catch((error) => {
  console.warn('[config]', error);
  commit(openSettings(state, emptySettings(), 'Could not load settings.'));
});
