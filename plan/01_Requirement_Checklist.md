# G2 Modes -- Requirement Checklist

## Purpose

This checklist is the single authoritative implementation-status record for the G2 Modes implementation plan.

The governing product and architecture contract is [`../docs/G2-MODES.md`](../docs/G2-MODES.md). The implementation order and phase gates are defined in [`README.md`](README.md).

Pull-request or phase-plan completion does not establish specification completion. The plan closes only through Phase 7 after every mandatory row is `PASS` or approved `AMENDED`.

## Allowed results

- `PASS`
- `GAP`
- `AMENDED`

### PASS

The original requirement, actual implementation, relevant automated tests, and physical/runtime behavior where applicable have been reviewed and the requirement is satisfied.

### GAP

The requirement is missing, partial, scaffold-only, unproven, incorrectly enforced, incorrectly composed, or uncertain.

Uncertainty is `GAP`.

### AMENDED

The governing specification was explicitly changed for architectural or product reasons with approval, dependent documents were updated consistently, and the amended requirement is satisfied.

## Status-recording responsibility

- The specification-based audit records the initial `PASS` or `GAP`.
- An implementation pass may add correction evidence but must leave the row as `GAP`.
- A later review pass, beginning from the original requirement, may change the row to `PASS`.
- `AMENDED` may be recorded only after explicit approval and completion of the specification updates.

Evidence should identify the smallest useful set of concrete references, such as a specification section, implementation file or symbol, merged PR or commit, focused automated test, simulator result, physical G2 validation, official Telegram client verification, or negative and fallback evidence.

Evidence must not contain credentials, session strings, account identifiers, private bot names, screenshots with private data, or other personal information.

## Phase 1 -- G2 mode shell

Scope: device-proven navigation, shared Even bridge lifecycle, placeholders, diagnostics, and supersession of the relevant behavior from deprecated PR #8.

| ID | Requirement | Evidence | Result | Gap/correction |
|---|---|---|---|---|
| G2M-R01 | Application launch shows only Dashboard and Ask as sibling glasses-facing modes. | Governing contract: `docs/G2-MODES.md` §§1, 3.1, 12, 15 Navigation. No current implementation evidence reviewed. | `GAP` | Phase 1 must replace Brief/Ask/Recall/Status on the glasses. |
| G2M-R02 | The top-level Dashboard/Ask menu uses an Even SDK native list container. | Governing contract: §§2, 3.1, 9.1, 14 Slice 1. No current implementation evidence reviewed. | `GAP` | Implement and validate native list rendering and selection. |
| G2M-R03 | Selecting Dashboard opens a text placeholder with no dashboard API calls, data retrieval, or gateway integration. | Governing contract: §3.2 and §16. No current implementation evidence reviewed. | `GAP` | Add bounded placeholder only. |
| G2M-R04 | Selecting Ask before bots are configured opens a concise setup state directing configuration to the phone surface. | Governing contract: §3.3 and §11. No current implementation evidence reviewed. | `GAP` | Add empty Ask/setup state without Telegram implementation. |
| G2M-R05 | Single tap on a list selects and opens the highlighted item. | Governing contract: §§3.1, 3.3, 8, 15 Navigation. No current physical evidence reviewed. | `GAP` | Implement and validate on simulator and G2 hardware. |
| G2M-R06 | Double tap consistently climbs one navigation level from Dashboard and Ask child screens. | Governing contract: §§3.2, 3.3, 8, 15 Navigation. No current physical evidence reviewed. | `GAP` | Implement explicit navigation stack and hardware validation. |
| G2M-R07 | Double tap at the top-level menu invokes the normal host-managed exit flow. | Governing contract: §§3.1, 8, 15 Navigation. No current physical evidence reviewed. | `GAP` | Implement host exit request and verify confirmation/exit behavior. |
| G2M-R08 | Display creation and input/event binding use one shared Even bridge lifecycle without independent acquisition races. | Governing contract: §§8, 14 Slice 0. Deprecated PR #8 is reference only and is not merged evidence. | `GAP` | Reimplement from current `main`; validate shared lifecycle. |
| G2M-R09 | Switching between list and text container types uses page-container rebuilds; in-place text updates use upgrades. | Governing contract: §9.1. No current implementation evidence reviewed. | `GAP` | Implement correct list/text transitions and validate on hardware. |
| G2M-R10 | Duplicate firmware events are debounced without suppressing intentional navigation. | Governing contract: §8. Deprecated PR #8 contains reference ideas only. | `GAP` | Add bounded debounce and negative/rapid-input tests. |
| G2M-R11 | Input binding and lifecycle failures are visible through sanitized phone-side diagnostics rather than silently swallowed. | Governing contract: §§5, 11, 14 Slice 0. No current reviewed evidence. | `GAP` | Preserve/add explicit diagnostic state and failure paths. |
| G2M-R12 | Existing phone-side configuration, runtime status, and debug surfaces continue to render during Phase 1. | Governing contract: §§5, 12. No current regression evidence. | `GAP` | Preserve temporarily and run phone-side smoke validation. |
| G2M-R13 | Phase 1 introduces no Telegram, GramJS, speech-to-text, microphone, bot-configuration, or new credential behavior. | Phase plan boundary in `g2-modes/README.md`. No diff reviewed. | `GAP` | Verify dependency and manifest diff before Phase 1 closure. |
| G2M-R14 | Phase 1 build, available automated checks, simulator navigation, and physical G2 validation all pass. | Phase 1 exit gate in `g2-modes/README.md`; `docs/G2-MODES.md` §14 Slice 0. | `GAP` | Collect build/test/simulator/device evidence in a later review pass. |

