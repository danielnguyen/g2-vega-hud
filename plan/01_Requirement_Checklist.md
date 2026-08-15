# G2 CCP Conversation Mode — Acceptance Record

This file is the concise implementation-status record for the current VEGA HUD direction. It intentionally replaces the retired mode-oriented and direct-Telegram requirement matrix.

Status values:

- `PASS` — implemented and supported by current code/runtime evidence.
- `VERIFY` — implemented but worth rechecking in packaged or physical-device validation.
- `OUT OF SCOPE` — owned outside this repository.

| ID | Requirement | Status | Evidence / note |
|---|---|---|---|
| G2C-01 | Home presents one simple CCP Conversation entry point: tap to talk. | `PASS` | Current Conversation Mode implementation and physical G2 run. |
| G2C-02 | The client obtains STT bootstrap credentials from authenticated `g2-gateway`; no permanent Deepgram key is embedded in the client. | `PASS` | `/g2/stt/session`, short-lived token flow, package secret-canary checks. |
| G2C-03 | The G2 microphone is enabled only after the STT connection is ready and is disabled on completion/cancel/failure/exit. | `PASS` | Even bridge + STT startup ordering; physical voice test completed. |
| G2C-04 | G2 PCM is routed as signed 16-bit little-endian, 16 kHz, mono audio to the active STT session. | `PASS` | Even audio event routing and Deepgram adapter. |
| G2C-05 | Provider-specific STT behavior is isolated behind the application-owned speech-to-text interface. | `PASS` | `src/speechToText.ts` + `src/stt/deepgram.ts`. |
| G2C-06 | Live transcript updates render while listening; Flux `EndOfTurn` completes the utterance. | `PASS` | Current Deepgram Flux path and physical G2 run. |
| G2C-07 | One completed utterance produces at most one CCP turn with `input_mode: voice_transcribed`. | `PASS` | Capture-settled and pending-turn guards in Conversation Mode. |
| G2C-08 | CCP answers render as bounded pages and can be scrolled on the glasses. | `PASS` | Current response renderer and physical G2 run. |
| G2C-09 | A tap from a response starts an intentional follow-up and reuses the current server-returned `conversation_id` when available. | `VERIFY` | Implemented; retain in packaged-device regression checklist. |
| G2C-10 | Generic gateway/STT failures do not retire the current CCP conversation reference; only explicit `conversation_disposition: non_current` clears it. | `PASS` | Current gateway response handling. |
| G2C-11 | Double tap during active listening cancels without sending a CCP turn. | `VERIFY` | Implemented; retain in packaged-device regression checklist. |
| G2C-12 | Phone-side settings remain the runtime configuration surface for gateway URL/token; packaged builds do not embed runtime auth secrets. | `PASS` | Saved runtime settings + packaged build env isolation. |
| G2C-13 | Production manifest includes the gateway origin, Deepgram WebSocket origin, and `g2-microphone` permission. | `PASS` | CI-generated `app.json` and `app.json.example`. |
| G2C-14 | CI packages a deployable `.ehpk`, scans build inputs and package bytes for secret canaries, and publishes tagged builds as GitHub Release assets. | `PASS` | `Package VEGA HUD` workflow run succeeded after PRs #14–#17. |
| G2C-15 | A tagged release uses the tag version for package metadata without requiring manual edits to every checked-in version reference. | `PASS` | Release workflow rewrites package/lock/manifest metadata inside the runner. |
| G2C-16 | Answer quality, evidence acquisition, retrieval policy, and grounded-answer validation are not implemented in VEGA HUD. | `OUT OF SCOPE` | These belong to CCP / Chat Orchestrator and are debugged there. |

## Packaged-device regression

Before treating a new packaged build as production-ready, verify on the real G2:

1. Launch → tap to talk → `Listening...`.
2. Speak a normal question and see recognizable transcript text.
3. End of speech completes exactly one CCP turn.
4. The answer renders and pagination works.
5. Tap and ask a follow-up; continuity behaves as expected.
6. Double tap during listening cancels without sending.
7. Exit/error leaves the microphone off.
8. Phone settings and `Test Connection` still work.

## Retired requirements

No active requirement in this file covers Brief, Recall, Status, Dashboard/Ask mode navigation, direct Telegram/MTProto authentication, Telegram bot discovery, bot selection, Telegram reply correlation, or Telegram credential/session storage in the HUD. Those directions are intentionally retired rather than deferred phases of this plan.
