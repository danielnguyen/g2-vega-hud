# g2-vega-hud

VEGA HUD v0.3 is an Even Realities G2 heads-up client for CCP conversations.

This app keeps the glasses as the primary HUD surface while the phone app remains the configuration and runtime status surface. A deliberate tap starts a hands-free conversation session, Deepgram Flux transcribes the G2 microphone stream, and the final transcript is sent through `g2-gateway` to Chat Orchestrator. After a successful answer, a fresh STT session listens for the next question. Returned `conversation_id` values are reused in memory for spoken follow-ups.

The current implementation direction is summarized in [`plan/README.md`](plan/README.md).

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
Home: tap to start
Connecting / listening / thinking: double tap to stop
Answer remains visible: scroll pages while connecting or listening
Stopped / idle: tap to resume; double tap to request host exit
```

After stopping, wait for cleanup and at least 600 ms without another double-tap event before double tapping again. Duplicate bursts and taps during cleanup cannot exit or restart capture. Answers remain readable and scrollable while stopped. In a browser without the Even bridge, Escape explains that you must close the tab; it does not pretend to close the host. Unconfirmed microphone shutdown blocks this shortcut and capture; use the Even host to close the app and verify the microphone is off.

The installed WebView SDK `0.0.10` exposes `shutDownPageContainer`: mode `0` requests immediate exit, mode `1` requests native confirmation. Vega has one root container, including the answer view. The official [WebView page lifecycle](https://hub.evenrealities.com/docs/build/page-lifecycle) requires mode `1` on root pages; [submission guidance](https://hub.evenrealities.com/docs/ship/app-submission) says confirmation also closes the phone WebView. [Private testing documentation](https://hub.evenrealities.com/docs/test/private-testing) provides no root-page exception. Accordingly the shortcut calls `shutDownPageContainer(1)` directly, without a Vega menu. Native confirmation remains required; no silent-exit bypass is used. A positive bridge reply means the request was accepted, not that the app has closed. A false, rejected, missing or timed-out API reports failure/unavailability. Cancel the system dialog to remain in Vega and tap to resume.

The microphone starts only after the glasses startup page and a fresh STT WebSocket are ready, and `Listening...` appears only after microphone enable is acknowledged. Each utterance stops capture and confirms microphone shutdown before sending to CCP. The previous answer and page position remain visible during rearm; live transcript text appears in the glasses footer when an answer is displayed. A new answer starts at page one.

Initial silence stops the session after 30 seconds; capture has a 60-second absolute limit even while speaking. Empty speech, errors, double tap, surface exit, network loss or a device disconnect also stop it. Use the phone Stop button or double tap on glasses, including while waiting for CCP. Stopping a request or deferred polling only cancels local waiting; it does not cancel server work or resubmit it. Valid deferred work has no overall polling deadline.

If microphone shutdown cannot be confirmed, the app makes one bounded cleanup retry and blocks further capture for that app instance. Exit and reopen before trying again; verify the mic is off on the device. Exit/disconnect also requires reopening the app. There is no ambient listening, wake word or voice output. Conversation identity remains server-owned; the app keeps only the current returned ID in memory for its process lifetime.

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

Packaged builds disable the env fallback with `VITE_DISABLE_ENV_CONFIG=1`.

Do not commit `.env`.

## Browser controls for local dev

```text
ArrowUp      previous response page
ArrowDown    next response page
Enter        talk / follow-up
Escape       stop / request host exit (ignore held-key repeats)
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

`package.json` is the checked-in development/local version source of truth. `app.json.example` is a version-neutral template and intentionally uses `0.0.0`; neither local nor CI packaging treats that template version as authoritative.

`app.json` is intentionally local and untracked. Before local packaging:

```bash
cp app.json.example app.json
```

Edit the local `app.json` values before packing, especially the network whitelist for your gateway host. Keep the checked-in Deepgram WebSocket host and `g2-microphone` permission.

Use `npm run pack` for local/manual Even Hub uploads. It automatically:

1. Fails fast if `app.json` is missing and tells you to copy `app.json.example`.
2. Copies the current `package.json` version into the local `app.json`.
3. Builds with packaged env isolation.
4. Creates `vega-hud.ehpk`.

It does **not** bump or rewrite tracked version files. If you intentionally need a new local development version, update the package version first, for example:

```bash
npm version patch --no-git-tag-version
```

or:

```bash
npm version 0.3.3 --no-git-tag-version
```

`npm version` updates both `package.json` and `package-lock.json`; the subsequent `npm run pack` syncs that version into the untracked `app.json`.

If `app.json` is missing, packaging stops with:

```text
app.json is missing. Copy app.json.example to app.json and edit local values before packing.
```

### Version source of truth

There are two simple flows:

- **Tagged CI release:** the Git tag is the release-version source of truth. A tag such as `v0.3.3` causes CI to generate package/lock/manifest metadata at `0.3.3` inside the runner. You do **not** need to manually edit `package.json`, `package-lock.json`, or `app.json.example` before creating the tag.
- **Local/manual pack:** `package.json` is the version source of truth. `npm run pack` copies that version into the untracked `app.json` without modifying tracked files.