## Phase 2 -- Telegram account connection

Scope: direct user-authorized MTProto login, persistence, restoration, status, and revocation inside the companion-app WebView.

| ID | Requirement | Evidence | Result | Gap/correction |
|---|---|---|---|---|
| G2M-R15 | The application uses a browser-compatible MTProto client with only the polyfills required by the companion-app WebView. | Governing contract: §§4.2, 13. No implementation evidence. | `GAP` | Add and prove WebView-compatible Telegram client integration. |
| G2M-R16 | The phone UI accepts Telegram API ID and API hash as one shared account-level configuration. | Governing contract: §5.1. No implementation evidence. | `GAP` | Add configuration fields without logging or examples containing live values. |
| G2M-R17 | The phone UI supports Telegram's code-based user authentication flow. | Governing contract: §5.1. No implementation evidence. | `GAP` | Implement bounded login flow and sanitized recovery states. |
| G2M-R18 | Telegram authentication produces a user session rather than a bot-token identity. | Governing contract: §§2, 4.2, 5.1, 5.3. No implementation evidence. | `GAP` | Prove authenticated user identity and absence of BotFather-token flow. |
| G2M-R19 | Telegram API ID, API hash, and session persist only through Even Hub storage. | Governing contract: §§5.4, 10.1. No implementation evidence. | `GAP` | Implement durable SDK storage and negative checks for browser/env storage. |
| G2M-R20 | A valid Telegram session survives application restart and reconnects without repeating login. | Governing contract: §§4.2, 5.1, 15 Configuration. No runtime evidence. | `GAP` | Add restart/resume verification. |
| G2M-R21 | The phone surface exposes truthful connection status and sanitized authentication/connection errors. | Governing contract: §§5.1, 11. No implementation evidence. | `GAP` | Add status model and sanitized diagnostics. |
| G2M-R22 | Logout attempts remote Telegram session revocation and always clears the local session. | Governing contract: §§4.2, 5.1, 10.1, 15 Security. No implementation evidence. | `GAP` | Implement success/failure paths and session-clearing tests. |
| G2M-R23 | When remote revocation cannot be confirmed, the phone UI explains how to revoke through Telegram session/device management without exposing secrets. | Governing contract: §10.1. No implementation evidence. | `GAP` | Add bounded recovery guidance and test sanitized output. |
| G2M-R24 | The HUD does not request or store BotFather bot tokens, bot-side allowlists, chat allowlists, or polling intervals. | Governing contract: §§4.2, 5.3, 15 Configuration. No implementation evidence. | `GAP` | Add negative tests/review of settings schema and UI. |
| G2M-R25 | Telegram traffic does not pass through Node-RED, CCP, `g2-gateway`, `chat-orchestrator`, a custom Telegram proxy, or another custom backend. | Governing contract: §§1, 4.1, 15 Security, 16. No implementation evidence. | `GAP` | Prove direct client network path and manifest endpoints. |
| G2M-R26 | Phase 2 build/tests pass and no credential appears in logs, examples, test snapshots, debug output, or packaged configuration. | Governing contract: §§5.4, 10, 11. No evidence. | `GAP` | Run privacy review and package inspection before closure. |

