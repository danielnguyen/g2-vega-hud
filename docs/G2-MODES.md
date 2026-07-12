# Direct Telegram Ask Mode

**Status:** Draft specification  
**Scope:** G2 glasses experience, phone-side configuration, direct Telegram transport, and voice input

## 1. Objective

Replace the current glasses modes with two sibling top-level modes:

```text
Dashboard
Ask
```

`Dashboard` is reserved for a future design. In the first implementation it may open a placeholder screen and support normal back navigation.

`Ask` provides a voice-driven way to select a configured Telegram bot, send a spoken question as the authenticated Telegram user, and display the bot's text response on the glasses.

The Ask path must not require a custom application backend, Node-RED flow, CCP gateway, or other intermediary service. The glasses application connects directly to:

1. A speech-to-text provider for transcription.
2. Telegram through a user-authorized MTProto client.

The selected Telegram bot may use any backend internally; that is outside the HUD's scope.

## 2. Product principles

1. **Use familiar G2 interaction patterns.** Prefer native Even list containers, tap selection, double-tap back navigation, and swipe scrolling.
2. **Keep the glasses view focused.** Display only the current question and response. The HUD does not need to render prior chat history.
3. **Preserve Telegram history.** Questions must be sent as ordinary messages from the authenticated Telegram user, and bot responses must remain ordinary Telegram messages. The same exchange must therefore be visible later in official Telegram clients.
4. **Own the implementation.** External projects may be consulted as references, but the application must not depend on another application's hosted services, releases, configuration, or runtime.
5. **Keep privileged credentials minimal and explicit.** BotFather tokens are not used by the HUD. The HUD authenticates as a Telegram user, not as a bot.
6. **Do not embed personal examples.** Documentation, tests, fixtures, screenshots, and sample configuration must use generic placeholders only.

## 3. User experience

### 3.1 Top-level screen

On application activation, show a native-style selectable list:

```text
VEGA HUD

> Dashboard
  Ask
```

Controls:

- Swipe up/down: move selection.
- Single tap: open selected mode.
- Double tap at the top level: request application exit through the host experience.

### 3.2 Dashboard placeholder

Until Dashboard is designed, selecting it displays:

```text
DASHBOARD

Coming later
```

A double tap returns to the top-level screen.

No dashboard API calls, data retrieval, or gateway integration are required in this phase.

### 3.3 Ask bot picker

Selecting Ask opens a native-style list of enabled configured bots:

```text
ASK

> Assistant One
  Assistant Two
```

Controls:

- Swipe up/down: move selection using the native list behavior.
- Single tap: open the selected bot.
- Double tap: return to the top-level screen.

If no bots are configured, show a setup message directing the user to the phone-side configuration screen.

### 3.4 Bot conversation screen

Opening a bot initially displays:

```text
ASSISTANT ONE

Tap to talk
```

The conversation screen uses tap-to-toggle voice capture because the G2 touch surface emits discrete gestures rather than press-and-hold input.

#### Idle

- Single tap: begin microphone capture and transcription.
- Double tap: return to the bot picker.
- Swipe up/down: scroll the current question/response when it exceeds the visible area.

#### Listening

Display a persistent listening state and the live transcript:

```text
Listening...
Tap to send · 2-tap to cancel

What is scheduled for today?
```

- Single tap: stop recording, finalize the transcript, and send it.
- Double tap: cancel recording and return to the idle bot screen without sending.

#### Sending/waiting

After transcription is finalized:

```text
ASSISTANT ONE

Sending...
```

Then:

```text
ASSISTANT ONE

Waiting for response...
```

#### Response

Display only the current turn:

```text
YOU

What is scheduled for today?

ASSISTANT ONE

There are two scheduled items today...
```

- Swipe up/down: scroll the current turn.
- Single tap: begin another question to the same bot.
- Double tap: return to the bot picker.

The HUD may discard the rendered turn when leaving the bot screen. Telegram remains the durable conversation history.

## 4. Architecture

```text
Even G2 microphone
        |
        | PCM audio through Even Hub SDK
        v
g2-vega-hud PWA
        |
        +---- direct WebSocket/HTTPS ----> speech-to-text provider
        |
        +---- direct MTProto connection -> Telegram
                                             |
                                             v
                                      selected Telegram bot
                                             |
                                             v
                                      Telegram response
                                             |
                                             v
                                   text rendered on G2
```

