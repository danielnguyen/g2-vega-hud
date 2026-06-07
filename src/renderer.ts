import {
  APP_VERSION,
  ERROR_FOOTER,
  HOME_FOOTER,
  LOADING_FOOTER,
  PAGES_FOOTER
} from './constants';
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
    case 'settings':
      frame.appendChild(renderSettings(state));
      break;
  }

  return frame;
}

function renderHome(state: AppState): HTMLElement {
  const section = document.createElement('section');
  section.className = 'screen';
  section.appendChild(title(APP_VERSION));

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
  section.appendChild(renderSettingsLink());
  section.appendChild(help(HOME_FOOTER));
  return section;
}

function renderLoading(state: AppState): HTMLElement {
  const selected = MODES[state.selectedModeIndex];
  const section = document.createElement('section');
  section.className = 'screen center';
  section.appendChild(title(selected?.label ?? 'VEGA'));
  section.appendChild(text('Thinking...'));
  section.appendChild(help(LOADING_FOOTER));
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
  section.appendChild(help(PAGES_FOOTER));
  return section;
}

function renderError(state: AppState): HTMLElement {
  const section = document.createElement('section');
  section.className = 'screen center';
  section.appendChild(title('Gateway error'));
  section.appendChild(text(state.errorMessage ?? 'Unknown error'));
  section.appendChild(help(ERROR_FOOTER));
  return section;
}

function renderSettings(state: AppState): HTMLElement {
  const section = document.createElement('section');
  section.className = 'screen';
  section.appendChild(title('Settings'));

  const form = document.createElement('form');
  form.className = 'settings-form';
  form.dataset.settingsForm = 'true';

  form.appendChild(renderField('Gateway URL', 'gatewayUrl', 'https://gateway.example.com', 'url', state.settingsDraft.gatewayUrl));
  form.appendChild(renderField('Auth token', 'authValue', 'Enter narrow g2-gateway token', 'password', state.settingsDraft.authValue));

  const actions = document.createElement('div');
  actions.className = 'settings-actions';
  actions.appendChild(renderActionButton('Save', 'save'));
  actions.appendChild(renderActionButton('Clear', 'clear'));
  actions.appendChild(renderActionButton('Test connection', 'test'));
  form.appendChild(actions);

  section.appendChild(form);

  if (state.settingsStatus) {
    const status = document.createElement('p');
    status.className = 'settings-status';
    status.textContent = state.settingsStatus;
    section.appendChild(status);
  }

  if (!state.settingsRequired) {
    const backButton = document.createElement('button');
    backButton.type = 'button';
    backButton.className = 'settings-link';
    backButton.dataset.settingsAction = 'back';
    backButton.textContent = 'Back';
    section.appendChild(backButton);
  }

  section.appendChild(help(state.settingsRequired ? 'Save settings to continue.' : 'Settings are stored on device when available.'));
  return section;
}

function renderSettingsLink(): HTMLElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'settings-link';
  button.dataset.settingsAction = 'open';
  button.textContent = 'Settings';
  return button;
}

function renderField(
  labelText: string,
  inputName: string,
  placeholder: string,
  inputType: 'password' | 'url',
  value: string
): HTMLElement {
  const wrapper = document.createElement('label');
  wrapper.className = 'settings-field';

  const label = document.createElement('span');
  label.textContent = labelText;

  const input = document.createElement('input');
  input.name = inputName;
  input.type = inputType;
  input.placeholder = placeholder;
  input.value = value;
  input.setAttribute('autocomplete', inputName === 'authValue' ? 'current-password' : 'url');
  input.spellcheck = false;

  wrapper.appendChild(label);
  wrapper.appendChild(input);
  return wrapper;
}

function renderActionButton(label: string, action: 'save' | 'clear' | 'test'): HTMLElement {
  const button = document.createElement('button');
  button.type = action === 'save' ? 'submit' : 'button';
  button.className = 'action-button';
  button.dataset.settingsAction = action;
  button.textContent = label;
  return button;
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
