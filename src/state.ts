import type { RuntimeStatus } from './runtimeStatus';
import type { RuntimeSettings } from './settings';
import type { AppState, DebugState, GatewayPageResponse } from './types';

export function initialState(
  configured: boolean,
  settingsDraft: RuntimeSettings,
  runtimeStatus: RuntimeStatus,
  debug: DebugState
): AppState {
  return {
    screen: configured ? 'home' : 'settings',
    pageIndex: 0,
    response: null,
    liveTranscript: '',
    homeMessage: null,
    errorMessage: null,
    runtimeStatus,
    settingsDraft,
    settingsStatus: configured ? null : 'Settings required before use.',
    settingsRequired: !configured,
    debug
  };
}

export function showConnecting(state: AppState): AppState {
  return {
    ...state,
    screen: 'connecting',
    response: null,
    liveTranscript: '',
    homeMessage: null,
    errorMessage: null
  };
}

export function showListening(state: AppState, transcript = ''): AppState {
  return { ...state, screen: 'listening', liveTranscript: transcript, errorMessage: null };
}

export function showThinking(state: AppState): AppState {
  return { ...state, screen: 'thinking', liveTranscript: '', errorMessage: null };
}

export function showPages(state: AppState, response: GatewayPageResponse): AppState {
  return {
    ...state,
    screen: 'pages',
    response,
    pageIndex: 0,
    liveTranscript: '',
    errorMessage: null
  };
}

export function showError(state: AppState, message: string): AppState {
  return { ...state, screen: 'error', errorMessage: message };
}

export function backHome(state: AppState, homeMessage: string | null = null): AppState {
  return {
    ...state,
    screen: state.settingsRequired ? 'settings' : 'home',
    pageIndex: 0,
    response: null,
    liveTranscript: '',
    homeMessage,
    errorMessage: null
  };
}

export function movePage(state: AppState, delta: number): AppState {
  if (!state.response) {
    return state;
  }

  const nextIndex = wrap(state.pageIndex + delta, state.response.pages.length);
  return { ...state, pageIndex: nextIndex };
}

export function openSettings(state: AppState, settingsDraft?: RuntimeSettings, status?: string | null): AppState {
  return {
    ...state,
    screen: 'settings',
    response: null,
    liveTranscript: '',
    homeMessage: null,
    errorMessage: null,
    pageIndex: 0,
    settingsDraft: settingsDraft ?? state.settingsDraft,
    settingsStatus: status ?? state.settingsStatus
  };
}

export function applyConfig(
  state: AppState,
  settingsDraft: RuntimeSettings,
  configured: boolean,
  status: string | null,
  runtimeStatus: RuntimeStatus
): AppState {
  return {
    ...state,
    screen: configured ? 'home' : 'settings',
    response: null,
    liveTranscript: '',
    homeMessage: null,
    errorMessage: null,
    pageIndex: 0,
    runtimeStatus,
    settingsDraft,
    settingsStatus: status,
    settingsRequired: !configured
  };
}

function wrap(value: number, max: number): number {
  return ((value % max) + max) % max;
}