## Phase 3 -- Bot discovery and selection

Scope: load bot dialogs, configure the enabled ordered list, persist stable peers, and render the Ask picker.

| ID | Requirement | Evidence | Result | Gap/correction |
|---|---|---|---|---|
| G2M-R27 | After Telegram connection, the phone UI can load existing Telegram dialogs. | Governing contract: §§4.2, 5.3, 14 Slice 2. No implementation evidence. | `GAP` | Implement bounded dialog discovery. |
| G2M-R28 | Selectable dialogs are filtered to bot conversations for the MVP. | Governing contract: §§5.3, 16. No implementation evidence. | `GAP` | Add bot classification and negative filtering tests. |
| G2M-R29 | The user can enable and disable which discovered bots appear on the glasses. | Governing contract: §§5.3, 14 Slice 2, 15 Configuration. No implementation evidence. | `GAP` | Add phone-side selection controls. |
| G2M-R30 | Enabled bots can be ordered, and the glasses Ask picker uses that order. | Governing contract: §§5.3, 15 Configuration. No implementation evidence. | `GAP` | Add deterministic ordering and cross-surface tests. |
| G2M-R31 | Configured bot records persist stable peer ID, username, generic display name, enabled state, and order. | Governing contract: §5.3 `ConfiguredBot`. No implementation evidence. | `GAP` | Implement validated settings schema and storage. |
| G2M-R32 | Bot configuration persists across application restart. | Governing contract: §§5.3, 5.4, 15 Configuration. No runtime evidence. | `GAP` | Add persistence/restart verification. |
| G2M-R33 | Ask displays only enabled configured bots using a native-style list. | Governing contract: §§3.3, 9.1, 14 Slice 2. No implementation evidence. | `GAP` | Connect phone configuration to G2 picker. |
| G2M-R34 | Selecting a configured bot opens its idle conversation screen with a tap-to-talk prompt. | Governing contract: §§3.4, 15 Navigation. No implementation evidence. | `GAP` | Add bot conversation frame without microphone behavior yet. |
| G2M-R35 | When no bots are configured, Ask shows the setup state and does not fail or display stale peers. | Governing contract: §§3.3, 11. No implementation evidence. | `GAP` | Add empty-state and stale-settings tests. |
| G2M-R36 | Committed fixtures, tests, examples, screenshots, and documentation use generic placeholders and contain no private bot or account identifiers. | Governing contract: §§2, 15 Configuration. No repository-wide review evidence. | `GAP` | Run privacy review before Phase 3 closure. |

## Phase 4 -- Voice transcription

Scope: microphone permission, PCM capture, provider abstraction, listening UI, live transcript, finalize, cancel, empty input, and cleanup.

