export type AppConfig = {
  gatewayUrl: string;
  authValue: string;
};

export function loadConfig(): AppConfig {
  const gatewayUrl = import.meta.env.VITE_GATEWAY_URL as string | undefined;
  const authValue = import.meta.env.VITE_AUTH_VALUE as string | undefined;

  if (!gatewayUrl) {
    throw new Error('Missing VITE_GATEWAY_URL');
  }

  if (!authValue) {
    throw new Error('Missing VITE_AUTH_VALUE');
  }

  return {
    gatewayUrl: gatewayUrl.replace(/\/$/, ''),
    authValue
  };
}
