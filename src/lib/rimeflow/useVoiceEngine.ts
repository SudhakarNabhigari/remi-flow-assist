import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

import { AudioPlayback } from "./audio";
import { DEFAULT_TOOL_DELAY_MS, getLanguage, type LanguageCode } from "./config";
import type { VoiceEvent, VoiceState } from "./events";
import { InterruptController, average } from "./interrupt";
import {
  createBrowserStt,
  createServerStt,
  detectSttMode,
  matchesWakePhrase,
  stripWakePhrase,
  type SttEngine,
  type SttMode,
} from "./stt";
import { agentReply, runStayLookup, speak, transcribeAudio } from "./voice.functions";

export interface VoiceEngineSettings {
  nickname: string;
  language: LanguageCode;
  voiceCategory: string;
  speechSpeed: number;
  wakeWordEnabled: boolean;
  autoListening: boolean;
}

export interface SpeechProviderInfo {
  provider: "rime" | "fallback" | null;
  fallbackReason: string | null;
  speaker: string | null;
  availabilityNote: string | null;
}

const TOOL_KEYWORDS = /(hotel|villa|stay|room|resort|apartment|book|booking|flight|villa|duplex|goa)/i;

export function useVoiceEngine(settings: VoiceEngineSettings, userId: string | null) {
  const [state, setState] = useState<VoiceState>("IDLE");
  const [partial, setPartial] = useState("");
  const [lastUser, setLastUser] = useState("");
  const [lastReply, setLastReply] = useState("");
  const [level, setLevel] = useState(0);
  const [awake, setAwake] = useState(false);
  const [sttMode, setSttMode] = useState<SttMode>("unavailable");
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providerInfo, setProviderInfo] = useState<SpeechProviderInfo>({
    provider: null,
    fallbackReason: null,
    speaker: null,
    availabilityNote: null,
  });
  const [events, setEvents] = useState<VoiceEvent[]>([]);
  const [toolDelayMs, setToolDelayMs] = useState(DEFAULT_TOOL_DELAY_MS);

  const controller = useMemo(() => new InterruptController(), []);
  const playerRef = useRef<AudioPlayback>(new AudioPlayback());
  const sttRef = useRef<SttEngine | null>(null);
  const settingsRef = useRef(settings);
  const busyRef = useRef(false);
  const interruptPendingRef = useRef(false);
  const historyRef = useRef<{ role: "user" | "assistant"; content: string }[]>([]);
  const userIdRef = useRef(userId);
  const toolDelayRef = useRef(toolDelayMs);

  settingsRef.current = settings;
  userIdRef.current = userId;
  toolDelayRef.current = toolDelayMs;

  useEffect(() => controller.subscribe((event) => setEvents((prev) => [...prev.slice(-199), event])), [controller]);

  const persistEvent = useCallback((event: VoiceEvent) => {
    const uid = userIdRef.current;
    if (!uid) return;
    void supabase
      .from("voice_events")
      .insert({
        user_id: uid,
        event_type: event.eventType,
        request_id: event.requestId,
        conversation_version: event.conversationVersion,
        metadata: event.metadata as never,
      })
      .then(() => undefined);
  }, []);

  useEffect(() => controller.subscribe(persistEvent), [controller, persistEvent]);

  /** One-shot speech used for welcome / nickname / preview — also goes through Rime. */
  const speakOnce = useCallback(
    async (text: string, options?: { language?: LanguageCode; voiceCategory?: string }) => {
      const cfg = settingsRef.current;
      const result = await speak({
        data: {
          text,
          language: options?.language ?? cfg.language,
          voiceCategory: options?.voiceCategory ?? cfg.voiceCategory,
          speed: cfg.speechSpeed,
        },
      });
      setProviderInfo({
        provider: result.provider,
        fallbackReason: result.fallbackReason,
        speaker: result.speaker,
        availabilityNote: result.availabilityNote,
      });
      setState("SPEAKING");
      try {
        await playerRef.current.play(result.audioBase64, result.mimeType);
      } finally {
        setState((prev) => (prev === "SPEAKING" ? "IDLE" : prev));
      }
      return result;
    },
    [],
  );

  const stopSpeaking = useCallback(() => {
    const t0 = performance.now();
    playerRef.current.stop();
    const elapsed = performance.now() - t0;
    controller.recordAudioStopLatency(Math.round(elapsed));
    controller.emit("RIME_STOPPED", { stopLatencyMs: Math.round(elapsed) });
  }, [controller]);

  const saveTurn = useCallback(
    async (row: {
      request: string;
      response: string | null;
      interruptedText: string | null;
      wasInterrupted: boolean;
      recoveryStatus: string;
      version: number;
      requestId: string;
      provider: string | null;
    }) => {
      const uid = userIdRef.current;
      if (!uid) return;
      const cfg = settingsRef.current;
      await supabase.from("conversations").insert({
        user_id: uid,
        request_text: row.request,
        response_text: row.response,
        interrupted_text: row.interruptedText,
        language: cfg.language,
        voice_category: cfg.voiceCategory,
        voice_provider: row.provider,
        nickname: cfg.nickname,
        was_interrupted: row.wasInterrupted,
        recovery_status: row.recoveryStatus,
        conversation_version: row.version,
        request_id: row.requestId,
      });
    },
    [],
  );

  /** Full turn: tool work (optional) -> LLM -> Rime -> playback, version-fenced at every await. */
  const processUtterance = useCallback(
    async (text: string, context: { interrupted: boolean; previous: string | null }) => {
      const ticket = context.interrupted ? controller.acceptLatestInstruction(text) : controller.createRequest(text);
      const version = ticket.conversationVersion;
      busyRef.current = true;
      setLastUser(text);
      setError(null);

      try {
        let toolSummary: string | null = null;
        if (TOOL_KEYWORDS.test(text)) {
          setState("TOOL_RUNNING");
          controller.emit("TOOL_STARTED", { query: text, delayMs: toolDelayRef.current });
          const started = performance.now();
          const result = await runStayLookup({ data: { query: text, delayMs: toolDelayRef.current } });
          const duration = Math.round(performance.now() - started);
          controller.recordToolDuration(duration);
          controller.reconcileLateResult(version, "stay_lookup", { durationMs: duration });
          if (!controller.validateResult(version, "stay_lookup").accepted) return;
          toolSummary = result.results.map((r) => `${r.name} at ${r.price} rupees`).join("; ");
        }

        setState("THINKING");
        const reply = await agentReply({
          data: {
            utterance: toolSummary ? `${text}\n\n[Tool results: ${toolSummary}]` : text,
            language: settingsRef.current.language,
            nickname: settingsRef.current.nickname,
            history: historyRef.current.slice(-8),
            supersedes: context.previous,
          },
        });
        if (!controller.validateResult(version, "agent_reply").accepted) return;

        controller.emit("RIME_STARTED", { chars: reply.text.length });
        const audio = await speak({
          data: {
            text: reply.text,
            language: settingsRef.current.language,
            voiceCategory: settingsRef.current.voiceCategory,
            speed: settingsRef.current.speechSpeed,
          },
        });
        if (!controller.validateResult(version, "rime_audio").accepted) return;
        if (!controller.markApplied(ticket.taskId)) return;

        setProviderInfo({
          provider: audio.provider,
          fallbackReason: audio.fallbackReason,
          speaker: audio.speaker,
          availabilityNote: audio.availabilityNote,
        });
        setLastReply(reply.text);
        historyRef.current = [
          ...historyRef.current.slice(-8),
          { role: "user", content: text },
          { role: "assistant", content: reply.text },
        ];

        const requestedAt = performance.now();
        controller.emit("RIME_RESPONSE_STARTED", { provider: audio.provider });
        setState("SPEAKING");
        await playerRef.current.play(audio.audioBase64, audio.mimeType, () => {
          controller.recordTimeToFirstAudio(Math.round(performance.now() - requestedAt));
        });

        if (controller.currentVersion === version) {
          controller.recordCompleted();
          controller.emit("TASK_COMPLETED", {});
          setState("COMPLETED");
          window.setTimeout(() => setState((prev) => (prev === "COMPLETED" ? "IDLE" : prev)), 1200);
        }

        await saveTurn({
          request: text,
          response: reply.text,
          interruptedText: context.previous,
          wasInterrupted: context.interrupted,
          recoveryStatus: context.interrupted ? "Recovered after interruption" : "Completed",
          version,
          requestId: ticket.requestId,
          provider: audio.provider,
        });
      } catch (caught) {
        if (controller.currentVersion !== version) return;
        controller.recordFailure();
        const message = (caught as Error).message || "Something went wrong. Please try again.";
        controller.emit("ERROR", { message });
        setError(message);
        setState("ERROR");
        window.setTimeout(() => setState((prev) => (prev === "ERROR" ? "IDLE" : prev)), 2500);
      } finally {
        busyRef.current = false;
        interruptPendingRef.current = false;
      }
    },
    [controller, saveTurn],
  );

  const handleFinalTranscript = useCallback(
    (raw: string) => {
      const cfg = settingsRef.current;
      const text = raw.trim();
      if (!text) return;
      setPartial("");
      controller.emit("USER_AUDIO_ENDED", { text });

      if (!awake && cfg.wakeWordEnabled) {
        if (!matchesWakePhrase(text, cfg.nickname)) return;
        controller.emit("WAKE_WORD_DETECTED", { nickname: cfg.nickname });
        setAwake(true);
        const remainder = stripWakePhrase(text, cfg.nickname);
        if (remainder) {
          void processUtterance(remainder, { interrupted: false, previous: null });
        } else {
          void speakOnce("Hi! How can I help?");
        }
        return;
      }

      const interrupted = interruptPendingRef.current || busyRef.current;
      const previous = interrupted ? controller.currentRequest?.text ?? null : null;
      if (interrupted && !interruptPendingRef.current) {
        stopSpeaking();
        controller.detectInterrupt("final_transcript_during_active_turn", { text });
      }
      void processUtterance(text, { interrupted, previous });
    },
    [awake, controller, processUtterance, speakOnce, stopSpeaking],
  );

  /** Barge-in: the first partial word while Remi speaks stops audio immediately. */
  const handlePartialTranscript = useCallback(
    (text: string) => {
      setPartial(text);
      if (!awake) return;
      const active = playerRef.current.isPlaying || busyRef.current;
      if (active && !interruptPendingRef.current) {
        interruptPendingRef.current = true;
        const previous = controller.currentRequest?.text ?? null;
        stopSpeaking();
        controller.detectInterrupt("user_spoke_during_active_turn", { partial: text, previous });
        setState("INTERRUPTED");
      }
    },
    [awake, controller, stopSpeaking],
  );

  const start = useCallback(async () => {
    if (sttRef.current) return;
    const mode = detectSttMode();
    setSttMode(mode);
    if (mode === "unavailable") {
      setError("This browser cannot capture speech. Use a recent Chrome, Edge or Safari build.");
      return;
    }
    const lang = getLanguage(settingsRef.current.language);
    const callbacks = {
      onPartial: handlePartialTranscript,
      onFinal: handleFinalTranscript,
      onLevel: setLevel,
      onError: (message: string) => setError(message),
      onStateChange: (isListening: boolean) => {
        setListening(isListening);
        if (isListening) controller.emit("USER_AUDIO_STARTED", {});
      },
    };
    sttRef.current =
      mode === "browser"
        ? createBrowserStt(lang.bcp47, callbacks)
        : createServerStt(
            lang.sttCode,
            (payload) => transcribeAudio({ data: payload }),
            callbacks,
          );
    await sttRef.current.start();
    controller.emit("STT_READY", { mode });
  }, [controller, handleFinalTranscript, handlePartialTranscript]);

  const stop = useCallback(() => {
    sttRef.current?.stop();
    sttRef.current = null;
    playerRef.current.stop();
    setListening(false);
    setAwake(false);
    setState("IDLE");
  }, []);

  useEffect(() => {
    const lang = getLanguage(settings.language);
    sttRef.current?.setLanguage(lang.bcp47, lang.sttCode);
  }, [settings.language]);

  useEffect(() => () => stop(), [stop]);

  const metrics = useMemo(
    () => ({
      interruptions: controller.stats.interruptions,
      interruptionsHandled: controller.stats.interruptionsHandled,
      interruptionSuccessRate:
        controller.stats.interruptions === 0
          ? null
          : Math.round((controller.stats.interruptionsHandled / controller.stats.interruptions) * 100),
      audioStopLatencyMs: average(controller.stats.audioStopLatencies),
      timeToFirstAudioMs: average(controller.stats.timeToFirstAudio),
      toolDurationMs: average(controller.stats.toolDurations),
      staleResultsRejected: controller.stats.staleResultsRejected,
      staleResultLeakage: controller.stats.staleResultsLeaked,
      duplicateActions: controller.stats.duplicateActions,
      completedRequests: controller.stats.completedRequests,
      failedRequests: controller.stats.failedRequests,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [controller, events],
  );

  return {
    state,
    setState,
    partial,
    lastUser,
    lastReply,
    level: state === "SPEAKING" ? Math.max(level, playerRef.current.level) : level,
    awake,
    listening,
    sttMode,
    error,
    setError,
    providerInfo,
    events,
    metrics,
    controller,
    toolDelayMs,
    setToolDelayMs,
    start,
    stop,
    speakOnce,
    stopSpeaking,
    processUtterance,
  };
}

export type VoiceEngine = ReturnType<typeof useVoiceEngine>;
