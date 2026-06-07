import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';

export type RuntimeSettings = {
  gatewayUrl: string;
  authValue: string;
};

const SETTINGS_KEY = 'vega_hud_settings_v1';
const BRIDGE_TIMEOUT_MS = 1500;

type SettingsBridgeLike = {
  getLocalStorage(key: string): Promise<string>;
  setLocalStorage(key: string, value: string): Promise<boolean>;
};

type SettingsStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export async function loadSettings(): Promise<RuntimeSettings | null> {
  const storage = await resolveStorage();
  const raw = await storage.getItem(SETTINGS_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<RuntimeSettings>;
    const gatewayUrl = typeof parsed.gatewayUrl === 'string' ? parsed.gatewayUrl : '';
    const authValue = typeof parsed.authValue === 'string' ? parsed.authValue : '';

    if (!gatewayUrl || !authValue) {
      return null;
    }

    return { gatewayUrl, authValue };
  } catch {
    return null;
  }
}

export async function saveSettings(settings: RuntimeSettings): Promise<void> {
  const storage = await resolveStorage();
  await storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export async function clearSettings(): Promise<void> {
  const storage = await resolveStorage();
  await storage.removeItem(SETTINGS_KEY);
}

async function resolveStorage(): Promise<SettingsStorage> {
  try {
    const bridge = await withTimeout(waitForEvenAppBridge(), BRIDGE_TIMEOUT_MS);
    return createBridgeStorage(bridge as SettingsBridgeLike);
  } catch {
    return createWindowStorage();
  }
}

function createBridgeStorage(bridge: SettingsBridgeLike): SettingsStorage {
  return {
    async getItem(key: string): Promise<string | null> {
      const value = await bridge.getLocalStorage(key);
      return value || null;
    },
    async setItem(key: string, value: string): Promise<void> {
      await bridge.setLocalStorage(key, value);
    },
    async removeItem(key: string): Promise<void> {
      await bridge.setLocalStorage(key, '');
    }
  };
}

function createWindowStorage(): SettingsStorage {
  return {
    async getItem(key: string): Promise<string | null> {
      return window.localStorage.getItem(key);
    },
    async setItem(key: string, value: string): Promise<void> {
      window.localStorage.setItem(key, value);
    },
    async removeItem(key: string): Promise<void> {
      window.localStorage.removeItem(key);
    }
  };
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