| ID | Requirement | Evidence | Result | Gap/correction |
|---|---|---|---|---|
| G2M-R37 | The Even package requests only the G2 microphone permission required for voice capture. | Governing contract: §§6.1, 10.2. No manifest evidence. | `GAP` | Add permission and review production manifest. |
| G2M-R38 | Microphone capture starts only after a tap from the idle bot conversation screen. | Governing contract: §§3.4 Idle, 6.1, 10.3. No implementation evidence. | `GAP` | Implement state-gated `audioControl` behavior. |
| G2M-R39 | PCM frames are consumed only by the active speech-to-text session while listening. | Governing contract: §§6.1, 10.3. No implementation evidence. | `GAP` | Add audio-event routing and negative-state tests. |
| G2M-R40 | Speech-to-text provider behavior is hidden behind an application-owned provider/session interface. | Governing contract: §§5.2, 6.2, 13. No implementation evidence. | `GAP` | Implement separable interface without leaking provider code into navigation/Telegram/rendering. |
| G2M-R41 | The first speech-to-text provider connects directly from the PWA without a custom speech relay. | Governing contract: §§1, 4, 4.1, 6.2. No implementation evidence. | `GAP` | Add direct provider client and network evidence. |
| G2M-R42 | While listening, the glasses display a persistent listening state and live interim/final transcript. | Governing contract: §3.4 Listening and §6.2. No implementation evidence. | `GAP` | Add debounced transcript rendering and device validation. |
| G2M-R43 | A single tap while listening stops capture, finalizes the transcript, and moves to a local finalized state. | Governing contract: §§3.4, 6.1, 15 Voice. No implementation evidence. | `GAP` | Implement and validate finalize semantics before Telegram wiring. |
| G2M-R44 | A double tap while listening cancels without sending and returns to the bot idle state. | Governing contract: §§3.4 Listening, 10.3, 15 Voice. No implementation evidence. | `GAP` | Implement cancel path and negative send evidence. |
| G2M-R45 | An empty finalized transcript does not send a message and reports a brief non-blocking status. | Governing contract: §6.3 and §15 Voice. No implementation evidence. | `GAP` | Add empty-transcript behavior and tests. |
| G2M-R46 | Microphone capture and the transcription session stop on cancel, application exit, foreground termination, provider failure, and other failure paths. | Governing contract: §§10.3, 11, 15 Security. No implementation evidence. | `GAP` | Add cleanup guards and failure-path tests. |
| G2M-R47 | Audio is transmitted only while the listening state is active. | Governing contract: §10.3. No network/runtime evidence. | `GAP` | Add state and transport evidence. |
| G2M-R48 | Repeated listen/finalize/cancel cycles work on physical G2 hardware without stale sessions or duplicate transitions. | Phase 4 exit gate in `g2-modes/README.md`. No physical evidence. | `GAP` | Run repeated device validation. |

## Phase 5 -- Send a direct Telegram turn

Scope: send finalized text as the authenticated user, track the active outgoing turn, render the question, and wait truthfully.

| ID | Requirement | Evidence | Result | Gap/correction |
|---|---|---|---|---|
| G2M-R49 | A finalized non-empty transcript is sent directly to the selected bot through Telegram as the authenticated user. | Governing contract: §§1, 4.2, 7.2, 15 Telegram. No implementation evidence. | `GAP` | Connect STT output to direct MTProto send. |
| G2M-R50 | The outgoing turn records selected peer ID, Telegram message ID, and send timestamp. | Governing contract: §7.2. No implementation evidence. | `GAP` | Add bounded active-turn record and tests. |
| G2M-R51 | After Telegram confirms the send, the glasses immediately render the question. | Governing contract: §§3.4 Response, 7.2. No implementation evidence. | `GAP` | Add optimistic/confirmed rendering with truthful failure handling. |
| G2M-R52 | After sending, the glasses show a clear waiting-for-response state. | Governing contract: §3.4 Sending/waiting. No implementation evidence. | `GAP` | Add explicit sending and waiting states. |
| G2M-R53 | Only one glasses-originated turn may be pending at a time. | Governing contract: §7.1 and §16. No implementation evidence. | `GAP` | Add concurrency gate and repeated-input tests. |
| G2M-R54 | Additional send attempts while a turn is pending do not create duplicate Telegram messages. | Governing contract: §7.1. No implementation evidence. | `GAP` | Add suppression and negative Telegram evidence. |
| G2M-R55 | Telegram send failure is shown truthfully and does not claim that the question was delivered. | Governing contract: §11. No implementation evidence. | `GAP` | Add sanitized send-failure state and retry/back behavior. |
| G2M-R56 | The glasses-originated question appears as an ordinary user-authored message in official Telegram clients. | Governing contract: §§2, 7.2, 9.3, 15 Telegram. No official-client evidence. | `GAP` | Verify in official mobile and/or desktop client. |
| G2M-R57 | The direct Ask message path contains no custom application backend, Telegram proxy, Node-RED, CCP, or gateway hop. | Governing contract: §§4.1, 15 Security, 16. No network evidence. | `GAP` | Review runtime calls and production whitelist. |

