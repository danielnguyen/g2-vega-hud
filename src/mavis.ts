import type { AppState } from './types';

// Inline local PNGs: no fetch, canvas conversion, animation or remote dependency.
const assets = import.meta.glob<string>('./assets/mavis/*.png', {
  eager: true, query: '?inline', import: 'default'
});
export type MavisSprite = 'ready' | 'connecting' | 'listening' | 'thinking' |
  'responding' | 'done' | 'noted' | 'issue' | 'offline' | 'exiting' | 'blank';

export function mavisForState(state: AppState): MavisSprite {
  switch (state.screen) {
    case 'settings': return 'blank';
    case 'home': return 'ready';
    case 'connecting': return 'connecting';
    case 'listening': return 'listening'; // Controller sets this only after mic acknowledgement.
    case 'thinking': return 'thinking';
    case 'stopping': return 'ready';
    case 'pages':
      if (!state.response || state.response.status === 'degraded' || state.response.status === 'failed') return 'issue';
      return 'done';
    case 'error': return 'issue';
  }
  // No independent offline, streaming, noted or exiting state exists in AppState.
}

export function mavisUrl(sprite: MavisSprite): string {
  return assets[`./assets/mavis/${sprite}.png`];
}

export function mavisBytes(sprite: MavisSprite): number[] {
  return Array.from(atob(mavisUrl(sprite).split(',')[1]), character => character.charCodeAt(0));
}
