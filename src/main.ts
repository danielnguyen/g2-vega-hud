import { configFromSettings, loadConfig, loadEnvConfig, type AppConfig } from './config';
import { createEvenDisplay, type EvenDisplay } from './even/evenDisplay';
import {
  bindEvenInput,
  type EvenInputBinding,
  type NormalizedEvenInputEvent
} from './even/evenInput';
import { checkGateway, createSttSession, sendTurn } from './gatewayClient';
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
import { createSpeechToTextProvider, type SpeechToTextSession } from './speechToText';
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
import type { AppState, DebugState, GatewayPageResponse } from './types';
import { APP_VERSION } from './version';
import './style.css';

const EMPTY_RESPONSE_MESSAGE = 'Gateway returned no renderable pages.';

type ActiveCapture = {
  session: SpeechToTextSession | null;
  microphoneEnabled: boolean;
  settled: boolean;
};

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
let activeCapture: ActiveCapture | null = null;
let activeConversationId: string | null = null;
let ccpTurnPending = false;

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

function handleInput(eventName: InputEventName): void {
  if (state.screen === 'home') {
    if (eventName === 'press') {
      void startListening();
    }
    return;
  }

  if (state.screen === 'connecting' || state.screen === 'listening') {
    if (eventName === 'doublePress') {
      void cancelActiveCapture();
    }
    return;
  }

  if (state.screen === 'pages') {
    if (eventName === 'up') commit(movePage(state, -1));
    if (eventName === 'down') commit(movePage(state, 1));
    if (eventName === 'press') void startListening();
    if (eventName === 'doublePress') commit(backHome(state));
    return;
  }

  if (state.screen === 'error' && (eventName === 'press' || eventName === 'doublePress')) {
    commit(backHome(state));
  }
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
      activeCapture?.session?.sendPcm(chunk);
    },
    onExit: cleanupForExit
  });
}

async function initializeEvenDisplay(): Promise<void> {
  evenDisplay = await createEvenDisplay();

  if (evenDisplay) {
    await evenDisplay.render(state);
  }
}

async function startListening(): Promise<void> {
  if (activeCapture || ccpTurnPending) {
    return;
  }

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

  if (!evenInput) {
    commit(withDebugError(showError(state, 'G2 microphone unavailable.'), 'G2 microphone unavailable.'));
    return;
  }

  const capture: ActiveCapture = {
    session: null,
    microphoneEnabled: false,
    settled: false
  };
  activeCapture = capture;
  commit(showConnecting(state));
  let failureStage: 'bootstrap' | 'provider' = 'bootstrap';

  try {
    const bootstrap = await createSttSession(config);
    if (activeCapture !== capture) {
      return;
    }

    failureStage = 'provider';
    const provider = createSpeechToTextProvider(bootstrap.provider);
    if (!provider) {
      throw new Error('unsupported_speech_provider');
    }

    const session = await provider.start(bootstrap.token, {
      onTranscriptUpdate: (transcript) => {
        if (activeCapture === capture && !capture.settled) {
          commit(showListening(state, transcript));
        }
      },
      onUtteranceComplete: (transcript) => {
        void completeUtterance(capture, transcript);
      },
      onError: () => {
        void failActiveCapture(capture);
      }
    });

    if (activeCapture !== capture) {
      session.cancel();
      return;
    }

    capture.session = session;
    capture.microphoneEnabled = true;
    await evenInput.setMicrophoneEnabled(true);

    if (activeCapture !== capture) {
      await terminateCapture(capture, 'cancel');
      return;
    }

    commit(showListening(state));
  } catch (error) {
    if (activeCapture !== capture) {
      return;
    }

    activeCapture = null;
    capture.settled = true;
    await terminateCapture(capture, 'cancel');
    commit(
      withDebugError(
        showError(state, 'Speech service unavailable.'),
        failureStage === 'bootstrap'
          ? sttBootstrapDebugMessage(error)
          : 'STT provider connection failed.'
      )
    );
  }
}

async function completeUtterance(capture: ActiveCapture, transcript: string): Promise<void> {
  if (activeCapture !== capture || capture.settled) {
    return;
  }

  capture.settled = true;
  activeCapture = null;
  await terminateCapture(capture, 'finish');

  const finalTranscript = transcript.trim();
  if (!finalTranscript) {
    commit(backHome(state, 'Nothing heard'));
    return;
  }

  await runConversationTurn(finalTranscript);
}

