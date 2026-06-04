import type { AppState, GatewayPageResponse } from './types';
import { MODES } from './types';

export function initialState(): AppState {
  return {
    screen: 'home',
    selectedModeIndex: 0,
    pageIndex: 0,
    response: null,
    errorMessage: null
  };
}

export function moveSelection(state: AppState, delta: number): AppState {
  const nextIndex = wrap(state.selectedModeIndex + delta, MODES.length);
  return { ...state, selectedModeIndex: nextIndex };
}

export function showLoading(state: AppState): AppState {
  return { ...state, screen: 'loading', errorMessage: null };
}

export function showPages(state: AppState, response: GatewayPageResponse): AppState {
  return { ...state, screen: 'pages', response, pageIndex: 0, errorMessage: null };
}

export function showError(state: AppState, message: string): AppState {
  return { ...state, screen: 'error', errorMessage: message };
}

export function backHome(state: AppState): AppState {
  return { ...state, screen: 'home', pageIndex: 0, response: null, errorMessage: null };
}

export function movePage(state: AppState, delta: number): AppState {
  if (!state.response) {
    return state;
  }

  const nextIndex = wrap(state.pageIndex + delta, state.response.pages.length);
  return { ...state, pageIndex: nextIndex };
}

function wrap(value: number, max: number): number {
  return ((value % max) + max) % max;
}
