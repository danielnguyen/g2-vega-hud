import type { InputEventName } from './input';
import type { G2NavigationState } from './navigation';
import type { RuntimeStatus } from './runtimeStatus';
import type { RuntimeSettings } from './settings';

export type Mode = 'brief' | 'ask' | 'recall' | 'status';

export type Screen = 'home' | 'loading' | 'pages' | 'error' | 'settings';

export type GatewayPageResponse = {
  request_id: string;
  conversation_id?: string;
  title: string;
  pages: string[];
  source: 'chat-orchestrator';
  status?: 'ok' | 'degraded' | 'failed';
  raw_length: number;
};

export type GatewayRequestDebug = {
  label: string;
  mode: Mode;
  status: 'pending' | 'ok' | 'degraded' | 'failed';
  updatedAt: string;
};

export type GlassesInputDebugEvent = {
  timestamp: string;
  channel: 'listEvent' | 'textEvent' | 'sysEvent' | 'unknown';
  eventType: string;
  mappedAction: InputEventName | null;
  eventSource: string | null;
  target: string | null;
  selectedIndex: number | null;
  summary: string;
  handling: 'accepted' | 'duplicate' | 'ignored';
};

export type EvenInputBindingDebug = {
  status: 'idle' | 'binding' | 'ready' | 'failed' | 'stopped';
  detail: string;
  updatedAt: string;
};

export type DebugState = {
  appVersion: string;
  currentSettings: RuntimeSettings;
  evenInputBinding: EvenInputBindingDebug;
  lastGlassesInputEvent: GlassesInputDebugEvent | null;
  lastGatewayRequest: GatewayRequestDebug | null;
  lastError: string | null;
};

export type AppState = {
  glassesNavigation: G2NavigationState;
  screen: Screen;
  selectedModeIndex: number;
  pageIndex: number;
  response: GatewayPageResponse | null;
  errorMessage: string | null;
  runtimeStatus: RuntimeStatus;
  settingsDraft: RuntimeSettings;
  settingsStatus: string | null;
  settingsRequired: boolean;
  debug: DebugState;
};
