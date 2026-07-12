# G2 Modes Implementation Plan

Theme: Replace the current fixed-prompt glasses experience with two sibling modes—Dashboard and Ask—then deliver a direct, voice-driven Telegram bot interaction path without a custom application backend.

## Governing contract

The normative product and architecture contract is [`../docs/G2-MODES.md`](../docs/G2-MODES.md).

This directory tracks implementation order, evidence, gaps, corrections, and closure. It does not replace or redefine the governing contract.

The authoritative implementation-status record is [`01_Requirement_Checklist.md`](01_Requirement_Checklist.md).

## Entry gate

Implementation may begin only from a synchronized `main` that contains:

- merged PR #9;
- `docs/G2-MODES.md`;
- no unreviewed personal identifiers, account values, bot names, credentials, or private configuration in committed documentation, fixtures, examples, tests, logs, or screenshots.

PR #8 is retained as deprecated reference material only. It must not be merged. Relevant shared-bridge, input-lifecycle, debounce, and diagnostics ideas may be reimplemented from current `main`, but PR #8 is not an implementation base or source of closure evidence.

## Phase map

### Phase 1 — G2 mode shell

Establish the device-proven navigation and input foundation before adding external integrations.

Scope:

- replace the glasses-facing Brief/Ask/Recall/Status menu with Dashboard and Ask;
- use a native Even list container for the top-level menu;
- add a Dashboard placeholder;
- add an Ask setup placeholder while no bot configuration exists;
- implement single-tap descent, double-tap back, and host-managed exit from home;
- use one shared Even bridge lifecycle for display, input, and later microphone use;
- preserve useful phone-side configuration/status/debug behavior;
- supersede the relevant behavior from deprecated PR #8 without merging it.

Exit gate:

- build and available automated checks pass;
- simulator navigation works;
- physical G2 validation confirms selection, tap, double-tap, list/text transitions, duplicate-event handling, diagnostics, and clean exit;
- every Phase 1 checklist row is `PASS` or approved `AMENDED`.

### Phase 2 — Telegram account connection

Prove direct user-authorized Telegram access inside the Even companion-app WebView.

Scope:

- add a browser-compatible MTProto client and required polyfills;
- add phone-side Telegram API ID/hash configuration;
- support code-based user login;
- persist and restore the Telegram session through Even Hub storage;
- show connection state and sanitized failures;
- implement logout with remote revocation attempt and unconditional local session clearing;
- do not introduce BotFather tokens, Node-RED, CCP routing, a Telegram proxy, or another custom backend.

Exit gate:

- login succeeds from the phone UI;
- the session survives application restart;
- reconnect and logout/revocation behavior are verified;
- no credential appears in logs, examples, snapshots, or packaged configuration;
- every Phase 2 checklist row is `PASS` or approved `AMENDED`.

### Phase 3 — Bot discovery and selection

Create the configurable bot catalog shown under Ask.

Scope:

- load Telegram dialogs;
- filter selectable entries to bot conversations;
- enable, disable, and order configured bots;
- persist stable peer IDs and generic display metadata;
- render enabled bots in the glasses Ask picker;
- show a setup state when no bots are configured.

Exit gate:

- bot selection and ordering survive restart;
- the phone and glasses surfaces show the same enabled order;
- selecting a configured bot opens the idle conversation screen;
- committed fixtures and examples remain generic;
- every Phase 3 checklist row is `PASS` or approved `AMENDED`.

### Phase 4 — Voice transcription

Prove reliable tap-to-toggle voice capture independently of Telegram sending.

Scope:

- add G2 microphone permission and PCM capture;
- introduce an application-owned speech-to-text interface;
- implement the first direct speech-to-text provider;
- show listening state and live transcript;
- finalize on tap;
- cancel on double-tap;
- suppress empty transcripts;
- guarantee microphone/session cleanup on cancel, exit, and failure.

The final transcript may stop at a local confirmation screen in this phase.

Exit gate:

- repeated listen/finalize/cancel cycles work on physical G2 hardware;
- audio is transmitted only while listening;
- empty or cancelled input never sends a Telegram message;
- every Phase 4 checklist row is `PASS` or approved `AMENDED`.

### Phase 5 — Send a direct Telegram turn

Connect the proven transcription and Telegram account paths.

Scope:

- send finalized text to the selected bot as the authenticated Telegram user;
- record peer ID, outgoing message ID, and send timestamp for the active turn;
- render the confirmed question immediately;
- show a waiting state;
- permit only one pending glasses-originated turn;
- report send failures without claiming success.

Exit gate:

