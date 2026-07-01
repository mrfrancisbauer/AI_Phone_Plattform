# Voice & conversation pipeline

How the assistant speaks and listens on a call, and where we're headed.

## Current pipeline (turn-based)

```
Anruf ─► Twilio ─► /webhooks/twilio/voice
        <Say voice="…neural…"> greeting + consent
        <Gather input="speech" language="de-DE">   ← Twilio STT
Anrufer spricht ─► SpeechResult ─► /webhooks/twilio/gather
        handleTurn() ── deterministische Fragebogen-Engine (kein LLM live)
        <Say> nächste Frage … (Schleife)
```

- **TTS**: Twilio `<Say>` with a **neural voice** (see below). Twilio synthesizes
  inline — no extra hop, lowest latency for a turn-based flow.
- **STT**: Twilio's built-in speech recognition (`<Gather input="speech">`).
- **Dialogue brain**: the pure questionnaire engine (`packages/shared`),
  deterministic keyword/NL parsing. The LLM (GPT) is used only for the post-call
  summary, not the live dialogue.

## Neural voices (the persona selector, now audible)

Each persona (Business Anna, David, …) maps to a concrete neural voice in
`apps/api/src/lib/voice.ts`, resolved from `assistant.voice` + locale and passed
to `<Say voice="…">`. Provider is set by `TTS_VOICE_PROVIDER`:

- `google` (default) — Google Neural2, 5 distinct DE and EN voices.
- `polly` — Amazon Polly Neural (universally enabled on Twilio; DE neural set is
  smaller, so some personas share a voice). Use this if Google voices aren't
  enabled on the Twilio account.
- `basic` — Twilio's legacy voice (escape hatch).

A neural `voice` token carries its own locale, so `<Say>` must not also set
`language`; the `<Gather>` keeps `language` for speech recognition.

> Before this, the persona was stored but never reached the audio path — every
> call used Twilio's robotic default regardless of the selection. That is fixed.

## Realtime mode (Phase 2, beta — implemented)

With `REALTIME_ENABLED=true`, the tenant flag ("Realtime-Gespräche (Beta)" in
the admin console) and an `OPENAI_API_KEY`, inbound calls skip the turn-based
loop: the voice webhook answers with `<Connect><ConversationRelay>` — Twilio
does streaming STT/TTS + barge-in and exchanges TEXT with our WebSocket
(`/realtime/:token`, signed single-call token). The dialogue is led by an LLM
agent (`apps/api/src/realtime/`):

- consent gate enforced OUTSIDE the LLM (state machine, same regexes as the
  turn-based flow); "Nein" declines exactly like today
- tools-only writes: `save_answer` (validated per question type) and `end_call`;
  the agent persists the same CallMessage/CallAnswer rows, so `finalizeCall`
  (summary, lead, emails, calendar, costs) is unchanged
- real token usage is recorded on the call for accurate cost tracking
- barge-in aborts in-flight generation; `REALTIME_MAX_MINUTES` wraps up politely
- any relay/LLM failure ends the relay; Twilio then hits the `<Connect>` action
  URL and the call CONTINUES in the classic turn-based flow (no dead air)

M0 verification (first real call): confirm latency, barge-in feel, and that the
ConversationRelay attribute set (voice/ttsProvider names) matches the Twilio
account's enabled voices.

## Roadmap — low-latency realtime (Phase 2 plan)

The turn-based flow is solid and cheap but has IVR-like pauses and no barge-in,
and the wording is scripted (no live LLM). The state-of-the-art, budget-aware
next step:

- **Streaming audio**: Twilio Media Streams / ConversationRelay (WebSocket).
- **Pipeline** — either speech-to-speech (**OpenAI Realtime**, most natural,
  priciest) or a **cascaded** low-cost stack (Deepgram STT + GPT-4o-mini +
  Cartesia/ElevenLabs-Flash TTS) orchestrated with **Pipecat** or **LiveKit
  Agents** (~€0.05–0.12/min, ~500–800 ms, barge-in).
- **LLM-driven dialogue**: the questionnaire and calendar booking become
  function-calls the model fills, keeping the data model, lead scoring and GDPR
  controls — while the phrasing becomes natural.
- **Managed shortcut**: Vapi / Retell wrap the whole pipeline (prompt + tools),
  fastest to ship at the cost of some control / vendor lock-in.

This is a deliberate architectural project (a persistent WebSocket media server,
barge-in handling, dialogue logic in the LLM), not a config change.

**→ Der konkrete Umsetzungsplan (Architektur-Entscheidung, Meilensteine,
Kostenmodell, Risiken) steht in [`docs/VOICE_PHASE2.md`](./VOICE_PHASE2.md).**