### 4.1 Explicit exclusions from the Ask path

The Ask request path must not pass through:

- `g2-gateway`
- `chat-orchestrator`
- a CCP-specific API
- Node-RED
- a custom Telegram proxy
- a custom speech relay

A third-party speech-to-text provider is expected unless a local transcription option is introduced later.

### 4.2 Telegram client

The application uses a browser-compatible MTProto client, such as GramJS, from inside the Even companion-app WebView.

The Telegram client must support:

- User login and session restoration.
- Dialog discovery.
- Bot identification.
- Sending a text message as the authenticated user.
- Receiving new messages from configured bots.
- Receiving message edits so streamed or progressively edited bot responses can update the displayed answer.
- Session logout/revocation.

The application must not use BotFather bot tokens for this flow. A bot token authenticates software as that bot and cannot represent the human participant in a normal user-to-bot conversation.

## 5. Phone-side configuration

The phone WebView remains the setup, configuration, and diagnostics surface.

### 5.1 Telegram account configuration

Required fields/state:

- Telegram API ID.
- Telegram API hash.
- Telegram authenticated session.
- Connection status.
- Log out and revoke session action.

Authentication may use Telegram's supported code-based flow initially. QR login may be added later.

The API ID, API hash, and session are application/account credentials. They are configured once and shared across all selected bots.

### 5.2 Speech-to-text configuration

Required fields/state:

- Provider selection, if more than one provider is supported.
- Provider API key or credential.
- Connection/validation status where supported.

The first implementation may support one provider behind a small internal interface. The UI and stored settings should not assume that only one provider can ever exist.

### 5.3 Bot configuration

The preferred flow is:

1. Connect the Telegram user account.
2. Load existing Telegram dialogs.
3. Filter to bot conversations.
4. Allow the user to enable, disable, and order the bots shown on the glasses.
5. Persist the stable Telegram peer ID and display metadata.

Manual add-by-username may be provided as a fallback.

Each configured bot contains:

```ts
type ConfiguredBot = {
  peerId: string;
  username: string;
  displayName: string;
  enabled: boolean;
  order: number;
};
```

The configuration must not request or store:

- BotFather bot tokens.
- Bot-side username allowlists.
- Bot-side chat allowlists.
- Bot polling intervals.

Those values belong to bot hosting infrastructure and are unrelated to the user-authorized Telegram client in the HUD.

### 5.4 Persistence

Durable settings must use the Even Hub SDK storage APIs because browser local storage may not persist reliably in the companion-app WebView.

At minimum, persist:

```ts
type AskSettings = {
  telegramApiId: string;
  telegramApiHash: string;
  telegramSession: string;
  sttProvider: string;
  sttCredential: string;
  configuredBots: ConfiguredBot[];
};
```

Secrets must never be written to console logs, debug displays, error strings, test snapshots, or committed configuration files.

## 6. Voice transcription

### 6.1 Capture

- Request the G2 microphone permission in the Even package manifest.
- Start capture using the Even Hub SDK audio control API.
- Consume PCM frames from Even Hub audio events.
- Stop capture before finalizing or cancelling the transcription session.

### 6.2 Speech-to-text interface

Hide the provider behind an application-owned interface:

```ts
type TranscriptSnapshot = {
  finalText: string;
  interimText: string;
};

interface SpeechToTextSession {
  sendPcm(pcm: Uint8Array): void;
  finish(): Promise<TranscriptSnapshot>;
  cancel(): void;
}

interface SpeechToTextProvider {
  start(
    onTranscript: (snapshot: TranscriptSnapshot) => void,
    onError: (error: Error) => void
  ): SpeechToTextSession;
}
```

Provider-specific code must not leak into navigation, Telegram, or glasses-rendering modules.

### 6.3 Empty transcript

If the finalized transcript is empty:

- Do not send a Telegram message.
- Return to the bot idle screen.
- Show a brief non-blocking status such as `Nothing heard`.

## 7. Turn and reply handling

### 7.1 MVP concurrency rule

Allow only one pending glasses-originated turn at a time.

While a turn is pending:

- Ignore additional send attempts.
- Continue allowing cancel/back only where doing so cannot create an ambiguous reply state.
- Clearly show the waiting state.

This avoids correlating simultaneous replies across multiple selected bots in the first implementation.

