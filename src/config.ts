import { loadSettings, type RuntimeSettings } from './settings';

export type AppConfig = {
  gatewayUrl: string;
  authValue: string;
};

export async function loadConfig(): Promise<AppConfig | null> {
  const runtimeSettings = await loadSettings();
  if (runtimeSettings) {
    const runtimeConfig = configFromSettings(runtimeSettings);
    if (runtimeConfig) {
      return runtimeConfig;
    }
  }

  return loadEnvConfig();
}

export function loadEnvConfig(): AppConfig | null {
  const disableEnvConfig = (import.meta.env.VITE_DISABLE_ENV_CONFIG as string | undefined)?.toLowerCase();

  if (disableEnvConfig === '1' || disableEnvConfig === 'true') {
    return null;
  }

  const gatewayUrl = import.meta.env.VITE_GATEWAY_URL as string | undefined;
  const authValue = import.meta.env.VITE_AUTH_VALUE as string | undefined;

  if (!gatewayUrl || !authValue) {
    return null;
  }

  return configFromSettings({ gatewayUrl, authValue });
}

export function configFromSettings(settings: RuntimeSettings): AppConfig | null {
  const gatewayUrl = settings.gatewayUrl.trim().replace(/\/$/, '');
  const authValue = settings.authValue.trim();

  if (!gatewayUrl || !authValue) {
    return null;
  }

  return { gatewayUrl, authValue };
}
