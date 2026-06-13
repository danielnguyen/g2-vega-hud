import type { InputEventName } from './input';
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
  channel: 'textEvent' | 'sysEvent' | 'unknown';
  eventType: string;
  mappedAction: InputEventName | null;
  eventSource: string | null;
  target: string | null;
  summary: string;
  handling: 'accepted' | 'gated' | 'ignored';
};

export type EvenInputBindingDebug = {
  status: 'idle' | 'binding' | 'ready' | 'failed';
  detail: string;
  updatedAt: string;
};

export type DebugState = {
  appVersion: string;
  currentSettings: RuntimeSettings;
  lastGlassesInputEvent: GlassesInputDebugEvent | null;
  evenInputBinding: EvenInputBindingDebug;
  lastGatewayRequest: GatewayRequestDebug | null;
  lastError: string | null;
};

export type AppState = {
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

export const MODES: Array<{ mode: Mode; label: string; prompt: string }> = [
  {
    mode: 'brief',
    label: 'Brief',
    prompt:
      'Give me a concise current status brief for my active threads. Include only the top 3 items and one next action. Keep each item short.'
  },
  {
    mode: 'ask',
    label: 'Ask',
    prompt:
      'What is the single most useful thing for me to pay attention to right now? Answer in 1-2 short sentences. Do not ask a follow-up unless absolutely necessary.'
  },
  {
    mode: 'recall',
    label: 'Recall',
    prompt: 'Recall one relevant thing from memory that would be useful right now. Keep it short, concrete, and actionable.'
  },
  {
    mode: 'status',
    label: 'Status',
    prompt: 'Give me a one sentence system status check for the VEGA / LLM Memory stack.'
  }
];