The tagged workflow does not commit its generated version changes back to `main`, so the checked-in development version may lag the newest release tag. That is expected; release tags remain the authority for released versions.

## Automated packaged releases

`.github/workflows/package-release.yml` builds a deployable `.ehpk` without embedding the runtime gateway bearer token or a permanent Deepgram key.

Configure one repository Actions variable before using it:

```text
VEGA_GATEWAY_URL=https://your-gateway-host.example
```

Set it under **Settings → Secrets and variables → Actions → Variables**. It is kept out of the checked-in manifest template, but it is not a credential: the final `.ehpk` must contain the gateway host in its Even Hub network whitelist, so anyone able to inspect the released package can discover that endpoint.

The workflow runs in two modes:

- **Run workflow** from the Actions tab: packages the current `package.json` version and uploads the `.ehpk` as a 30-day workflow artifact.
- Push a version tag such as `v0.3.3`: uses the tag version in generated package/lock/manifest metadata, uploads the workflow artifact, and creates or updates the matching GitHub Release with `vega-hud-0.3.3.ehpk` attached.

The CI build intentionally injects fake `VITE_GATEWAY_URL` and `VITE_AUTH_VALUE` canaries while using `build:packaged`. Before publishing, it scans the built bundle and generated manifest, then scans the finished `.ehpk` bytes for plaintext canaries and high-signal secret material. Publishing fails closed if those checks find forbidden values. The workflow itself is not given the real G2 gateway bearer token or permanent Deepgram API key.

## Manifest

The checked-in template is `app.json.example`. Its `version` is deliberately a non-authoritative placeholder. Local packaging syncs the version from `package.json`; tagged CI packaging uses the tag version. Update the local `app.json` copy before device testing so the network whitelist matches your gateway host and any other machine-specific values are correct.

## Device validation checklist

Use the existing debug panel during device testing to record the actual Even SDK event summaries you observe. A live Deepgram key must be configured only on `g2-gateway`; the client receives a short-lived token from `/g2/stt/session`.

1. Confirm the packaged app shows the synced version on phone and glasses surfaces.
2. Tap to talk and confirm `Listening...` appears only after STT connects.
3. Speak a question and confirm the live transcript is recognizable.
4. Confirm Flux EndOfTurn stops the microphone and sends exactly one CCP turn.
5. Confirm the CCP answer renders and response-page scroll works.
6. Without tapping, ask at least three sequential follow-ups and verify continuity, fresh listening status, and repeated microphone on/off transitions. Scroll a multi-page answer during rearm and listening; verify its page position remains stable until the next answer.
7. Double tap during listening and confirm cancellation sends nothing to CCP.
8. Exercise STT and gateway failures and confirm the microphone is off afterward.
9. Confirm exit/lifecycle events stop microphone capture.
10. Wait silently for 30 seconds, then resume by tapping. Speak beyond 60 seconds to verify the absolute limit stops capture without submitting a partial turn.
11. Disconnect glasses and network during capture and during a deferred answer; confirm no automatic restart or late answer. Reopen deliberately to resume.
12. Test phone lock/pocket behavior where supported, sustained sequential turns and practical battery use; record phone/app/firmware versions and actual observations.
13. Confirm phone settings, connection testing, saved settings, and packaged-device behavior still work.

All new hands-free physical checks are **pending owner evidence**. Unit tests and a successful package build are not proof of hardware behavior. Record the reviewed commit and results in Issue #21; do not close physical acceptance based on automated tests.

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

This is a client-side app. Anything placed in `VITE_*` variables is potentially client-visible during ordinary development builds. Do not put a permanent Deepgram API key, Cloudflare Access service tokens, Cloudflare Access service-token secrets, backend API keys, chat-orchestrator API keys, basic-memory-store keys, or other privileged secrets here. The only Deepgram credential used by this app is the short-lived access token returned by `g2-gateway`.

## Testing a reviewed candidate (no release required)

After independent native review of the exact PR head, use a separate local checkout of that reviewed commit. Run `npm ci`, `npm test`, `npm run build`, and `npm run build:packaged`. For a QR test, use the existing `npm run dev` and `npm run qr` flow above. For packaged testing, copy `app.json.example` to the ignored `app.json`, set the actual gateway whitelist, and run `npm run pack`. Configure the narrow runtime token only through phone settings. The placeholder gateway is sufficient for a build check, not a functional device test.

Follow the existing local version/cache guidance if Even Hub caches an earlier upload; keep candidate-only version changes out of the PR. Record the reviewed source SHA and local test-package version together. These instructions do not require tags, a merge, CI dispatch, or production deployment. The owner controls installing the reviewed test candidate and recording real G2 acceptance.

## Issue #24 candidate acceptance

Automated regressions cover first-tap stop, duplicate event bursts, delayed microphone cleanup, stale work, idle exit requests, root mode `1`, shutdown failures/timeouts, keyboard fallback and resume. After independent review of the exact head, the owner should check the second distinct double tap during ordinary G2 use: native confirmation appears without opening the Vega menu, confirming closes the glasses page and phone WebView, cancelling preserves the answer and permits resume, and the microphone remains off. Check the supported private packaged build as well as any QR prototype. These physical observations remain pending; no new timed soak or release is required. Paging issue #23 remains separate.
