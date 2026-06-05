# g2-vega-hud

VEGA HUD v0.2 is an Even Realities G2 heads-up client for VEGA.

This app is a thin wearable surface. It sends short mode-based requests to `g2-gateway`, then renders the returned `pages[]` response.

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

## Security

This is a client-side app. Anything placed in `VITE_*` variables is visible to the app. Do not put Cloudflare Access service-token secrets, chat-orchestrator API keys, basic-memory-store keys, or other privileged secrets here.
