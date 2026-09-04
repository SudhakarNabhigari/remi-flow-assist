# RimeFlow — meet Remi

A real-time, multilingual voice assistant built for the Rime Hackathon. Speak naturally,
interrupt at any moment, and Remi drops what it was doing and follows the newest
instruction — with a full audit trail to prove it.

## Highlights

- **Voice-first UI** — glowing orb, live waveform, animated states, royal-blue/white stage.
- **Rime speech** on the server, with an honest, visible fallback when no key is present.
- **Interrupt-safe coordinator** — versioned conversations, abort signals, stale-result
  fencing, idempotent recovery.
- **Multilingual** — English, Telugu, Hindi.
- **Dual STT** — browser speech recognition with automatic server-side fallback.
- **Persisted** — history, settings, voice events and test runs per user (auth + RLS).

## Pages

| Route | Purpose |
| --- | --- |
| `/` | Talk to Remi: orb, waveform, transcript, provider disclosure |
| `/history` | Past turns, including interruptions and recovery status |
| `/coordinator` | Interruption metrics from recorded events |
| `/coordinator/evidence` | Raw timestamped event log |
| `/coordinator/tests` | Live acceptance-test runner |
| `/settings` | Nickname, language, voice style, speed, wake word, accessibility |
| `/about` | What Remi does + live Rime connection status |

## Running

```sh
npm i
npm run dev
```

Tests:

```sh
npx vitest run
```

## Configuration

Copy `.env.example`. The only key you need to add is `RIME_API_KEY` (plus optional
`RIME_MODEL` / `RIME_SPEAKER`). Backend URL/keys and `LOVABLE_API_KEY` are provisioned
automatically. Until a Rime key is present the app speaks with a clearly labelled
fallback voice.

## Demo script (2 minutes)

1. Sign in, land on Home — Remi greets you by name.
2. Tap the orb, say “Remi, find me a stay in Hyderabad.” Watch Listening → Thinking →
   Tool running → Speaking.
3. **Interrupt mid-sentence**: “Actually, make it Chennai.” Audio stops instantly, the old
   tool result is discarded, Remi answers the new question.
4. Open `/coordinator` — the interruption and the rejected stale result are counted.
5. Open `/coordinator/evidence` — the exact sequence, timestamped.
6. Run `/coordinator/tests` — all scenarios pass live.
7. Switch language to Telugu in Settings and repeat one turn.

See `RIME_EVIDENCE.md` for the technical evidence write-up.
