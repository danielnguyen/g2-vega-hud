import { configFromSettings, loadConfig, loadEnvConfig, type AppConfig } from './config';
import { createEvenDisplay, type EvenDisplay } from './even/evenDisplay';
import {
  bindEvenInput,
  type EvenInputBinding,
  type NormalizedEvenInputEvent
} from './even/evenInput';
import { checkGateway } from './gatewayClient';
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
import { Conversation } from './conversation';
import { ConversationInput } from './conversationInput';
import {
  applyConfig,
  backHome,
  initialState,
  movePage,
  openSettings,
  showConnecting,
  showError,
  showListening,
  showPages,
  showThinking
} from './state';
import type { AppState, DebugState } from './types';
import { APP_VERSION } from './version';
import './style.css';

const EMPTY_RESPONSE_MESSAGE = 'Gateway returned no renderable pages.';

const root = document.querySelector<HTMLDivElement>('#app');

if (!root) {
  throw new Error('Missing app root element');
}

const appRoot: HTMLDivElement = root;

let state: AppState = initialState(
  false,
  emptySettings(),
  initialRuntimeStatus(false),
  buildDebugState(emptySettings())
);
let evenDisplay: EvenDisplay | null = null;
let evenInput: EvenInputBinding | null = null;
let config: AppConfig | null = null;
const conversation = new Conversation({
  ready: () => Boolean(evenInput && evenDisplay),
  microphone: enabled => evenInput!.setMicrophoneEnabled(enabled),
  phase: (phase, transcript) => {
    if (phase === 'connecting') commit(showConnecting(state));
    else if (phase === 'listening') commit(showListening(state, transcript));
    else if (phase === 'stopping') commit({ ...state, screen: 'stopping', liveTranscript: '' });
    else commit({
      ...showThinking(state), runtimeStatus: markRequestStart(state.runtimeStatus),
      debug: { ...state.debug, lastError: null, lastGatewayRequest: {
        label: 'voice-turn', operation: 'conversation', status: 'pending', updatedAt: new Date().toISOString()
      } }
    });
  },
  answer: response => commit({
    ...showPages(state, response),
    runtimeStatus: markRequestSuccess(state.runtimeStatus, response.status ?? 'ok'),
    debug: { ...state.debug, lastError: null, lastGatewayRequest: {
      label: 'voice-turn', operation: 'conversation', status: response.status ?? 'ok',
      updatedAt: new Date().toISOString()
    } }
  }),
  stopped: message => commit({
    ...state, screen: state.response ? 'pages' : 'home', liveTranscript: '', homeMessage: message
  }),
  error: message => commit({
    ...withDebugError(showError(state, message), message),
    runtimeStatus: markRequestFailure(state.runtimeStatus, message),
    debug: { ...state.debug, lastError: message, lastGatewayRequest: {
      label: 'voice-turn', operation: 'conversation', status: 'failed', updatedAt: new Date().toISOString()
    } }
  })
});

function commit(nextState: AppState): void {
  state = nextState;
  render(appRoot, state);
  bindConversationControls();
  bindSettingsControls();

  if (evenDisplay) {
    evenDisplay.render(state).catch(() => undefined);
  }
}

function bindConversationControls(): void {
  appRoot.querySelectorAll<HTMLElement>('[data-conversation-action]').forEach((element) => {
    element.addEventListener('click', () => {
      const action = element.dataset.conversationAction;
      if (action === 'start') {
        void startListening();
      }
      if (action === 'stop') {
        conversation.stop();
      }
      if (action === 'home') {
        commit(backHome(state));
      }
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

const conversationInput = new ConversationInput({
  state: () => state,
  busy: () => conversation.busy,
  canExit: () => conversation.canExit,
  start: () => { void startListening(); },
  stop: () => conversation.stop(),
  movePage: delta => commit(movePage(state, delta)),
  home: () => commit(backHome(state)),
  exit: () => evenInput?.requestExit() ?? Promise.resolve('unsupported'),
  message: message => commit({ ...state, homeMessage: message, errorMessage: message })
});

function handleInput(eventName: InputEventName): void {
  conversationInput.handle(eventName);
}

function handleEvenInput(event: NormalizedEvenInputEvent): void {
  const settingsDraft = state.screen === 'settings' ? currentDraft() : state.settingsDraft;

  commit({
    ...state,
    settingsDraft,
    debug: {
      ...state.debug,
      lastGlassesInputEvent: event
    }
  });

  if (event.mappedAction) {
    handleInput(event.mappedAction);
  }
}

async function initializeEvenInput(): Promise<void> {
  evenInput = await bindEvenInput({
    onInput: handleEvenInput,
    onPcm: (chunk) => {
      conversation.sendPcm(chunk);
    },
    onExit: cleanupForExit,
    onOverlayChanged: visible => {
      conversation.setOverlayVisible(visible);
      conversationInput.setOverlayVisible(visible);
    }
  });
}

async function initializeEvenDisplay(): Promise<void> {
  evenDisplay = await createEvenDisplay();

  if (evenDisplay) {
    await evenDisplay.render(state);
  }
}

async function startListening(): Promise<void> {
  if (conversation.busy) return;
  if (!config) {
    commit(openSettings(state, state.settingsDraft, 'Settings required before use.'));
    return;
  }
  conversation.start(config);
}

function cleanupForExit(): void {
  conversation.stop(true);
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

  commit(
    initialState(
      configured,
      settingsDraft,
      initialRuntimeStatus(configured),
      buildDebugState(settingsDraft)
    )
  );
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
    const fallbackSettings = {
      gatewayUrl: fallbackConfig.gatewayUrl,
      authValue: fallbackConfig.authValue
    };
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
        operation: 'status-check',
        status: 'pending',
        updatedAt: new Date().toISOString()
      },
      lastError: null
    }
  });

  try {
    await checkGateway(nextConfig);
    commit({
      ...openSettings(state, draft, 'Connection ok.'),
      runtimeStatus: markConnectionCheck(state.runtimeStatus, 'success', 'ok'),
      debug: {
        ...state.debug,
        lastGatewayRequest: {
          label: 'connection-test',
          operation: 'status-check',
          status: 'ok',
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
          operation: 'status-check',
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
  const gatewayUrl =
    gatewayUrlInput instanceof HTMLInputElement
      ? gatewayUrlInput.value
      : state.settingsDraft.gatewayUrl;
  const authValue =
    authValueInput instanceof HTMLInputElement
      ? authValueInput.value
      : state.settingsDraft.authValue;

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
void initializeEvenInput();
void initializeEvenDisplay();
window.addEventListener('beforeunload', cleanupForExit);
window.addEventListener('offline', cleanupForExit);
commit(state);
bootstrap().catch(() => {
  commit({
    ...openSettings(state, emptySettings(), 'Could not load settings.'),
    runtimeStatus: markConfigured(state.runtimeStatus, false),
    debug: {
      ...state.debug,
      lastError: 'Could not load settings.'
    }
  });
});
