import type { AppConfig } from './config';
import type { GatewayPageResponse, Mode } from './types';

export async function sendTurn(config: AppConfig, mode: Mode, text: string): Promise<GatewayPageResponse> {
  const response = await fetch(`${config.gatewayUrl}/g2/turn`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.authValue}`
    },
    body: JSON.stringify({ mode, text })
  });

  if (!response.ok) {
    throw new Error(`Gateway returned ${response.status}`);
  }

  return (await response.json()) as GatewayPageResponse;
}
