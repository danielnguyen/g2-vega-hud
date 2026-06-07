# g2-vega-hud

VEGA HUD v0.3 is an Even Realities G2 heads-up client for VEGA.

This app keeps the glasses as the primary HUD surface while the phone app becomes the configuration and runtime status surface. It sends short mode-based requests to `g2-gateway`, then renders the returned `pages[]` response.

## Architecture

```text
Even G2 / Even app WebView
→ g2-vega-hud
→ g2-gateway
→ chat-orchestrator
→ LLM Memory stack
```

## Modes

```text
Brief
Ask
Recall
Status
```

Mode buttons remain available on the phone for debug and manual control, but the primary HUD remains on the glasses.

## Local setup

```bash
npm install
cp env.example .env
npm run dev
```

Set local environment values in `.env`:

```text
VITE_GATEWAY_URL=https://your-gateway-host.example
VITE_AUTH_VALUE=replace-with-narrow-gateway-token
```

Runtime precedence is:

1. Saved runtime settings from the phone app
2. `VITE_GATEWAY_URL` and `VITE_AUTH_VALUE`
3. Unconfigured state that requires phone-side setup

Do not commit `.env`.

## Browser controls for local dev

```text
ArrowUp      previous selection / previous page
ArrowDown    next selection / next page
Enter        select / home
Escape       back / home
```

## Even Hub testing

Run the Vite dev server:

```bash
npm run dev
```

Then generate a QR URL using your LAN IP:

```bash
evenhub qr --url "http://YOUR_LAN_IP:5173"
```

Scan the QR code from the Even Realities app.

## Manifest

Update `app.json` before device testing so the network whitelist matches your gateway host.

## Runtime settings for packaged installs

Packaged `.ehpk` installs should be configured from the phone UI after install. The app stores:

- `gatewayUrl`
- `authValue`

When the Even bridge is available, settings are stored in Even local storage. In normal browser development, the app falls back to `window.localStorage`.

Gateway URL format example:

```text
https://gateway.example.com
```

Use only a narrow `g2-gateway` token here. The phone app can also run a `Test Connection` health check against the configured gateway/token pair.

Do not put Cloudflare Access service tokens, backend API keys, chat-orchestrator keys, basic-memory-store keys, or other privileged secrets into the phone settings screen.

## Security

This is a client-side app. Anything placed in `VITE_*` variables is visible to the app. Do not put Cloudflare Access service tokens, Cloudflare Access service-token secrets, backend API keys, chat-orchestrator API keys, basic-memory-store keys, or other privileged secrets here.
