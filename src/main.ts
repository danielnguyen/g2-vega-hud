import { configFromSettings, loadConfig, loadEnvConfig, type AppConfig } from './config';
import { resetEvenBridge, waitForEvenBridge } from './even/evenBridge';
import { createEvenDisplay, type EvenDisplay } from './even/evenDisplay';
import { bindEvenInput, type EvenLifecycleEvent, type NormalizedEvenInputEvent } from './even/evenInput';
import { sendTurn } from './gatewayClient';
import { bindKeyboardInput, type InputEventName } from './input';
import { filterDuplicateInput, type InputDedupeState } from './inputDedupe';
import { G2_HOME_ITEMS, transitionG2Navigation, type G2NavigationAction } from './navigation';
import { render } from './renderer';
import { initialRuntimeStatus, markConfigured, markConnectionCheck } from './runtimeStatus';
import { clearSettings, saveSettings, type RuntimeSettings } from './settings';
import {
  applyConfig,
  backHome,
  initialState,
  moveSelection,
  openSettings
} from './state';
import type { AppState, DebugState, EvenInputBindingDebug, EvenLifecycleDebug } from './types';
import { APP_VERSION } from './version';
import './style.css';

const CONNECTION_TEST_PROMPT = 'Give me a one sentence system status check for the VEGA / LLM Memory stack.';
const EMPTY_RESPONSE_MESSAGE = 'Gateway returned no renderable pages.';

const root = document.querySelector<HTMLDivElement>('#app');

if (!root) {
  throw new Error('Missing app root element');
}

const appRoot: HTMLDivElement = root;

let state: AppState = initialState(false, emptySettings(), initialRuntimeStatus(false), buildDebugState(emptySettings()));
let evenDisplay: EvenDisplay | null = null;
let evenInputUnsubscribe: (() => void) | null = null;
let config: AppConfig | null = null;
let inputDedupeState: InputDedupeState = null;
let evenIntegrationCleaned = false;

function commit(nextState: AppState): void {
  state = nextState;
  render(appRoot, state);
  bindModeClicks();
  bindSettingsControls();

  if (evenDisplay) {
    evenDisplay.render(state.glassesNavigation).catch(() => recordEvenFailure('Even display update failed.'));
  }
}

