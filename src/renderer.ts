import type { AppState } from './types';
import { MODES } from './types';

export function render(root: HTMLElement, state: AppState): void {
  root.innerHTML = '';
  root.appendChild(renderFrame(state));
}

function renderFrame(state: AppState): HTMLElement {
  const frame = document.createElement('main');
  frame.className = 'hud-frame';

  switch (state.screen) {
    case 'home':
      frame.appendChild(renderHome(state));
      break;
    case 'loading':
      frame.appendChild(renderLoading(state));
      break;
    case 'pages':
      frame.appendChild(renderPages(state));
      break;
    case 'error':
      frame.appendChild(renderError(state));
      break;
  }

  return frame;
}

function renderHome(state: AppState): HTMLElement {
  const section = document.createElement('section');
  section.className = 'screen';
  section.appendChild(title('VEGA HUD'));

  const list = document.createElement('div');
  list.className = 'mode-list';

  MODES.forEach((item, index) => {
    const row = document.createElement('button');
    row.className = index === state.selectedModeIndex ? 'mode selected' : 'mode';
    row.textContent = `${index === state.selectedModeIndex ? '>' : ' '} ${item.label}`;
    row.type = 'button';
    row.dataset.modeIndex = String(index);
    list.appendChild(row);
  });

  section.appendChild(list);
  section.appendChild(help('Swipe: move • Tap: select'));
  return section;
}

function renderLoading(state: AppState): HTMLElement {
  const selected = MODES[state.selectedModeIndex];
  const section = document.createElement('section');
  section.className = 'screen center';
  section.appendChild(title(selected?.label ?? 'VEGA'));
  section.appendChild(text('Thinking...'));
  section.appendChild(help('Double tap: cancel'));
  return section;
}

function renderPages(state: AppState): HTMLElement {
  const section = document.createElement('section');
  section.className = 'screen';

  const response = state.response;
  if (!response) {
    section.appendChild(title('No response'));
    return section;
  }

  section.appendChild(title(`${response.title} ${state.pageIndex + 1}/${response.pages.length}`));
  section.appendChild(text(response.pages[state.pageIndex] ?? ''));
  section.appendChild(help('Swipe: page • Tap: home'));
  return section;
}

function renderError(state: AppState): HTMLElement {
  const section = document.createElement('section');
  section.className = 'screen center';
  section.appendChild(title('Gateway error'));
  section.appendChild(text(state.errorMessage ?? 'Unknown error'));
  section.appendChild(help('Tap: home'));
  return section;
}

function title(value: string): HTMLElement {
  const element = document.createElement('h1');
  element.textContent = value;
  return element;
}

function text(value: string): HTMLElement {
  const element = document.createElement('p');
  element.textContent = value;
  return element;
}

function help(value: string): HTMLElement {
  const element = document.createElement('footer');
  element.textContent = value;
  return element;
}