async function failActiveCapture(capture: ActiveCapture): Promise<void> {
  if (activeCapture !== capture || capture.settled) {
    return;
  }

  capture.settled = true;
  activeCapture = null;
  await terminateCapture(capture, 'cancel');
  commit(
    withDebugError(
      showError(state, 'Speech service unavailable.'),
      'STT provider stream failed.'
    )
  );
}

async function cancelActiveCapture(): Promise<void> {
  const capture = activeCapture;
  if (!capture) {
    return;
  }

  activeCapture = null;
  capture.settled = true;
  await terminateCapture(capture, 'cancel');
  commit(backHome(state));
}

async function terminateCapture(
  capture: ActiveCapture,
  disposition: 'finish' | 'cancel'
): Promise<void> {
  if (capture.microphoneEnabled) {
    capture.microphoneEnabled = false;
    try {
      await evenInput?.setMicrophoneEnabled(false);
    } catch {
      // Cleanup continues even if the bridge is already exiting.
    }
  }

  const session = capture.session;
  capture.session = null;
  if (!session) {
    return;
  }

  try {
    if (disposition === 'finish') {
      session.finish();
    } else {
      session.cancel();
    }
  } catch {
    // Provider cleanup is best effort after microphone shutdown.
  }
}

async function runConversationTurn(transcript: string): Promise<void> {
  if (ccpTurnPending || !config) {
    return;
  }

  ccpTurnPending = true;
  const conversationId = activeConversationId;
  commit({
    ...showThinking(state),
    runtimeStatus: markRequestStart(state.runtimeStatus),
    debug: {
      ...state.debug,
      lastGatewayRequest: {
        label: 'voice-turn',
        operation: 'conversation',
        status: 'pending',
        updatedAt: new Date().toISOString()
      },
      lastError: null
    }
  });

  try {
    const response = await sendTurn(config, transcript, {
      inputMode: 'voice_transcribed',
      ...(conversationId ? { conversationId } : {})
    });

    updateConversationReference(response);

    if (!hasRenderablePages(response.pages)) {
      throw new Error(EMPTY_RESPONSE_MESSAGE);
    }

    commit({
      ...showPages(state, response),
      runtimeStatus: markRequestSuccess(state.runtimeStatus, response.status ?? 'ok'),
      debug: {
        ...state.debug,
        lastGatewayRequest: {
          label: 'voice-turn',
          operation: 'conversation',
          status: response.status ?? 'ok',
          updatedAt: new Date().toISOString()
        },
        lastError: null
      }
    });
  } catch (error) {
    const message = toUserErrorMessage(error);
    commit({
      ...showError(state, message),
      runtimeStatus: markRequestFailure(state.runtimeStatus, message),
      debug: {
        ...state.debug,
        lastGatewayRequest: {
          label: 'voice-turn',
          operation: 'conversation',
          status: 'failed',
          updatedAt: new Date().toISOString()
        },
        lastError: message
      }
    });
  } finally {
    ccpTurnPending = false;
  }
}

function updateConversationReference(response: GatewayPageResponse): void {
  if (response.conversation_disposition === 'non_current') {
    activeConversationId = null;
  } else if (response.conversation_id) {
    activeConversationId = response.conversation_id;
  }
}

function cleanupForExit(): void {
  const capture = activeCapture;
  activeCapture = null;

  if (capture) {
    capture.settled = true;
    if (capture.microphoneEnabled) {
      capture.microphoneEnabled = false;
      void evenInput?.setMicrophoneEnabled(false).catch(() => undefined);
    }

    const session = capture.session;
    capture.session = null;
    try {
      session?.cancel();
    } catch {
      // The surface is exiting; cleanup remains best effort.
    }
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

  if (error.message === EMPTY_RESPONSE_MESSAGE) {
    return EMPTY_RESPONSE_MESSAGE;
  }

  if (/^Gateway returned HTTP \d+$/.test(error.message)) {
    return `${error.message}.`;
  }

  return 'Gateway request failed.';
}

function sttBootstrapDebugMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'STT bootstrap failed.';
  }

  const httpStatus = /^Gateway returned HTTP (\d+)$/.exec(error.message)?.[1];
  if (httpStatus) {
    return `STT bootstrap failed (HTTP ${httpStatus}).`;
  }

  if (error.message === 'Gateway timed out') {
    return 'STT bootstrap timed out.';
  }

  if (error.message === 'Could not reach gateway') {
    return 'STT bootstrap could not reach gateway.';
  }

  if (error.message === 'Invalid STT session response') {
    return 'STT bootstrap returned an invalid response.';
  }

  return 'STT bootstrap failed.';
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

function hasRenderablePages(pages: string[]): boolean {
  return pages.some((page) => page.trim().length > 0);
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
