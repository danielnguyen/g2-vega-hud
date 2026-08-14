import {
  CONNECTING_FOOTER,
  ERROR_FOOTER,
  HOME_FOOTER,
  LISTENING_FOOTER,
  PAGES_FOOTER
} from './constants';
import type { RuntimeStatus } from './runtimeStatus';
import type { AppState, GatewayRequestDebug, GlassesInputDebugEvent } from './types';

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
    case 'connecting':
      frame.appendChild(renderConnecting());
      break;
    case 'listening':
      frame.appendChild(renderListening(state));
      break;
    case 'thinking':
      frame.appendChild(renderThinking());
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
  section.appendChild(title('CCP Conversation'));
  section.appendChild(text(state.homeMessage ?? 'Tap to talk'));
  section.appendChild(renderConversationButton('Start talking', 'start'));
  section.appendChild(renderRuntimeStatus(state.runtimeStatus, false));
  section.appendChild(renderDebugPanel(state));
  section.appendChild(renderSettingsLink('Open Settings'));
  section.appendChild(help(HOME_FOOTER));
  return section;
}

function renderConnecting(): HTMLElement {
  const section = document.createElement('section');
  section.className = 'screen center';
  section.appendChild(title('CCP Conversation'));
  section.appendChild(text('Connecting...'));
  section.appendChild(help(CONNECTING_FOOTER));
  return section;
}

function renderListening(state: AppState): HTMLElement {
  const section = document.createElement('section');
  section.className = 'screen center';
  section.appendChild(title('Listening...'));
  section.appendChild(text(state.liveTranscript || 'Speak now'));
  section.appendChild(help(LISTENING_FOOTER));
  return section;
}

function renderThinking(): HTMLElement {
  const section = document.createElement('section');
  section.className = 'screen center';
  section.appendChild(title('CCP Conversation'));
  section.appendChild(text('Thinking...'));
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
  section.appendChild(renderConversationButton('Ask a follow-up', 'start'));
  section.appendChild(renderConversationButton('Back home', 'home'));
  section.appendChild(help(PAGES_FOOTER));
  return section;
}

function renderError(state: AppState): HTMLElement {
  const section = document.createElement('section');
  section.className = 'screen center';
  section.appendChild(title('Conversation error'));
  section.appendChild(text(state.errorMessage ?? 'Unknown error'));
  section.appendChild(help(ERROR_FOOTER));
  return section;
}

function renderSettings(state: AppState): HTMLElement {
  const section = document.createElement('section');
  section.className = 'screen';
  section.appendChild(title('Settings'));
  section.appendChild(renderRuntimeStatus(state.runtimeStatus, true));
  section.appendChild(renderDebugPanel(state));

  const form = document.createElement('form');
  form.className = 'settings-form';
  form.dataset.settingsForm = 'true';

  form.appendChild(renderField('Gateway URL', 'gatewayUrl', 'https://gateway.example.com', 'url', state.settingsDraft.gatewayUrl));
  form.appendChild(renderField('Auth token', 'authValue', 'Enter narrow g2-gateway token', 'password', state.settingsDraft.authValue));

  const actions = document.createElement('div');
  actions.className = 'settings-actions';
  actions.appendChild(renderActionButton('Save', 'save'));
  actions.appendChild(renderActionButton('Clear', 'clear'));
  actions.appendChild(renderActionButton('Test Connection', 'test'));
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

function renderDebugPanel(state: AppState): HTMLElement {
  const section = document.createElement('section');
  section.className = 'debug-panel';
  section.appendChild(subtitle('Debug'));
  section.appendChild(renderStatusRow('App version', state.debug.appVersion));
  section.appendChild(renderStatusRow('Gateway URL', state.debug.currentSettings.gatewayUrl || 'Not configured'));
  section.appendChild(renderStatusRow('Auth token', redactAuthValue(state.debug.currentSettings.authValue)));
  section.appendChild(renderStatusRow('Last input', formatGlassesInput(state.debug.lastGlassesInputEvent)));
  section.appendChild(renderStatusRow('Last request', formatGatewayRequest(state.debug.lastGatewayRequest)));
  section.appendChild(renderStatusRow('Last error', state.debug.lastError ?? 'None', state.debug.lastError ? 'warning' : 'default'));
  return section;
}

function renderRuntimeStatus(status: RuntimeStatus, detailed: boolean): HTMLElement {
  const section = document.createElement('section');
  section.className = detailed ? 'status-panel status-panel-detailed' : 'status-panel';

  const heading = subtitle(detailed ? 'Gateway Status' : 'Status');
  section.appendChild(heading);
  section.appendChild(renderStatusRow('Configuration', status.configured ? 'Configured' : 'Settings required'));
  section.appendChild(renderStatusRow('Gateway', connectionLabel(status.connected)));

  if (status.lastCheckedAt) {
    section.appendChild(renderStatusRow('Last checked', formatTimestamp(status.lastCheckedAt)));
  }

  if (status.lastRequestAt) {
    section.appendChild(renderStatusRow('Last request', formatTimestamp(status.lastRequestAt)));
  }

  if (status.lastOperation) {
    section.appendChild(renderStatusRow('Last operation', status.lastOperation));
  }

  if (detailed && status.lastStatus) {
    section.appendChild(renderStatusRow('Last status', status.lastStatus));
  }

  if (status.lastError) {
    section.appendChild(renderStatusRow('Last error', status.lastError, 'warning'));
  }

  return section;
}

function renderStatusRow(labelText: string, valueText: string, tone: 'default' | 'warning' = 'default'): HTMLElement {
  const row = document.createElement('p');
  row.className = tone === 'warning' ? 'status-row status-row-warning' : 'status-row';

  const label = document.createElement('strong');
  label.textContent = `${labelText}: `;
  row.appendChild(label);
  row.appendChild(document.createTextNode(valueText));

  return row;
}

function connectionLabel(connected: boolean | null): string {
  if (connected === true) {
    return 'Connected';
  }

  if (connected === false) {
    return 'Not connected';
  }

  return 'Unknown';
}

function formatGlassesInput(event: GlassesInputDebugEvent | null): string {
  if (!event) {
    return 'None';
  }

  return `${event.summary} • ${formatTimestamp(event.timestamp)}`;
}

function formatGatewayRequest(request: GatewayRequestDebug | null): string {
  if (!request) {
    return 'None';
  }

  return `${request.label} / ${request.operation} / ${request.status} / ${formatTimestamp(request.updatedAt)}`;
}

function redactAuthValue(value: string): string {
  if (!value) {
    return 'Not configured';
  }

  if (value.length <= 6) {
    return '***';
  }

  return `${value.slice(0, 3)}...${value.slice(-2)}`;
}

function formatTimestamp(value: string): string {
  const timestamp = new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    return value;
  }

  return timestamp.toLocaleString();
}

function renderSettingsLink(labelText = 'Settings'): HTMLElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'settings-link';
  button.dataset.settingsAction = 'open';
  button.textContent = labelText;
  return button;
}

function renderConversationButton(
  labelText: string,
  action: 'start' | 'home'
): HTMLElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'action-button conversation-action';
  button.dataset.conversationAction = action;
  button.textContent = labelText;
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

function subtitle(value: string): HTMLElement {
  const element = document.createElement('h2');
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
