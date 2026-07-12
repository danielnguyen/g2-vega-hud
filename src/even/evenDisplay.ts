import {
  CreateStartUpPageContainer,
  ListContainerProperty,
  ListItemContainerProperty,
  RebuildPageContainer,
  TextContainerProperty,
  TextContainerUpgrade
} from '@evenrealities/even_hub_sdk';
import { G2_HOME_ITEMS, type G2NavigationState, type G2Route } from '../navigation';
import { RecoverableSerialQueue } from '../serialQueue';
import type { EvenBridge } from './evenBridge';

const HOME_LIST_ID = 1;
const HOME_LIST_NAME = 'g2-home';
const CHILD_TEXT_ID = 2;
const CHILD_TEXT_NAME = 'g2-child';

type ContainerKind = 'list' | 'text';

export type EvenDisplay = {
  render(navigation: G2NavigationState): Promise<void>;
  requestHostExit(): Promise<boolean>;
};

export async function createEvenDisplay(bridge: EvenBridge): Promise<EvenDisplay> {
  const display = new EvenGlassesDisplay(bridge);
  await display.initialize();
  return display;
}

class EvenGlassesDisplay implements EvenDisplay {
  private containerKind: ContainerKind | null = null;
  private renderedRoute: G2Route | null = null;
  private readonly renderQueue = new RecoverableSerialQueue();

  constructor(private readonly bridge: EvenBridge) {}

  async initialize(): Promise<void> {
    const result = await this.bridge.createStartUpPageContainer(startupHomePage());
    if (result !== 0) {
      throw new Error('Even display initialization failed.');
    }

    this.containerKind = 'list';
    this.renderedRoute = 'home';
  }

  render(navigation: G2NavigationState): Promise<void> {
    return this.renderQueue.run(() => this.performRender(navigation));
  }

  requestHostExit(): Promise<boolean> {
    return this.bridge.shutDownPageContainer(1);
  }

  private async performRender(navigation: G2NavigationState): Promise<void> {
    const nextKind: ContainerKind = navigation.route === 'home' ? 'list' : 'text';

    if (this.containerKind !== nextKind) {
      const page = navigation.route === 'home' ? rebuildHomePage() : childPage(navigation.route);
      const rebuilt = await this.bridge.rebuildPageContainer(page);

      if (!rebuilt) throw new Error('Even display transition failed.');
      this.containerKind = nextKind;
      this.renderedRoute = navigation.route;
      return;
    }

    if (navigation.route !== 'home' && this.renderedRoute !== navigation.route) {
      const upgraded = await this.bridge.textContainerUpgrade(childTextUpgrade(navigation.route));
      if (!upgraded) throw new Error('Even text update failed.');
      this.renderedRoute = navigation.route;
    }
  }
}

function homeList(): ListContainerProperty {
  return new ListContainerProperty({
    containerID: HOME_LIST_ID,
    containerName: HOME_LIST_NAME,
    xPosition: 24,
    yPosition: 20,
    width: 528,
    height: 248,
    paddingLength: 8,
    itemContainer: new ListItemContainerProperty({
      itemCount: G2_HOME_ITEMS.length,
      itemWidth: 0,
      isItemSelectBorderEn: 1,
      itemName: G2_HOME_ITEMS.map((item) => item.label)
    }),
    isEventCapture: 1
  });
}

function startupHomePage(): CreateStartUpPageContainer {
  return new CreateStartUpPageContainer({ containerTotalNum: 1, listObject: [homeList()] });
}

function rebuildHomePage(): RebuildPageContainer {
  return new RebuildPageContainer({ containerTotalNum: 1, listObject: [homeList()] });
}

function childPage(route: Exclude<G2Route, 'home'>): RebuildPageContainer {
  const text = new TextContainerProperty({
    containerID: CHILD_TEXT_ID,
    containerName: CHILD_TEXT_NAME,
    xPosition: 24,
    yPosition: 24,
    width: 528,
    height: 240,
    paddingLength: 8,
    content: childContent(route),
    isEventCapture: 1
  });

  return new RebuildPageContainer({ containerTotalNum: 1, textObject: [text] });
}

function childTextUpgrade(route: Exclude<G2Route, 'home'>): TextContainerUpgrade {
  return new TextContainerUpgrade({
    containerID: CHILD_TEXT_ID,
    containerName: CHILD_TEXT_NAME,
    content: childContent(route)
  });
}

function childContent(route: Exclude<G2Route, 'home'>): string {
  if (route === 'dashboard') return 'DASHBOARD\n\nComing later';
  return 'ASK\n\nConfigure bots from the phone application.';
}