## Phase 6 -- Receive and render replies

Scope: selected-peer subscriptions, reply correlation, edits, settlement, current-turn rendering, scrolling, unrelated activity, and timeout.

| ID | Requirement | Evidence | Result | Gap/correction |
|---|---|---|---|---|
| G2M-R58 | The Telegram client subscribes to new messages from configured bot conversations. | Governing contract: §§4.2, 7.3, 14 Slice 4. No implementation evidence. | `GAP` | Add bounded subscription lifecycle. |
| G2M-R59 | An eligible active response belongs to the selected bot conversation, is not authored by the authenticated user, and arrives after the active question. | Governing contract: §7.3. No implementation evidence. | `GAP` | Implement correlation and negative tests. |
| G2M-R60 | Messages from other chats do not alter the current glasses screen. | Governing contract: §§7.4, 15 Telegram. No implementation evidence. | `GAP` | Add unrelated-chat tests and runtime evidence. |
| G2M-R61 | The implementation handles both new bot messages and edits to an existing bot response. | Governing contract: §§4.2, 7.3, 15 Telegram. No implementation evidence. | `GAP` | Subscribe to edits and update response in place. |
| G2M-R62 | A bounded configurable quiet period determines when a progressively updated response is settled. | Governing contract: §7.3. No implementation evidence. | `GAP` | Add deterministic timer behavior and tests. |
| G2M-R63 | The glasses render only the current question and current response, not prior Telegram history. | Governing contract: §§2, 3.4, 9.3, 16. No implementation evidence. | `GAP` | Keep conversation state current-turn only. |
| G2M-R64 | Current-turn text wraps to G2 display width, uses a line viewport, auto-follows updates, and supports swipe scrollback. | Governing contract: §9.2. No implementation or device evidence. | `GAP` | Add wrapping/window logic and hardware validation. |
| G2M-R65 | Rapid transcript/message-edit updates are coalesced to avoid excessive BLE writes. | Governing contract: §9.2. No performance evidence. | `GAP` | Add debounced updates and measure device behavior. |
| G2M-R66 | If no eligible response arrives before timeout, the HUD reports that no response has arrived while preserving the already-sent Telegram message. | Governing contract: §7.5 and §11. No implementation evidence. | `GAP` | Add truthful timeout state and late-response handling decision. |
| G2M-R67 | A single tap after a completed response begins another question to the same selected bot. | Governing contract: §3.4 Response. No implementation evidence. | `GAP` | Add repeated-turn state transition. |
| G2M-R68 | Repeated question/response cycles work with multiple configured bots without cross-chat leakage. | Phase 6 exit gate in `g2-modes/README.md`. No runtime evidence. | `GAP` | Run multi-bot device and Telegram validation using non-committed configuration. |
| G2M-R69 | The complete exchange remains visible in official Telegram mobile and desktop clients. | Governing contract: §§2, 9.3, 15 Telegram. No official-client evidence. | `GAP` | Verify both outgoing question and bot response outside the HUD. |

## Phase 7 -- Hardening, cleanup, and conformance

Scope: obsolete-path removal, credential/privacy controls, whitelist enforcement, cleanup and error evidence, physical performance, and final conformance.

