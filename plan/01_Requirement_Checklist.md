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
| G2C-03 | Microphone startup requires the glasses page, STT connection and positive enable acknowledgement; shutdown is confirmed before submission. | `VERIFY` | Lifecycle tests cover acknowledgements, serialized cleanup, cancellation and uncertain shutdown. Repeated physical toggling remains pending. |
| G2C-04 | G2 PCM is routed as signed 16-bit little-endian, 16 kHz, mono audio to the active STT session. | `PASS` | Even audio event routing and Deepgram adapter. |
| G2C-05 | Provider-specific STT behavior is isolated behind the application-owned speech-to-text interface. | `PASS` | `src/speechToText.ts` + `src/stt/deepgram.ts`. |
| G2C-06 | Live transcript updates render while listening; Flux `EndOfTurn` completes the utterance. | `PASS` | Current Deepgram Flux path and physical G2 run. |
| G2C-07 | One completed utterance produces at most one CCP turn with `input_mode: voice_transcribed`. | `PASS` | Capture-settled and pending-turn guards in Conversation Mode. |
| G2C-08 | CCP answers render as bounded pages and can be scrolled on the glasses. | `PASS` | Current response renderer and physical G2 run. |
| G2C-09 | One deliberate start enables sequential follow-ups with the same current conversation; tap resumes after stop/idle. | `VERIFY` | Three-turn lifecycle tests; real G2 hands-free acceptance pending. |
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
5. Ask at least three follow-ups without taps; verify continuity, repeated mic toggling and scrolling the previous answer during rearm/listening. Stop and tap to resume.
6. Double tap during listening cancels without sending.
7. Exit/error leaves the microphone off.
8. Phone settings and `Test Connection` still work.
9. Verify 30-second initial silence and 60-second absolute capture limits without extra submissions.
10. Stop during bootstrap, connection, capture, cleanup and deferred waiting; verify no late restart/answer.
11. Disconnect glasses/network, test phone lock/pocket behavior where supported, and record sustained use/battery observations.

Issue #21 physical acceptance is pending owner testing of the independently reviewed exact head. Record candidate SHA, package version, device/app/firmware versions and results; automated tests do not make these checks PASS. Use the README supported candidate instructions without tagging, merging or deploying.

## Retired requirements

No active requirement in this file covers Brief, Recall, Status, Dashboard/Ask mode navigation, direct Telegram/MTProto authentication, Telegram bot discovery, bot selection, Telegram reply correlation, or Telegram credential/session storage in the HUD. Those directions are intentionally retired rather than deferred phases of this plan.
