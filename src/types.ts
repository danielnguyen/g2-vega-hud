export type Mode = 'brief' | 'ask' | 'recall' | 'status';

export type Screen = 'home' | 'loading' | 'pages' | 'error';

export type GatewayPageResponse = {
  request_id: string;
  conversation_id?: string;
  title: string;
  pages: string[];
  source: 'chat-orchestrator';
  status?: 'ok' | 'degraded' | 'failed';
  raw_length: number;
};

export type AppState = {
  screen: Screen;
  selectedModeIndex: number;
  pageIndex: number;
  response: GatewayPageResponse | null;
  errorMessage: string | null;
};

export const MODES: Array<{ mode: Mode; label: string; prompt: string }> = [
  {
    mode: 'brief',
    label: 'Brief',
    prompt: 'Give me a concise current status brief for my active threads.'
  },
  {
    mode: 'ask',
    label: 'Ask',
    prompt: 'What should I pay attention to right now?'
  },
  {
    mode: 'recall',
    label: 'Recall',
    prompt: 'Recall the most relevant thing I should remember right now.'
  },
  {
    mode: 'status',
    label: 'Status',
    prompt: 'Give me a one sentence system and workflow status check.'
  }
];
