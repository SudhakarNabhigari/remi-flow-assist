# RimeFlow — Rime Hackathon evidence

Assistant name: **Remi**. App: **RimeFlow**.

## 1. Where Rime is used

All speech synthesis goes through the server module `src/lib/rimeflow/rime.server.ts`.
It is reachable only from the server functions in `src/lib/rimeflow/voice.functions.ts`
(`speak`, `getRimeStatus`), so the Rime API key never reaches the browser.

- `synthesizeSpeech()` — text → audio for every spoken reply.
- `fetchRimeCatalog()` — used by `/about` to display live connection status.
- Language mapping: `en → eng`, `te → tel`, `hi → hin`.

## 2. Honest fallback

If `RIME_API_KEY` is missing or Rime returns an error, the response is produced by a
fallback voice and tagged `provider: "fallback"` with a human-readable reason. The Home
page prints that reason verbatim ("Rime unavailable: …") and the provider badge switches
from **Rime voice** to **Fallback voice**. Nothing is ever presented as Rime output when
it was not produced by Rime.

To make Rime the primary path, add `RIME_API_KEY` (optionally `RIME_MODEL`, `RIME_SPEAKER`)
as project secrets and reload.

## 3. Interruption handling (the challenge core)

`src/lib/rimeflow/interrupt.ts` implements a single authoritative conversation version:

1. **Detect** — user speech during `THINKING`, `TOOL_RUNNING` or `SPEAKING` triggers
   `detectInterrupt()`.
2. **Invalidate** — `invalidateConversation()` bumps the version; every earlier version is
   permanently non-authoritative.
3. **Cancel / fence** — `cancelGeneration()` aborts in-flight LLM and tool work through
   per-version `AbortController`s; work that cannot be aborted is fenced.
4. **Stop audio** — playback is hard-stopped and the stop latency is recorded.
5. **Accept latest** — `acceptLatestInstruction()` creates the new authoritative request.
6. **Gate results** — `validateResult()` rejects any payload from an older version before
   it can be spoken or stored; `reconcileLateResult()` still logs it for the audit trail.
7. **Idempotency** — `markApplied(taskId)` guarantees a retried task is applied once.

## 4. Evidence trail

Every step emits a typed event (`REQUEST_CREATED`, `INTERRUPTION_DETECTED`,
`VERSION_INVALIDATED`, `TOOL_CANCELLED`, `STALE_RESULT_REJECTED`, `RECOVERED`,
`COMPLETED`, `ERROR`) persisted to `voice_events`, scoped to the signed-in user by RLS.

- `/coordinator` — counts derived only from recorded events.
- `/coordinator/evidence` — raw timestamped log, newest first.
- `/coordinator/tests` — runs the acceptance scenarios live in the browser and stores each
  outcome in `test_runs`.

## 5. Automated tests

`src/lib/rimeflow/interrupt.test.ts` (vitest, 6 tests) covers interrupt during a delayed
tool call, stale-result rejection, fencing, idempotency and wake-phrase matching.

```sh
bunx vitest run
```

## 6. Not verified

Rime speaker/model identifiers in `src/lib/rimeflow/config.ts` are configurable defaults.
They have not been validated against a live Rime account; supply your own via
`RIME_SPEAKER` / `RIME_MODEL` if they are rejected.
