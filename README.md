# g2-vega-hud

VEGA HUD v0.3 is an Even Realities G2 heads-up client for CCP conversations.

This app keeps the glasses as the primary HUD surface while the phone app remains the configuration and runtime status surface. A tap starts a spoken turn, Deepgram Flux transcribes the G2 microphone stream, and the final transcript is sent through `g2-gateway` to Chat Orchestrator. Returned `conversation_id` values are reused in memory for spoken follow-ups.

## Architecture

```text
Even G2 / Even app WebView
→ g2-vega-hud
  ├→ g2-gateway /g2/stt/session → short-lived token
  ├→ Deepgram Flux → final transcript
  └→ g2-gateway /g2/turn → chat-orchestrator → LLM Memory stack
```

## Conversation controls

```text
Home: tap to talk
Listening: double tap to cancel
Response: scroll pages, tap for a follow-up, double tap for home
```

The microphone starts only after the STT WebSocket is ready and stops on completion, cancellation, provider failure, or surface exit. Conversation identity remains server-owned; the app keeps only the current returned ID in memory for its process lifetime.

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
ArrowUp      previous response page
ArrowDown    next response page
Enter        talk / follow-up
Escape       cancel / home
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

Edit the local `app.json` values before packing, especially the network whitelist for your gateway host. Keep the checked-in Deepgram WebSocket host and `g2-microphone` permission.

Use `npm run pack` for Even Hub uploads. It automatically:

1. Fails fast if `app.json` is missing and tells you to copy `app.json.example`.
2. Increments the patch version in your local `app.json` and the other app manifest variants.
3. Keeps the visible app version generated from the synced package and manifest version.
4. Builds with `VITE_DISABLE_ENV_CONFIG=1` and creates `vega-hud.ehpk`.

Example: `0.3.0` becomes `0.3.1`, and the visible app version displays `VEGA HUD v0.3.1`.

If `app.json` is missing, packaging stops with:

```text
app.json is missing. Copy app.json.example to app.json and edit local values before packing.
```

## Automated packaged releases

`.github/workflows/package-release.yml` builds a deployable `.ehpk` without embedding the runtime gateway bearer token or a permanent Deepgram key.

Configure one repository Actions variable before using it:

```text
VEGA_GATEWAY_URL=https://your-gateway-host.example
```

Set it under **Settings → Secrets and variables → Actions → Variables**. It is kept out of the checked-in manifest template, but it is not a credential: the final `.ehpk` must contain the gateway host in its Even Hub network whitelist, so anyone able to inspect the released package can discover that endpoint.

The workflow runs in two modes:

- **Run workflow** from the Actions tab: packages the current `package.json` version and uploads the `.ehpk` as a 30-day workflow artifact.
- Push a version tag such as `v0.3.2`: uses the tag version in the generated manifest, uploads the workflow artifact, and creates or updates the matching GitHub Release with `vega-hud-0.3.2.ehpk` attached.

The CI build intentionally injects fake `VITE_GATEWAY_URL` and `VITE_AUTH_VALUE` canaries while using `build:packaged`. Before publishing, it scans the built bundle and the unpacked `.ehpk`; publishing fails closed if those canaries, configured backend secrets, sensitive files, private-key material, or other high-signal secret patterns are found. The workflow itself is not given the real G2 gateway bearer token or permanent Deepgram API key.

## Manifest

The checked-in template is `app.json.example`. Update the local `app.json` copy before device testing so the network whitelist matches your gateway host and any other machine-specific values are correct.

## Device validation checklist

Use the existing debug panel during device testing to record the actual Even SDK event summaries you observe. A live Deepgram key must be configured only on `g2-gateway`; the client receives a short-lived token from `/g2/stt/session`.

1. Confirm the packaged app shows the synced version on phone and glasses surfaces.
2. Tap to talk and confirm `Listening...` appears only after STT connects.
3. Speak a question and confirm the live transcript is recognizable.
4. Confirm Flux EndOfTurn stops the microphone and sends exactly one CCP turn.
5. Confirm the CCP answer renders and response-page scroll works.
6. Tap from the response and ask a follow-up that reuses the current conversation.
7. Double tap during listening and confirm cancellation sends nothing to CCP.
8. Exercise STT and gateway failures and confirm the microphone is off afterward.
9. Confirm exit/lifecycle events stop microphone capture.
10. Confirm phone settings and connection testing still work.

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

This is a client-side app. Anything placed in `VITE_*` variables is visible to the app. Do not put a permanent Deepgram API key, Cloudflare Access service tokens, Cloudflare Access service-token secrets, backend API keys, chat-orchestrator API keys, basic-memory-store keys, or other privileged secrets here. The only Deepgram credential used by this app is the short-lived access token returned by `g2-gateway`.
