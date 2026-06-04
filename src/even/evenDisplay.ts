import {
  waitForEvenAppBridge,
  type CreateStartUpPageContainer,
  type TextContainerProperty,
  type TextContainerUpgrade
} from '@evenrealities/even_hub_sdk';
import type { AppState } from '../types';
import { MODES } from '../types';

const TITLE_ID = 1;
const BODY_ID = 2;
const HELP_ID = 3;

export type EvenDisplay = {
  render(state: AppState): Promise<void>;
};

export async function createEvenDisplay(timeoutMs = 1500): Promise<EvenDisplay | null> {
  try {
    const bridge = await withTimeout(waitForEvenAppBridge(), timeoutMs);
    const display = new EvenGlassesDisplay(bridge as EvenBridgeLike);
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

    const page: CreateStartUpPageContainer = {
      containerTotalNum: 3,
      textObject: [
        textContainer(TITLE_ID, 'title', 24, 24, 560, 48, 'VEGA HUD', 0),
        textContainer(BODY_ID, 'body', 24, 88, 560, 180, 'Ready.', 1),
        textContainer(HELP_ID, 'help', 24, 286, 560, 32, 'Swipe: move • Tap: select', 0)
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

type EvenBridgeLike = {
  createStartUpPageContainer(container: CreateStartUpPageContainer): Promise<number>;
  textContainerUpgrade(container: TextContainerUpgrade): Promise<boolean>;
};

type Frame = {
  title: string;
  body: string;
  help: string;
};

function frameForState(state: AppState): Frame {
  if (state.screen === 'home') {
    return {
      title: 'VEGA HUD',
      body: MODES.map((item, index) => `${index === state.selectedModeIndex ? '>' : ' '} ${item.label}`).join('\n'),
      help: 'Swipe: move • Tap: select'
    };
  }

  if (state.screen === 'loading') {
    const selected = MODES[state.selectedModeIndex];
    return {
      title: selected?.label ?? 'VEGA',
      body: 'Thinking...',
      help: 'Double tap: cancel'
    };
  }

  if (state.screen === 'pages' && state.response) {
    return {
      title: `${state.response.title} ${state.pageIndex + 1}/${state.response.pages.length}`,
      body: formatForGlasses(state.response.pages[state.pageIndex] ?? ''),
      help: 'Swipe: page • Tap: home'
    };
  }

  return {
    title: 'Gateway error',
    body: formatForGlasses(state.errorMessage ?? 'Unknown error'),
    help: 'Tap: home'
  };
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
): TextContainerProperty {
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

function textUpgrade(containerID: number, containerName: string, content: string): TextContainerUpgrade {
  return {
    containerID,
    containerName,
    content
  };
}

function formatForGlasses(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= 220) return normalized;
  return `${normalized.slice(0, 217).trim()}...`;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('Even bridge unavailable')), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
