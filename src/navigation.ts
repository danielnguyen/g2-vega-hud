export const G2_HOME_ITEMS = [
  { route: 'dashboard', label: 'Dashboard' },
  { route: 'ask-setup', label: 'Ask' }
] as const;

export type G2ChildRoute = (typeof G2_HOME_ITEMS)[number]['route'];
export type G2Route = 'home' | G2ChildRoute;

export type G2NavigationState = {
  route: G2Route;
  selectedIndex: number;
};

export type G2NavigationAction =
  | { type: 'select'; index: number }
  | { type: 'move-selection'; delta: number }
  | { type: 'open-selected' }
  | { type: 'back-or-exit' };

export type G2NavigationEffect = 'none' | 'request-host-exit';

export type G2NavigationTransition = {
  state: G2NavigationState;
  effect: G2NavigationEffect;
};

export function initialG2Navigation(): G2NavigationState {
  return { route: 'home', selectedIndex: 0 };
}

export function transitionG2Navigation(
  state: G2NavigationState,
  action: G2NavigationAction
): G2NavigationTransition {
  if (action.type === 'select') {
    if (state.route !== 'home' || !isHomeIndex(action.index)) {
      return unchanged(state);
    }

    return unchanged({ ...state, selectedIndex: action.index });
  }

  if (action.type === 'move-selection') {
    if (state.route !== 'home') {
      return unchanged(state);
    }

    return unchanged({
      ...state,
      selectedIndex: wrap(state.selectedIndex + action.delta, G2_HOME_ITEMS.length)
    });
  }

  if (action.type === 'open-selected') {
    if (state.route !== 'home') {
      return unchanged(state);
    }

    const item = G2_HOME_ITEMS[state.selectedIndex];
    return item ? unchanged({ ...state, route: item.route }) : unchanged(state);
  }

  if (state.route === 'home') {
    return { state, effect: 'request-host-exit' };
  }

  return unchanged({ route: 'home', selectedIndex: 0 });
}

function unchanged(state: G2NavigationState): G2NavigationTransition {
  return { state, effect: 'none' };
}

function isHomeIndex(index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < G2_HOME_ITEMS.length;
}

function wrap(value: number, max: number): number {
  return ((value % max) + max) % max;
}