- a glasses-originated question appears as an ordinary user-authored Telegram message;
- the same question is visible in official Telegram clients;
- no custom application backend participates in the Ask path;
- every Phase 5 checklist row is `PASS` or approved `AMENDED`.

### Phase 6 — Receive and render replies

Complete the current-turn conversation loop.

Scope:

- subscribe to new messages and edits;
- correlate eligible replies to the selected peer and active outgoing turn;
- update progressively edited responses in place;
- use a bounded quiet-period settlement rule;
- render only the current question and response;
- support swipe-based line scrolling;
- ignore unrelated Telegram activity;
- provide truthful timeout behavior.

Exit gate:

- repeated question/response cycles work with multiple configured bots;
- message edits update the visible response;
- unrelated chats do not alter the HUD;
- the complete exchange remains visible in official Telegram mobile and desktop clients;
- every Phase 6 checklist row is `PASS` or approved `AMENDED`.

### Phase 7 — Hardening, cleanup, and conformance

Remove obsolete paths, enforce security boundaries, and close the implementation against the contract.

Scope:

- remove obsolete glasses-facing fixed modes and prompts;
- isolate or remove gateway behavior that no active mode requires;
- sanitize logs, errors, tests, fixtures, and debug surfaces;
- restrict production network permissions to required Telegram and speech-to-text endpoints;
- fail packaging when an active endpoint is absent from the production whitelist;
- add cleanup, revocation, timeout, and failure-path evidence;
- validate physical-device gesture behavior and BLE update performance;
- perform a checklist-based conformance review and bounded corrections.

Exit gate:

- every mandatory checklist row is `PASS` or approved `AMENDED`;
- no unresolved `GAP` remains;
- deprecated PR #8 is documented as fully superseded or its residual reference value is explicitly recorded;
- the shipped behavior matches `docs/G2-MODES.md` without introducing deferred scope.

## Required implementation order

1. Phase 1 — G2 mode shell
2. Phase 2 — Telegram account connection
3. Phase 3 — Bot discovery and selection
4. Phase 4 — Voice transcription
5. Phase 5 — Send a direct Telegram turn
6. Phase 6 — Receive and render replies
7. Phase 7 — Hardening, cleanup, and conformance

A later phase must not begin until the preceding phase is closed under the requirement-status rules below. Documentation may identify future work earlier, but implementation should remain bounded to the active phase.

## Working process

Each implementation phase follows the same operating model:

1. Start from synchronized `main`.
2. Confirm the preceding phase is closed in `01_Requirement_Checklist.md`.
3. Use one bounded Codex prompt and one short-lived branch.
4. Open a draft PR.
5. Run the build, tests, formatting/diff checks, and privacy review available for the slice.
6. Review the complete diff and Codex report.
7. Perform physical-device validation where hardware behavior is involved.
8. Record requirement-level evidence in the checklist.
9. Treat uncertain, partial, scaffold-only, or unverified behavior as `GAP`.
10. Merge only after the active phase exit gate is satisfied.

Pull-request completion does not establish phase completion. The checklist is the status authority.

## Requirement status model

The checklist uses:

- `PASS`
- `GAP`
- `AMENDED`

`PASS` requires reviewed implementation, relevant automated evidence, and physical/runtime evidence where applicable.

`GAP` means missing, partial, scaffold-only, unproven, incorrectly enforced, incorrectly composed, or uncertain.

`AMENDED` requires an explicit product or architecture decision, approval, consistent updates to the governing contract and dependent documents, and evidence that the amended requirement is satisfied.

An implementation pass may add correction evidence but must not convert its own `GAP` row to `PASS`. A later review pass must verify the correction from the original requirement.

## Evidence expectations

Use the smallest concrete set of references that proves the row:

- governing specification section;
- implementation file or symbol;
- merged PR and commit;
- focused automated test;
- simulator result;
- physical G2 validation;
- negative/fallback evidence;
- official Telegram client verification where required.

Do not place credentials, session strings, account identifiers, private bot names, or other personal data in evidence records.

## Deferred and out of scope

The following remain outside this implementation plan unless the governing contract is explicitly amended:

- Dashboard content and data integrations;
- complete Telegram history rendering on the glasses;
- groups, channels, and forum topics;
- files, images, stickers, video, or voice-message handling;
- text-to-speech or speaker playback;
- multiple simultaneous pending turns;
- background notifications while the HUD is inactive;
- custom bot hosting or BotFather token management;
- a server-side Telegram bridge or proxy;
- CCP-specific routing inside the HUD.

Dashboard design and implementation will be planned separately after the Ask path is stable.
