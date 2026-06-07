import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';
import {
  ERROR_FOOTER,
  HOME_FOOTER,
  LOADING_FOOTER,
  PAGES_FOOTER,
  SETTINGS_FOOTER,
  SETTINGS_REQUIRED_FOOTER
} from '../constants';
import type { AppState } from '../types';
import { MODES } from '../types';
import { APP_VERSION } from '../version';

const TITLE_ID = 1;
const BODY_ID = 2;
const HELP_ID = 3;

type TextContainerPayload = {
  containerID: number;
  containerName: string;
  xPosition: number;
  yPosition: number;
  width: number;
  height: number;
  content: string;
  isEventCapture: 0 | 1;
};

type PageContainerPayload = {
  containerTotalNum: number;
  textObject: TextContainerPayload[];
};

type TextUpgradePayload = {
  containerID: number;
  containerName: string;
  content: string;
};

type EvenBridgeLike = {
  createStartUpPageContainer(container: PageContainerPayload): Promise<number>;
  textContainerUpgrade(container: TextUpgradePayload): Promise<boolean>;
};

type Frame = {
  title: string;
  body: string;
  help: string;
};

export type EvenDisplay = {
  render(state: AppState): Promise<void>;
};

export async function createEvenDisplay(timeoutMs = 1500): Promise<EvenDisplay | null> {
  try {
    const bridge = await withTimeout(waitForEvenAppBridge(), timeoutMs);
    const display = new EvenGlassesDisplay(bridge as unknown as EvenBridgeLike);
    await display.initialize();
    return display;
  } catch {
    return null;
  }
}

class EvenGlassesDisplay implements EvenDisplay {
  private initialized = false;

  constructor(private readonly bridge: EvenBridgeLike) {}

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const page: PageContainerPayload = {
      containerTotalNum: 3,
      textObject: [
        textContainer(TITLE_ID, 'title', 24, 24, 560, 48, APP_VERSION, 0),
        textContainer(BODY_ID, 'body', 24, 88, 560, 180, 'Ready.', 1),
        textContainer(HELP_ID, 'help', 24, 286, 560, 32, HOME_FOOTER, 0)
      ]
    };

    const result = await this.bridge.createStartUpPageContainer(page);
    this.initialized = result === 0;
  }

  async render(state: AppState): Promise<void> {
    if (!this.initialized) return;

    const frame = frameForState(state);

    await Promise.all([
      this.bridge.textContainerUpgrade(textUpgrade(TITLE_ID, 'title', frame.title)),
      this.bridge.textContainerUpgrade(textUpgrade(BODY_ID, 'body', frame.body)),
      this.bridge.textContainerUpgrade(textUpgrade(HELP_ID, 'help', frame.help))
    ]);
  }
}

function frameForState(state: AppState): Frame {
  if (state.screen === 'settings') {
    return {
      title: state.debug.appVersion,
      body: settingsBody(state),
      help: state.settingsRequired ? SETTINGS_REQUIRED_FOOTER : SETTINGS_FOOTER
    };
  }

  if (state.screen === 'home') {
    return {
      title: state.debug.appVersion,
      body: MODES.map((item, index) => `${index === state.selectedModeIndex ? '>' : ' '} ${item.label}`).join('\n'),
      help: HOME_FOOTER
    };
  }

  if (state.screen === 'loading') {
    const selected = MODES[state.selectedModeIndex];

    return {
      title: selected?.label ?? 'VEGA',
      body: 'Thinking...',
      help: LOADING_FOOTER
    };
  }

  if (state.screen === 'pages' && state.response) {
    return {
      title: `${state.response.title} ${state.pageIndex + 1}/${state.response.pages.length}`,
      body: formatForGlasses(state.response.pages[state.pageIndex] ?? ''),
      help: PAGES_FOOTER
    };
  }

  return {
    title: 'Gateway error',
    body: formatForGlasses(state.errorMessage ?? 'Unknown error'),
    help: ERROR_FOOTER
  };
}

function settingsBody(state: AppState): string {
  if (state.settingsRequired) {
    return 'Configure in phone app';
  }

  if (state.settingsStatus === 'Testing connection...') {
    return 'Checking gateway...';
  }

  if (state.runtimeStatus.lastCheckedAt) {
    if (state.runtimeStatus.connected === true) {
      return 'Gateway connected';
    }

    if (state.runtimeStatus.connected === false) {
      return 'Gateway error';
    }
  }

  return 'Configure in phone app';
}

function textContainer(
  containerID: number,
  containerName: string,
  xPosition: number,
  yPosition: number,
  width: number,
  height: number,
  content: string,
  isEventCapture: 0 | 1
): TextContainerPayload {
  return {
    containerID,
    containerName,
    xPosition,
    yPosition,
    width,
    height,
    content,
    isEventCapture
  };
}

function textUpgrade(containerID: number, containerName: string, content: string): TextUpgradePayload {
  return {
    containerID,
    containerName,
    content: normalizeForEvenDisplay(content)
  };
}

function formatForGlasses(value: string): string {
  const normalized = normalizeForEvenDisplay(value)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .trim();

  if (normalized.length <= 220) {
    return normalized;
  }

  return `${normalized.slice(0, 217).trim()}...`;
}

function normalizeForEvenDisplay(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[\u2022\u2023\u25E6\u2043\u2219]/g, '-')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
    .replace(/[^\x09\x0A\x20-\x7E]/g, '');
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('Even bridge unavailable')), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