function bindModeClicks(): void {
  appRoot.querySelectorAll<HTMLElement>('[data-mode-index]').forEach((element) => {
    element.addEventListener('click', () => {
      const modeIndex = Number(element.dataset.modeIndex);

      if (!Number.isInteger(modeIndex) || modeIndex < 0 || modeIndex >= G2_HOME_ITEMS.length) {
        return;
      }

      applyNavigation({ type: 'select', index: modeIndex });
      applyNavigation({ type: 'open-selected' });
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

function handleInput(eventName: InputEventName, nativeSelectedIndex: number | null = null): void {
  const atHome = state.glassesNavigation.route === 'home';

  if (atHome && nativeSelectedIndex !== null) {
    applyNavigation({ type: 'select', index: nativeSelectedIndex });
  }

  if (eventName === 'doublePress') {
    applyNavigation({ type: 'back-or-exit' });
    return;
  }

  if (!atHome) return;
  if (eventName === 'press') applyNavigation({ type: 'open-selected' });
  if (nativeSelectedIndex === null && eventName === 'up') commit(moveSelection(state, -1));
  if (nativeSelectedIndex === null && eventName === 'down') commit(moveSelection(state, 1));
}

function handleEvenInput(event: NormalizedEvenInputEvent): void {
  const settingsDraft = state.screen === 'settings' ? currentDraft() : state.settingsDraft;
  const dedupe = event.mappedAction
    ? filterDuplicateInput(inputDedupeState, { key: event.dedupeKey, receivedAt: Date.now() })
    : { accepted: false, state: inputDedupeState };
  inputDedupeState = dedupe.state;
  const handledEvent: NormalizedEvenInputEvent = {
    ...event,
    handling: !event.mappedAction ? 'ignored' : dedupe.accepted ? 'accepted' : 'duplicate'
  };

  const nextState = {
    ...state,
    settingsDraft,
    debug: {
      ...state.debug,
      lastGlassesInputEvent: handledEvent
    }
  };

  if (handledEvent.lifecycleEvent) {
    commitPhoneState(nextState);
    handleEvenLifecycle(handledEvent.lifecycleEvent);
    return;
  }

  commit(nextState);

  if (handledEvent.mappedAction && handledEvent.handling === 'accepted') {
    handleInput(handledEvent.mappedAction, handledEvent.selectedIndex);
  }
}

async function initializeEvenIntegration(): Promise<void> {
  evenIntegrationCleaned = false;
  updateEvenInputBinding('binding', 'Waiting for shared Even bridge.');

  try {
    const bridge = await waitForEvenBridge();
    if (evenIntegrationCleaned) return;

    const display = await createEvenDisplay(bridge);
    if (evenIntegrationCleaned) return;

    evenDisplay = display;
    evenInputUnsubscribe?.();
    evenInputUnsubscribe = bindEvenInput(bridge, handleEvenInput);
    updateEvenInputBinding('ready', 'Bound to shared Even bridge.');
    updateEvenLifecycle('foreground', 'Integration active.');
  } catch {
    if (evenIntegrationCleaned) return;
    evenDisplay = null;
    evenInputUnsubscribe?.();
    evenInputUnsubscribe = null;
    resetEvenBridge();
    updateEvenInputBinding('failed', 'Even bridge or input binding unavailable.');
  }
}

function handleEvenLifecycle(event: EvenLifecycleEvent): void {
  if (event === 'foreground-enter') {
    updateEvenLifecycle('foreground', 'Foreground entered.');
    evenDisplay?.render(state.glassesNavigation).catch(() => recordEvenFailure('Even display update failed.'));
    return;
  }

  if (event === 'foreground-exit') {
    updateEvenLifecycle('background', 'Foreground exited.');
    return;
  }

  cleanupEvenIntegration(event === 'system-exit' ? 'System exit received.' : 'Abnormal exit received.');
}

function cleanupEvenIntegration(detail: string): void {
  if (evenIntegrationCleaned) return;
  evenIntegrationCleaned = true;

  const unsubscribe = evenInputUnsubscribe;
  evenInputUnsubscribe = null;
  try {
    unsubscribe?.();
  } catch {
    // Cleanup remains conservative and idempotent even if the host handler throws.
  }
  evenDisplay = null;
  inputDedupeState = null;
  resetEvenBridge();
  commitPhoneState({
    ...state,
    debug: {
      ...state.debug,
      evenInputBinding: {
        status: 'stopped',
        detail: 'Input handler released.',
        updatedAt: new Date().toISOString()
      },
      evenLifecycle: {
        status: 'terminated',
        detail,
        updatedAt: new Date().toISOString()
      }
    }
  });
}

function applyNavigation(action: G2NavigationAction): void {
  const transition = transitionG2Navigation(state.glassesNavigation, action);
  commit({
    ...state,
    glassesNavigation: transition.state,
    selectedModeIndex: transition.state.selectedIndex
  });

  if (transition.effect === 'request-host-exit') {
    evenDisplay?.requestHostExit().catch(() => recordEvenFailure('Host exit request failed.'));
  }
}

function updateEvenInputBinding(status: EvenInputBindingDebug['status'], detail: string): void {
  commit({
    ...state,
    debug: {
      ...state.debug,
      evenInputBinding: { status, detail, updatedAt: new Date().toISOString() }
    }
  });
}

function updateEvenLifecycle(status: EvenLifecycleDebug['status'], detail: string): void {
  commitPhoneState({
    ...state,
    debug: {
      ...state.debug,
      evenLifecycle: { status, detail, updatedAt: new Date().toISOString() }
    }
  });
}

function commitPhoneState(nextState: AppState): void {
  state = nextState;
  render(appRoot, state);
  bindModeClicks();
  bindSettingsControls();
}

function recordEvenFailure(detail: string): void {
  commitPhoneState({
    ...state,
    debug: {
      ...state.debug,
      evenInputBinding: { status: 'failed', detail, updatedAt: new Date().toISOString() }
    }
  });
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

  if (error.message === EMPTY_RESPONSE_MESSAGE) {
    return EMPTY_RESPONSE_MESSAGE;
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

  const nextState = initialState(
    configured,
    settingsDraft,
    initialRuntimeStatus(configured),
    buildDebugState(settingsDraft, state.debug)
  );
  commit({
    ...nextState,
    glassesNavigation: state.glassesNavigation,
    selectedModeIndex: state.glassesNavigation.selectedIndex
  });
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

function buildDebugState(currentSettings: RuntimeSettings, previous?: Partial<DebugState>): DebugState {
  return {
    appVersion: APP_VERSION,
    currentSettings,
    evenInputBinding: previous?.evenInputBinding ?? {
      status: 'idle',
      detail: 'Not started.',
      updatedAt: new Date().toISOString()
    },
    evenLifecycle: previous?.evenLifecycle ?? {
      status: 'idle',
      detail: 'No lifecycle event received.',
      updatedAt: new Date().toISOString()
    },
    lastGlassesInputEvent: previous?.lastGlassesInputEvent ?? null,
    lastGatewayRequest: previous?.lastGatewayRequest ?? null,
    lastError: previous?.lastError ?? null
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

bindKeyboardInput(handleInput);
commit(state);
initializeEvenIntegration().catch(() => updateEvenInputBinding('failed', 'Even integration startup failed.'));
bootstrap().catch((error) => {
  void error;
  commit({
    ...openSettings(state, emptySettings(), 'Could not load settings.'),
    runtimeStatus: markConfigured(state.runtimeStatus, false),
    debug: {
      ...state.debug,
      lastError: 'Could not load settings.'
    }
  });
});

window.addEventListener('pagehide', () => {
  cleanupEvenIntegration('Page hidden.');
});
