import type { InputEventName } from './input';
import type { RuntimeStatus } from './runtimeStatus';
import type { RuntimeSettings } from './settings';

export type Screen =
  | 'home'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'pages'
  | 'error'
  | 'settings';

export type GatewayPageResponse = {
  request_id: string;
  conversation_id?: string;
  title: string;
  pages: string[];
  source: 'chat-orchestrator';
  status?: 'ok' | 'degraded' | 'failed';
  conversation_disposition?: 'non_current';
  raw_length: number;
};

export type SttSessionBootstrap = {
  provider: string;
  token: string;
  expires_in: number;
};

export type GatewayRequestDebug = {
  label: string;
  operation: 'conversation' | 'status-check';
  status: 'pending' | 'ok' | 'degraded' | 'failed';
  updatedAt: string;
};

export type GlassesInputDebugEvent = {
  timestamp: string;
  channel: 'textEvent' | 'sysEvent' | 'unknown';
  eventType: string;
  mappedAction: InputEventName | null;
  eventSource: string | null;
  target: string | null;
  summary: string;
};

export type DebugState = {
  appVersion: string;
  currentSettings: RuntimeSettings;
  lastGlassesInputEvent: GlassesInputDebugEvent | null;
  lastGatewayRequest: GatewayRequestDebug | null;
  lastError: string | null;
};

export type AppState = {
  screen: Screen;
  pageIndex: number;
  response: GatewayPageResponse | null;
  liveTranscript: string;
  homeMessage: string | null;
  errorMessage: string | null;
  runtimeStatus: RuntimeStatus;
  settingsDraft: RuntimeSettings;
  settingsStatus: string | null;
  settingsRequired: boolean;
  debug: DebugState;
};
