import { configFromSettings, loadConfig, loadEnvConfig, type AppConfig } from './config';
import { createEvenDisplay, type EvenDisplay } from './even/evenDisplay';
import { bindEvenInput, type NormalizedEvenInputEvent } from './even/evenInput';
import { sendTurn } from './gatewayClient';
import { bindKeyboardInput, type InputEventName } from './input';
import { render } from './renderer';
import {
  initialRuntimeStatus,
  markConfigured,
  markConnectionCheck,
  markRequestFailure,
  markRequestStart,
  markRequestSuccess
} from './runtimeStatus';
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
import { MODES, type AppState, type DebugState, type Mode } from './types';
import { APP_VERSION } from './version';
import './style.css';

const CONNECTION_TEST_PROMPT = 'Give me a one sentence system status check for the VEGA / LLM Memory stack.';
const GLASSES_HELLO_PROMPT = 'Say hello from VEGA HUD';

const root = document.querySelector<HTMLDivElement>('#app');

if (!root) {
  throw new Error('Missing app root element');
}

const appRoot: HTMLDivElement = root;

let state: AppState = initialState(false, emptySettings(), initialRuntimeStatus(false), buildDebugState(emptySettings()));
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
    commit(withDebugError(showError(state, 'No mode selected'), 'No mode selected'));
    return;
  }

  await runGatewayTurn(selected.label, selected.mode, selected.prompt);
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
    if (eventName === 'doublePress') void runHelloFromGlasses();
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

function handleEvenInput(event: NormalizedEvenInputEvent): void {
  commit({
    ...state,
    debug: {
      ...state.debug,
      lastGlassesInputEvent: event
    }
  });

  if (event.mappedAction) {
    handleInput(event.mappedAction);
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
  const configured = Boolean(config);

  commit(initialState(configured, settingsDraft, initialRuntimeStatus(configured), buildDebugState(settingsDraft)));
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
  commit(
    withCurrentSettings(
      applyConfig(
        state,
        draft,
        true,
        'Settings saved.',
        markConfigured(state.runtimeStatus, true)
      ),
      draft
    )
  );
}

async function handleClearSettings(): Promise<void> {
  const fallbackConfig = loadEnvConfig();

  await clearSettings();
  config = fallbackConfig;

  if (fallbackConfig) {
    const fallbackSettings = { gatewayUrl: fallbackConfig.gatewayUrl, authValue: fallbackConfig.authValue };
    commit(
      withCurrentSettings(
        applyConfig(
          state,
          fallbackSettings,
          true,
          'Saved settings cleared. Using env fallback.',
          markConfigured(state.runtimeStatus, true)
        ),
        fallbackSettings
      )
    );
    return;
  }

  commit(
    withCurrentSettings(
      applyConfig(
        state,
        emptySettings(),
        false,
        'Saved settings cleared. Settings required before use.',
        markConfigured(state.runtimeStatus, false)
      ),
      emptySettings()
    )
  );
}

async function handleTestConnection(): Promise<void> {
  const draft = readSettingsForm();
  const nextConfig = configFromSettings(draft);

  if (!nextConfig) {
    commit(openSettings(state, draft, 'Enter both gateway URL and auth token.'));
    return;
  }

  commit({
    ...openSettings(state, draft, 'Testing connection...'),
    runtimeStatus: markConnectionCheck(state.runtimeStatus, 'start'),
    debug: {
      ...state.debug,
      lastGatewayRequest: {
        label: 'connection-test',
        mode: 'status',
        status: 'pending',
        updatedAt: new Date().toISOString()
      },
      lastError: null
    }
  });

  try {
    const response = await sendTurn(nextConfig, 'status', CONNECTION_TEST_PROMPT);
    commit({
      ...openSettings(state, draft, 'Connection ok.'),
      runtimeStatus: markConnectionCheck(state.runtimeStatus, 'success', response.status ?? 'ok'),
      debug: {
        ...state.debug,
        lastGatewayRequest: {
          label: 'connection-test',
          mode: 'status',
          status: response.status ?? 'ok',
          updatedAt: new Date().toISOString()
        },
        lastError: null
      }
    });
  } catch (error) {
    const message = toUserErrorMessage(error);
    commit({
      ...openSettings(state, draft, message),
      runtimeStatus: markConnectionCheck(state.runtimeStatus, 'failure', 'failed', message),
      debug: {
        ...state.debug,
        lastGatewayRequest: {
          label: 'connection-test',
          mode: 'status',
          status: 'failed',
          updatedAt: new Date().toISOString()
        },
        lastError: message
      }
    });
  }
}

async function runHelloFromGlasses(): Promise<void> {
  await runGatewayTurn('glasses-hello', 'ask', GLASSES_HELLO_PROMPT);
}

async function runGatewayTurn(label: string, mode: Mode, text: string): Promise<void> {
  if (!config) {
    commit({
      ...openSettings(state, state.settingsDraft, 'Settings required before use.'),
      runtimeStatus: markConfigured(state.runtimeStatus, false),
      debug: {
        ...state.debug,
        lastError: 'Settings required before use.'
      }
    });
    return;
  }

  commit({
    ...showLoading(state),
    runtimeStatus: markRequestStart(state.runtimeStatus, mode),
    debug: {
      ...state.debug,
      lastGatewayRequest: {
        label,
        mode,
        status: 'pending',
        updatedAt: new Date().toISOString()
      },
      lastError: null
    }
  });

  try {
    const response = await sendTurn(config, mode, text);
    commit({
      ...showPages(state, response),
      runtimeStatus: markRequestSuccess(state.runtimeStatus, mode, response.status ?? 'ok'),
      debug: {
        ...state.debug,
        lastGatewayRequest: {
          label,
          mode,
          status: response.status ?? 'ok',
          updatedAt: new Date().toISOString()
        },
        lastError: null
      }
    });
  } catch (error) {
    console.warn('[gateway]', error);
    const message = toUserErrorMessage(error);
    commit({
      ...showError(state, message),
      runtimeStatus: markRequestFailure(state.runtimeStatus, mode, message),
      debug: {
        ...state.debug,
        lastGatewayRequest: {
          label,
          mode,
          status: 'failed',
          updatedAt: new Date().toISOString()
        },
        lastError: message
      }
    });
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

function buildDebugState(currentSettings: RuntimeSettings): DebugState {
  return {
    appVersion: APP_VERSION,
    currentSettings,
    lastGlassesInputEvent: null,
    lastGatewayRequest: null,
    lastError: null
  };
}

function withCurrentSettings(nextState: AppState, currentSettings: RuntimeSettings): AppState {
  return {
    ...nextState,
    debug: {
      ...nextState.debug,
      currentSettings
    }
  };
}

function withDebugError(nextState: AppState, message: string): AppState {
  return {
    ...nextState,
    debug: {
      ...nextState.debug,
      lastError: message
    }
  };
}

bindKeyboardInput(handleInput);
bindEvenInput(handleEvenInput).catch(() => undefined);
initializeEvenDisplay().catch(() => undefined);
commit(state);
bootstrap().catch((error) => {
  console.warn('[config]', error);
  commit({
    ...openSettings(state, emptySettings(), 'Could not load settings.'),
    runtimeStatus: markConfigured(state.runtimeStatus, false),
    debug: {
      ...state.debug,
      lastError: 'Could not load settings.'
    }
  });
});
