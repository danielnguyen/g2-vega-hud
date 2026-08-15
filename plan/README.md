# G2 CCP Conversation Mode Plan

## Current objective

VEGA HUD is a deliberately small voice client for CCP on Even Realities G2:

```text
tap
→ speak
→ Deepgram transcription
→ g2-gateway
→ Chat Orchestrator / CCP
→ answer on glasses
→ tap for follow-up
```

The glasses are a lightweight interaction surface. Durable conversation ownership, history, retrieval, and reasoning remain server-side in CCP.

## Current architecture

```text
Even G2 / Even app WebView
→ g2-vega-hud
  ├→ POST g2-gateway /g2/stt/session
  │    → short-lived Deepgram token
  ├→ Deepgram Flux WebSocket
  │    → transcript / EndOfTurn
  └→ POST g2-gateway /g2/turn
       → Chat Orchestrator / CCP
       → answer pages
```

The client retains only the current server-returned `conversation_id` in process memory for intentional follow-ups. Generic failures do not clear it. An explicit `conversation_disposition: "non_current"` does.

## Implemented baseline

The current baseline includes:

- tap-to-talk CCP Conversation Mode;
- G2 microphone capture using the Even bridge;
- raw PCM signed 16-bit little-endian, 16 kHz, mono routing;
- an application-owned speech-to-text provider boundary;
- Deepgram Flux as the first provider;
- short-lived Deepgram credentials minted by `g2-gateway`;
- live transcript display and automatic Flux `EndOfTurn` completion;
- one CCP turn per completed utterance;
- response pagination on the glasses;
- tap-to-follow-up with server-owned conversation continuity;
- cancellation and microphone cleanup paths;
- phone-side runtime settings, connection testing, and bounded diagnostics;
- packaged builds that disable runtime `.env` fallback;
- GitHub Actions `.ehpk` packaging with secret canaries and release assets.

Physical-device testing has confirmed the basic voice → transcription → CCP → rendered-answer loop on G2.

## Remaining work in this repository

Keep further work small and evidence-driven:

1. Finish packaged-release smoke validation on the real G2.
2. Re-run the core physical regression checklist after material Even SDK, Deepgram SDK, or input/lifecycle changes.
3. Keep speech-to-text provider-specific behavior isolated behind the existing provider interface so a future replacement does not require Conversation Mode redesign.
4. Retain safe diagnostics while the integration is young; simplify them later only after the runtime path is boringly stable.
5. Treat answer quality, evidence acquisition, retrieval policy, and reasoning behavior as CCP concerns unless a defect is proven to originate in this client.

## Explicitly retired directions

The repository no longer plans or tracks the older mode-oriented or direct-Telegram design. The following are not part of the current G2 client plan:

- Brief / Recall / Status glasses modes;
- Dashboard / Ask top-level mode menus;
- fixed prompt modes;
- direct Telegram or MTProto login from the Even WebView;
- Telegram API ID/hash or user-session storage in VEGA HUD;
- Telegram bot discovery, selection, or reply correlation in the client;
- BotFather tokens;
- Node-RED as the synchronous G2 request path;
- rendering Telegram history on the glasses;
- multiple personas or bot pickers in the HUD.

Telegram may still be used elsewhere as a server-side human-readable archive or interaction surface, but it is not part of the synchronous G2 Conversation Mode transport.

## Non-goals for the current client

Unless explicitly reintroduced by a new product decision:

- ambient or continuous listening;
- wake words;
- camera/context sensing;
- autonomous interventions;
- multiple simultaneous conversations;
- text-to-speech or speaker output;
- persistent local conversation history;
- a generalized STT plugin framework;
- speculative/eager CCP calls before the utterance is complete.

## Working rule

When a physical test fails, instrument the boundary and identify the first failing hop before changing architecture or configuration. Do not infer provider, gateway, microphone, or host behavior from a single generic user-facing error.

The concise current acceptance record is [`01_Requirement_Checklist.md`](01_Requirement_Checklist.md).
