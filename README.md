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

Packaged builds can disable the env fallback by setting `VITE_DISABLE_ENV_CONFIG=1` at build time.

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
npm run qr
```

Scan the QR code from the Even Realities app. Prototype and QR-driven development do not require a manifest version bump.

## Packaging and versioning

Even Hub can cache uploaded packages by the `app.json` version. Uploading a new `.ehpk` with the same manifest version can cause Even Hub to serve an older bundle.

`app.json` is intentionally local and untracked. Before packaging:

```bash
cp app.json.example app.json
```

Edit the local `app.json` values before packing, especially the network whitelist for your gateway host.

Use `npm run pack` for Even Hub uploads. It automatically:

1. Fails fast if `app.json` is missing and tells you to copy `app.json.example`.
2. Increments the patch version in your local `app.json` and the other app manifest variants.
3. Keeps `src/constants.ts` aligned by displaying only the manifest major/minor as `VEGA HUD vX.Y` for stale-bundle detection.
4. Builds with `VITE_DISABLE_ENV_CONFIG=1` and creates `vega-hud.ehpk`.

Example: `0.3.0` becomes `0.3.1`, while `APP_VERSION` remains `VEGA HUD v0.3`.

If `app.json` is missing, packaging stops with:

```text
app.json is missing. Copy app.json.example to app.json and edit local values before packing.
```

## Manifest

The checked-in template is `app.json.example`. Update the local `app.json` copy before device testing so the network whitelist matches your gateway host and any other machine-specific values are correct.

## Device validation checklist

Use the existing debug panel during device testing to record the actual Even SDK event summaries you observe.

1. Confirm the packaged app shows the synced version on phone and glasses surfaces.
2. Confirm home-screen scroll up/down changes the selected mode on the glasses.
3. Confirm a single press on the glasses runs the selected mode through the gateway.
4. Confirm the gateway response renders on the glasses.
5. Confirm response-page scroll up/down moves between pages.
6. Confirm `press` and `doublePress` return home from response pages.
7. Confirm `doublePress` returns home from the loading screen.
8. Confirm `press` and `doublePress` return home from the error screen.
9. Confirm repeated or noisy input does not create duplicate gateway requests.
10. Confirm the home-screen diagnostic `doublePress` hello action works cleanly, or document and disable it only if device validation shows interference.
11. Record the actual emitted lifecycle events shown in the debug panel during app foreground and exit transitions.
12. Confirm phone manual controls and the settings screen still work, including preserving unsaved edits during passive Even input updates.

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