### 7.2 Outgoing message

When a transcript is finalized:

1. Send it to the selected bot through Telegram as the authenticated user.
2. Record the selected peer ID, outgoing Telegram message ID, and send timestamp.
3. Render the question immediately after Telegram confirms the send.

### 7.3 Incoming response

A message is eligible as the active response when:

- It belongs to the selected bot conversation.
- It is not authored by the authenticated user.
- It arrives after the active outgoing question.

The implementation must handle both:

- A bot sending one or more new messages.
- A bot editing a message while generating or refining its response.

For the MVP, the response may be considered settled after a short configurable quiet period following the latest new message or edit. Until then, edits update the visible response in place.

### 7.4 Unrelated Telegram activity

Messages from other chats must not alter the current glasses screen. They may remain available in normal Telegram clients.

### 7.5 Timeout

If no eligible bot response arrives within the configured timeout:

```text
No response yet

The message was sent and remains
available in Telegram.
```

The timeout does not delete or retract the Telegram message.

## 8. Navigation model

Use a small level stack:

```text
home
  -> dashboard
  -> ask bot picker
       -> bot conversation
```

Rules:

- Single tap descends or performs the primary action.
- Double tap climbs one level.
- Double tap at `home` requests host-managed exit confirmation.
- Swipe input changes native list selection or scrolls conversation text, depending on the current level.
- Input events must use one shared Even bridge lifecycle for display, microphone, and event handling.
- Duplicate firmware events must be debounced without suppressing intentional rapid interactions.

## 9. Rendering

### 9.1 Native containers

- Use `ListContainerProperty` for top-level and bot-picker lists.
- Use `TextContainerProperty` for Dashboard placeholder, listening, waiting, response, setup, and error screens.
- Rebuild the page container when switching between list and text container types.
- Use text-container upgrades for in-place transcript and response updates.

### 9.2 Text window

The conversation view must:

- Wrap text to the actual G2 display width.
- Maintain a line-based viewport.
- Auto-follow the newest content while listening and while a response is updating.
- Permit swipe-based scrollback within the current turn.
- Coalesce rapid transcript or Telegram edit updates to avoid excessive BLE writes.

### 9.3 No local conversation history requirement

The glasses application is not required to load, store, or render earlier Telegram turns. Re-entering a bot may start at `Tap to talk` with no previous text.

This does not affect Telegram history: messages sent and received through MTProto remain visible in Telegram clients.

## 10. Security and privacy

### 10.1 Credential model

The direct-client design stores powerful credentials on the device:

- Telegram API ID and hash.
- Telegram user session.
- Speech-to-text credential.

The implementation must:

- Persist credentials only through Even Hub storage.
- Never include them in build-time `VITE_*` variables for packaged releases.
- Never send them to a custom backend.
- Never log them.
- Provide a clear logout action that attempts Telegram session revocation and always clears the local session.
- Explain how to revoke the session from Telegram's device/session management if remote revocation cannot be confirmed.

### 10.2 Network permissions

The Even package manifest must whitelist only the endpoints required for:

- Telegram authentication and MTProto transport.
- The selected speech-to-text provider.
- Development origins in local development manifests only.

Packaging should fail when the built application references an active endpoint absent from the production whitelist.

### 10.3 Audio handling

- Audio is transmitted only while the listening state is active.
- Cancelling must stop microphone capture and close the transcription session.
- Leaving or terminating the application must stop capture, close active network sessions where appropriate, and unsubscribe event handlers.
- The HUD does not provide text-to-speech or audio playback of bot responses.

## 11. Error states

The glasses must provide concise recovery-oriented messages for:

- Telegram not configured.
- Telegram session expired or revoked.
- No bots configured.
- Microphone permission unavailable.
- Speech-to-text connection failure.
- Telegram send failure.
- Telegram connection failure.
- Response timeout.

Errors must not expose raw credentials, complete Telegram session strings, or unnecessarily detailed provider responses.

Phone-side diagnostics may show sanitized technical detail and timestamps.

## 12. Existing behavior changes

The implementation replaces the current glasses-facing modes:

```text
Brief
Ask
Recall
Status
```

with:

```text
Dashboard
Ask
```

Consequences:

