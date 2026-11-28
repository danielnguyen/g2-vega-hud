import { ImageRawDataUpdateResult, ImageContainerProperty, ImageRawDataUpdate, waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';
import {
  CONNECTING_FOOTER,
  ERROR_FOOTER,
  HOME_FOOTER,
  LISTENING_FOOTER,
  PAGES_FOOTER,
  SETTINGS_FOOTER,
  SETTINGS_REQUIRED_FOOTER,
  THINKING_FOOTER
} from '../constants';
import type { AppState } from '../types';
import { APP_VERSION } from '../version';
import { mavisBytes, mavisForState, type MavisSprite } from '../mavis';

const TITLE_ID = 1;
const BODY_ID = 2;
const HELP_ID = 3;
const MAVIS_ID = 4;

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
  imageObject?: ImageContainerProperty[];
};

type TextUpgradePayload = {
  containerID: number;
  containerName: string;
  content: string;
};

type EvenBridgeLike = {
  createStartUpPageContainer(container: PageContainerPayload): Promise<number>;
  textContainerUpgrade(container: TextUpgradePayload): Promise<boolean>;
  updateImageRawData?(data: ImageRawDataUpdate): Promise<ImageRawDataUpdateResult>;
  rebuildPageContainer?(container: PageContainerPayload): Promise<boolean>;
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
    await withTimeout(display.initialize(), timeoutMs);
    return display;
  } catch {
    return null;
  }
}

class EvenGlassesDisplay implements EvenDisplay {
  private initialized = false;
  private writes: Promise<void> = Promise.resolve();
  private revision = 0;
  private imagesEnabled = false;
  private imageBusy = false;
  private pendingSprite: MavisSprite | undefined;
  private sentSprite: MavisSprite | undefined;
  private latestState: AppState | undefined;

  constructor(private readonly bridge: EvenBridgeLike) {}

  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.imagesEnabled = typeof this.bridge.updateImageRawData === 'function' &&
      typeof this.bridge.rebuildPageContainer === 'function';
    let result: number;
    try {
      result = await this.bridge.createStartUpPageContainer(this.page(this.imagesEnabled));
    } catch (error) {
      if (!this.imagesEnabled) throw error;
      result = -1;
    }
    if (result !== 0 && this.imagesEnabled) {
      this.imagesEnabled = false;
      // Startup is one-shot, including a rejected image layout. Subsequent
      // page creation must use rebuild and its boolean acknowledgement.
      const recovered = await this.bridge.rebuildPageContainer!(this.page(false));
      result = recovered === true ? 0 : -1;
    }
    if (result !== 0) throw new Error('Glasses startup page unavailable');
    this.initialized = true;
  }

  async render(state: AppState): Promise<void> {
    if (!this.initialized) return;

    this.latestState = state;
    this.queueSprite(mavisForState(state));
    const frame = frameForState(state);
    const revision = ++this.revision;
    this.writes = this.writes.catch(() => undefined).then(async () => {
      if (revision !== this.revision) return;
      await Promise.allSettled([
        this.bridge.textContainerUpgrade(textUpgrade(TITLE_ID, 'title', frame.title)),
        this.bridge.textContainerUpgrade(textUpgrade(BODY_ID, 'body', frame.body)),
        this.bridge.textContainerUpgrade(textUpgrade(HELP_ID, 'help', frame.help))
      ]);
    });
    return this.writes;
  }

  private page(withImage: boolean): PageContainerPayload {
    const frame = this.latestState ? frameForState(this.latestState) :
      { title: APP_VERSION, body: 'Ready.', help: HOME_FOOTER };
    return {
      containerTotalNum: withImage ? 4 : 3,
      textObject: [
        textContainer(TITLE_ID, 'title', 112, 8, 440, 80, frame.title, 0),
        textContainer(BODY_ID, 'body', 24, 92, 528, 156, frame.body, 1),
        textContainer(HELP_ID, 'help', 24, 256, 528, 32, frame.help, 0)
      ],
      ...(withImage ? { imageObject: [new ImageContainerProperty({
        containerID: MAVIS_ID, containerName: 'mavis',
        xPosition: 24, yPosition: 8, width: 80, height: 80
      })] } : {})
    };
  }

  private queueSprite(sprite: MavisSprite): void {
    if (!this.imagesEnabled) return;
    // One in-flight transfer plus one replaceable desired state, never a FIFO.
    this.pendingSprite = sprite;
    if (!this.imageBusy) void this.flushSprite();
  }

  private async flushSprite(): Promise<void> {
    const sprite = this.pendingSprite;
    this.pendingSprite = undefined;
    if (!this.imagesEnabled || sprite === undefined || sprite === this.sentSprite) return;
    this.imageBusy = true;
    try {
      const result = await withTimeout(this.bridge.updateImageRawData!(new ImageRawDataUpdate({
        containerID: MAVIS_ID, containerName: 'mavis', imageData: mavisBytes(sprite)
      })), 1500);
      if (!ImageRawDataUpdateResult.isSuccess(result)) throw new Error('Image unavailable');
      this.sentSprite = sprite;
    } catch {
      // A timed-out native write may still be running: never start another image
      // transfer. Attempt to remove the container to clear a stale listening pose.
      this.imagesEnabled = false;
      this.pendingSprite = undefined;
      void this.removeSprite();
    } finally {
      this.imageBusy = false;
      if (this.imagesEnabled && this.pendingSprite !== undefined) void this.flushSprite();
    }
  }

  private async removeSprite(): Promise<void> {
    try {
      // Text and microphone work never wait for this optional recovery operation.
      await this.bridge.rebuildPageContainer!(this.page(false));
      // A delayed rebuild may contain old text; immediately restore the newest frame.
      if (this.latestState) void this.render(this.latestState).catch(() => undefined);
    } catch {
      // Existing text containers/input remain usable when the host rejects rebuild.
    }
  }
}

export function frameForState(state: AppState): Frame {
  if (state.screen === 'settings') {
    return {
      title: state.debug.appVersion,
      body: settingsBody(state),
      help: state.settingsRequired ? SETTINGS_REQUIRED_FOOTER : SETTINGS_FOOTER
    };
  }

  if (state.screen === 'home') {
    return {
      title: 'CCP Conversation',
      body: state.homeMessage ? `${state.homeMessage}\n\nTap to talk` : 'Tap to talk',
      help: HOME_FOOTER
    };
  }

  if (['connecting', 'listening', 'thinking', 'stopping'].includes(state.screen)) {
    const status = state.screen === 'connecting' ? 'Connecting...' :
      state.screen === 'listening' ? 'Listening...' :
      state.screen === 'stopping' ? 'Stopping microphone...' : 'Thinking...';
    const page = state.response;
    return {
      title: page ? `${status} ${state.pageIndex + 1}/${page.pages.length}` : status,
      body: page ? formatForGlasses(page.pages[state.pageIndex] ?? '') :
        formatForGlasses(state.liveTranscript || (state.screen === 'listening' ? 'Speak now' : status)),
      help: state.screen === 'listening' && state.liveTranscript
        ? normalizeForEvenDisplay(state.liveTranscript).slice(-80)
        : state.screen === 'thinking' ? THINKING_FOOTER :
          state.screen === 'listening' ? LISTENING_FOOTER : CONNECTING_FOOTER
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
    title: 'Conversation error',
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