| ID | Requirement | Evidence | Result | Gap/correction |
|---|---|---|---|---|
| G2M-R70 | Obsolete glasses-facing Brief, Recall, Status, and fixed Ask prompt behavior is removed. | Governing contract: §12. No cleanup evidence. | `GAP` | Remove after the replacement path is complete and verify no dead menu entry remains. |
| G2M-R71 | Gateway behavior that no active mode requires is removed or isolated, and the Ask path never depends on it. | Governing contract: §12. No cleanup evidence. | `GAP` | Audit gateway code/settings after Ask completion. |
| G2M-R72 | Telegram API ID/hash, Telegram session, and speech-to-text credential never appear in build-time `VITE_*` values for packaged releases. | Governing contract: §10.1. No package evidence. | `GAP` | Add config/storage review and package inspection. |
| G2M-R73 | Credentials and session values never appear in console logs, debug surfaces, errors, tests, snapshots, committed examples, or documentation. | Governing contract: §§5.4, 10.1, 11. No repository/runtime evidence. | `GAP` | Add redaction tests and privacy review. |
| G2M-R74 | The production manifest whitelists only required Telegram authentication/transport and selected speech-to-text endpoints. | Governing contract: §10.2 and §15 Security. No manifest evidence. | `GAP` | Remove development origins and unrelated endpoints. |
| G2M-R75 | Packaging fails when the built application references an active endpoint absent from the production whitelist. | Governing contract: §10.2 and §14 Slice 5. No implementation evidence. | `GAP` | Add bundle/whitelist validation gate. |
| G2M-R76 | Logout/revocation success, remote-revocation failure, and unconditional local clearing have automated or reproducible evidence. | Governing contract: §§10.1, 14 Slice 5, 15 Security. No evidence. | `GAP` | Add focused tests and sanitized runtime validation. |
| G2M-R77 | Application cleanup stops microphone capture, closes transcription sessions, unsubscribes Even/Telegram handlers, and clears timers on all exits and failures. | Governing contract: §10.3. No composed cleanup evidence. | `GAP` | Add lifecycle cleanup tests and hardware validation. |
| G2M-R78 | Recovery-oriented glasses messages exist for Telegram not configured, expired/revoked session, no bots, microphone unavailable, STT failure, Telegram send/connection failure, and response timeout. | Governing contract: §11. No complete error-state evidence. | `GAP` | Implement and review every listed state. |
| G2M-R79 | Errors never expose raw credentials, complete session strings, or unnecessary provider payloads; phone diagnostics use sanitized detail and timestamps. | Governing contract: §11. No sanitization evidence. | `GAP` | Add redaction and bounded diagnostics tests. |
| G2M-R80 | The HUD provides no text-to-speech or speaker playback of bot responses. | Governing contract: §§10.3, 16. No final dependency/behavior review. | `GAP` | Verify absence of audio-output behavior and dependencies. |
| G2M-R81 | Production builds, automated tests, formatting/diff checks, and package validation pass. | Phase 7 exit gate in `g2-modes/README.md`. No final evidence. | `GAP` | Record final commands and results. |
| G2M-R82 | Physical G2 validation covers native navigation, repeated voice turns, duplicate-event handling, clean exits, response edits, scrolling, and BLE update performance. | Governing contract: §§14–15. No final physical evidence. | `GAP` | Execute and record bounded device checklist without private screenshots/data. |
| G2M-R83 | Deprecated PR #8 remains unmerged and its relevant shared-bridge/input behavior is either demonstrably superseded or explicitly recorded as residual reference-only work. | `g2-modes/README.md` entry gate; PR #8 title marks it deprecated/do-not-merge. No supersession review yet. | `GAP` | Complete after Phase 1 and confirm again at final conformance. |
| G2M-R84 | Dashboard content and all other deferred items remain out of scope unless `docs/G2-MODES.md` is explicitly amended. | Governing contract: §16. No final scope review. | `GAP` | Review final diff and dependency set for deferred-scope leakage. |
| G2M-R85 | A final specification-based review audits every mandatory checklist row against merged implementation and evidence. | Phase 7 conformance gate in `g2-modes/README.md`. No final audit. | `GAP` | Run independent conformance review after implementation PRs merge. |
| G2M-R86 | Every mandatory row is `PASS` or approved `AMENDED`, with no unresolved `GAP`. | Closure rule in `g2-modes/README.md`. Current checklist intentionally begins with unresolved gaps. | `GAP` | Close only after later review proves all rows. |

## Current totals

- `PASS`: 0
- `GAP`: 86
- `AMENDED`: 0

The initial all-`GAP` state is intentional. The governing contract exists, but implementation and evidence have not yet been reviewed against these rows.