- Fixed prompts for Brief, Recall, and Status are removed from the glasses menu.
- The previous fixed Ask prompt is replaced by the bot picker and voice-turn experience.
- System/runtime status remains available on the phone-side configuration and debug surface.
- The existing gateway configuration may remain temporarily for compatibility, but it is not part of the new Ask path and should be removed or isolated in a later cleanup once no active mode depends on it.

## 13. Suggested module boundaries

```text
src/
  navigation/
    stack.ts

  glasses/
    listView.ts
    textView.ts
    conversationView.ts
    wrap.ts

  voice/
    provider.ts
    session.ts
    providers/

  telegram/
    client.ts
    auth.ts
    dialogs.ts
    configuredBots.ts
    replyCorrelation.ts

  screens/
    home.ts
    dashboard.ts
    botPicker.ts
    botConversation.ts

  settings/
    askSettings.ts
    storage.ts
    ui.ts
```

The exact file structure may change, but navigation, voice, Telegram transport, rendering, and settings must remain separable.

## 14. Implementation slices

### Slice 0: input baseline

- Resolve or supersede the existing glasses input-lifecycle work.
- Confirm one shared bridge lifecycle.
- Confirm list selection, tap, double-tap, text scrolling, and clean exit on physical hardware.

### Slice 1: two-mode shell

- Replace existing glasses modes with Dashboard and Ask.
- Implement native list containers.
- Add Dashboard placeholder.
- Add empty Ask bot picker and setup state.

### Slice 2: Telegram account and bot configuration

- Add phone-side Telegram login/session persistence.
- Load dialogs and filter bots.
- Enable, disable, and order configured bots.
- Add logout/revocation.

### Slice 3: voice input

- Add microphone permission and PCM capture.
- Add the speech-to-text provider interface and first provider.
- Implement listening, live transcript, cancel, and empty-transcript behavior.

### Slice 4: direct Telegram turn

- Send finalized text as the authenticated user.
- Subscribe to selected-bot responses and edits.
- Implement one-pending-turn correlation and timeout.
- Render the current question and response only.

### Slice 5: hardening

- Sanitize logs and errors.
- Add endpoint whitelist validation.
- Add cleanup and session-revocation tests.
- Validate Telegram history in official mobile and desktop clients.
- Validate physical-device gesture behavior and BLE update performance.

## 15. Acceptance criteria

### Navigation

- [ ] Launch shows only Dashboard and Ask as sibling modes.
- [ ] Dashboard opens a placeholder and returns with double tap.
- [ ] Ask opens the configured bot list.
- [ ] Selecting a bot opens its conversation screen.
- [ ] Double tap consistently climbs one level.
- [ ] Double tap at home invokes host-managed exit behavior.

### Configuration

- [ ] A Telegram user account can be authenticated from the phone UI.
- [ ] The Telegram session survives an application restart.
- [ ] Existing Telegram bot dialogs can be selected and ordered.
- [ ] No BotFather token is requested or stored.
- [ ] No personal bot names or account identifiers exist in committed fixtures or examples.

### Voice

- [ ] Tap starts microphone capture.
- [ ] Live transcript appears on the glasses.
- [ ] Tap finalizes and sends.
- [ ] Double tap cancels without sending.
- [ ] Empty transcription does not send a message.

### Telegram

- [ ] The question is sent directly through Telegram as the authenticated user.
- [ ] The bot receives the same message as one sent from an official Telegram client.
- [ ] The response is displayed as text on the glasses.
- [ ] Bot message edits update the displayed response.
- [ ] The complete exchange appears in official Telegram mobile and desktop clients.
- [ ] Activity from unrelated Telegram chats does not alter the current HUD screen.

### Security

- [ ] Ask traffic does not pass through a custom application backend.
- [ ] Credentials never appear in logs or packaged example files.
- [ ] Logout attempts remote session revocation and clears local session state.
- [ ] Microphone capture always stops on cancel, exit, or failure.
- [ ] Production network permissions contain only required Telegram and speech-to-text endpoints.

## 16. Deferred and out of scope

- Dashboard content and data integrations.
- Rendering complete Telegram chat history on the glasses.
- Groups, channels, and forum topics.
- File, image, sticker, video, or voice-message handling.
- Text-to-speech or speaker playback.
- Multiple simultaneous pending turns.
- Background notifications while the HUD app is inactive.
- Custom bot hosting or bot-token management.
- A server-side Telegram bridge or proxy.
- CCP-specific routing inside the HUD.
