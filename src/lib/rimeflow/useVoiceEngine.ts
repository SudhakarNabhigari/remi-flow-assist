import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

import { AudioPlayback } from "./audio";
import {
  DEFAULT_TOOL_DELAY_MS,
  detectSpokenLanguage,
  getLanguage,
  type LanguageCode,
} from "./config";
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
import {
  agentReply,
  runStayLookup,
  speak,
  transcribeAudio,
} from "./voice.functions";

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

const TOOL_KEYWORDS =
  /(hotel|villa|stay|room|resort|apartment|book|booking|flight|duplex|goa)/i;

export function useVoiceEngine(
  settings: VoiceEngineSettings,
  userId: string | null,
  onLanguageDetected?: (language: LanguageCode) => void,
) {
  const [state, setState] = useState<VoiceState>("IDLE");
  const [partial, setPartial] = useState("");
  const [lastUser, setLastUser] = useState("");
  const [lastReply, setLastReply] = useState("");
  const [level, setLevel] = useState(0);
  const [awake, setAwake] = useState(false);
  const awakeRef = useRef(false);
  const [sttMode, setSttMode] = useState<SttMode>("unavailable");
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [providerInfo, setProviderInfo] =
    useState<SpeechProviderInfo>({
      provider: null,
      fallbackReason: null,
      speaker: null,
      availabilityNote: null,
    });

  const [events, setEvents] = useState<VoiceEvent[]>([]);
  const [toolDelayMs, setToolDelayMs] =
    useState(DEFAULT_TOOL_DELAY_MS);

  const controller = useMemo(
    () => new InterruptController(),
    [],
  );

  /*
   * ONE persistent audio player for the entire voice engine.
   */
  const playerRef = useRef<AudioPlayback>(
    new AudioPlayback(),
  );

  const sttRef = useRef<SttEngine | null>(null);
  const settingsRef = useRef(settings);
  const busyRef = useRef(false);
  const interruptPendingRef = useRef(false);

  const historyRef = useRef<
    { role: "user" | "assistant"; content: string }[]
  >([]);

  const userIdRef = useRef(userId);
  const toolDelayRef = useRef(toolDelayMs);
  const languageCbRef = useRef(onLanguageDetected);

  const [spokenLanguage, setSpokenLanguage] =
    useState<LanguageCode>(settings.language);

  settingsRef.current = settings;
  awakeRef.current = awake;
  userIdRef.current = userId;
  toolDelayRef.current = toolDelayMs;
  languageCbRef.current = onLanguageDetected;

  /*
   * Audio can only be reliably unlocked by a user gesture.
   * start() is normally called from the microphone interaction,
   * so unlock here.
   */
  const unlockAudio = useCallback(() => {
    playerRef.current.unlock();
  }, []);

  useEffect(() => {
    return controller.subscribe((event) => {
      setEvents((prev) => [
        ...prev.slice(-199),
        event,
      ]);
    });
  }, [controller]);

  const persistEvent = useCallback(
    (event: VoiceEvent) => {
      const uid = userIdRef.current;

      if (!uid) return;

      void supabase
        .from("voice_events")
        .insert({
          user_id: uid,
          event_type: event.eventType,
          request_id: event.requestId,
          conversation_version:
            event.conversationVersion,
          metadata: event.metadata as never,
        })
        .then(() => undefined);
    },
    [],
  );

  useEffect(() => {
    return controller.subscribe(persistEvent);
  }, [controller, persistEvent]);

  /*
   * One-shot speech:
   * welcome, nickname confirmation, preview, etc.
   */
  const speakOnce = useCallback(
    async (
      text: string,
      options?: {
        language?: LanguageCode;
        voiceCategory?: string;
      },
    ) => {
      unlockAudio();

      const cfg = settingsRef.current;

      const result = await speak({
        data: {
          text,
          language:
            options?.language ?? cfg.language,
          voiceCategory:
            options?.voiceCategory ??
            cfg.voiceCategory,
          speed: cfg.speechSpeed,
        },
      });

      if (!result.audioBase64) {
        throw new Error(
          "Speech service returned no audio.",
        );
      }

      setProviderInfo({
        provider: result.provider,
        fallbackReason:
          result.fallbackReason,
        speaker: result.speaker,
        availabilityNote:
          result.availabilityNote,
      });

      setState("SPEAKING");

      try {
        await playerRef.current.play(
          result.audioBase64,
          result.mimeType || "audio/mpeg",
        );
      } finally {
        setState((previous) =>
          previous === "SPEAKING"
            ? "IDLE"
            : previous,
        );
      }

      return result;
    },
    [unlockAudio],
  );

  const stopSpeaking = useCallback(() => {
    const t0 = performance.now();

    playerRef.current.stop();

    const elapsed = performance.now() - t0;

    controller.recordAudioStopLatency(
      Math.round(elapsed),
    );

    controller.emit("RIME_STOPPED", {
      stopLatencyMs: Math.round(elapsed),
    });
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

      await supabase
        .from("conversations")
        .insert({
          user_id: uid,
          request_text: row.request,
          response_text: row.response,
          interrupted_text:
            row.interruptedText,
          language: cfg.language,
          voice_category:
            cfg.voiceCategory,
          voice_provider:
            row.provider,
          nickname: cfg.nickname,
          was_interrupted:
            row.wasInterrupted,
          recovery_status:
            row.recoveryStatus,
          conversation_version:
            row.version,
          request_id:
            row.requestId,
        });
    },
    [],
  );

  const processUtterance = useCallback(
    async (
      text: string,
      context: {
        interrupted: boolean;
        previous: string | null;
      },
    ) => {
      const cleanText = text.trim();

      if (!cleanText) return;

      const ticket = context.interrupted
        ? controller.acceptLatestInstruction(
            cleanText,
          )
        : controller.createRequest(cleanText);

      const version =
        ticket.conversationVersion;

      busyRef.current = true;

      setLastUser(cleanText);
      setError(null);

      const detected =
        detectSpokenLanguage(
          cleanText,
          settingsRef.current.language,
        );

      if (
        detected !==
        settingsRef.current.language
      ) {
        controller.emit(
          "LANGUAGE_SWITCHED",
          {
            from:
              settingsRef.current.language,
            to: detected,
          },
        );

        languageCbRef.current?.(detected);
      }

      setSpokenLanguage(detected);

      try {
        let toolSummary: string | null =
          null;

        /*
         * TOOL
         */
        if (TOOL_KEYWORDS.test(cleanText)) {
          setState("TOOL_RUNNING");

          controller.emit(
            "TOOL_STARTED",
            {
              query: cleanText,
              delayMs:
                toolDelayRef.current,
            },
          );

          const started =
            performance.now();

          const result =
            await runStayLookup({
              data: {
                query: cleanText,
                delayMs:
                  toolDelayRef.current,
              },
            });

          const duration =
            Math.round(
              performance.now() -
                started,
            );

          controller.recordToolDuration(
            duration,
          );

          controller.reconcileLateResult(
            version,
            "stay_lookup",
            {
              durationMs: duration,
            },
          );

          if (
            !controller.validateResult(
              version,
              "stay_lookup",
            ).accepted
          ) {
            return;
          }

          toolSummary =
            result.results
              .map(
                (r) =>
                  `${r.name} at ${r.price} rupees`,
              )
              .join("; ");
        }

        /*
         * LLM
         */
        setState("THINKING");

        const reply = await agentReply({
          data: {
            utterance: toolSummary
              ? `${cleanText}\n\n[Tool results: ${toolSummary}]`
              : cleanText,
            language: detected,
            nickname:
              settingsRef.current.nickname,
            history:
              historyRef.current.slice(-8),
            supersedes:
              context.previous,
          },
        });

        if (
          !controller.validateResult(
            version,
            "agent_reply",
          ).accepted
        ) {
          return;
        }

        /*
         * RIME TTS
         */
        controller.emit("RIME_STARTED", {
          chars: reply.text.length,
        });

        const audio = await speak({
          data: {
            text: reply.text,
            language: detected,
            voiceCategory:
              settingsRef.current
                .voiceCategory,
            speed:
              settingsRef.current
                .speechSpeed,
          },
        });

        if (
          !controller.validateResult(
            version,
            "rime_audio",
          ).accepted
        ) {
          return;
        }

        if (
          !controller.markApplied(
            ticket.taskId,
          )
        ) {
          return;
        }

        if (!audio.audioBase64) {
          throw new Error(
            "Rime returned no playable audio.",
          );
        }

        setProviderInfo({
          provider: audio.provider,
          fallbackReason:
            audio.fallbackReason,
          speaker: audio.speaker,
          availabilityNote:
            audio.availabilityNote,
        });

        setLastReply(reply.text);

        historyRef.current = [
          ...historyRef.current.slice(-8),
          {
            role: "user",
            content: cleanText,
          },
          {
            role: "assistant",
            content: reply.text,
          },
        ];

        const requestedAt =
          performance.now();

        controller.emit(
          "RIME_RESPONSE_STARTED",
          {
            provider:
              audio.provider,
          },
        );

        setState("SPEAKING");

        await playerRef.current.play(
          audio.audioBase64,
          audio.mimeType || "audio/mpeg",
          () => {
            controller.recordTimeToFirstAudio(
              Math.round(
                performance.now() -
                  requestedAt,
              ),
            );
          },
        );

        /*
         * Do not allow an older response to
         * become the completed response.
         */
        if (
          controller.currentVersion ===
          version
        ) {
          controller.recordCompleted();

          controller.emit(
            "TASK_COMPLETED",
            {},
          );

          setState("COMPLETED");

          window.setTimeout(() => {
            setState((previous) =>
              previous === "COMPLETED"
                ? "IDLE"
                : previous,
            );
          }, 300);
        }

        void saveTurn({
          request: cleanText,
          response: reply.text,
          interruptedText:
            context.previous,
          wasInterrupted:
            context.interrupted,
          recoveryStatus:
            context.interrupted
              ? "Recovered after interruption"
              : "Completed",
          version,
          requestId:
            ticket.requestId,
          provider:
            audio.provider,
        });
      } catch (caught) {
        /*
         * An obsolete request must never
         * surface an error for the latest request.
         */
        if (
          controller.currentVersion !==
          version
        ) {
          return;
        }

        controller.recordFailure();

        const message =
          caught instanceof Error
            ? caught.message
            : String(caught);

        controller.emit("ERROR", {
          message,
        });

        setError(message);
        setState("ERROR");

        window.setTimeout(() => {
          setState((previous) =>
            previous === "ERROR"
              ? "IDLE"
              : previous,
          );
        }, 1000);
      } finally {
        if (
          controller.currentVersion ===
          version
        ) {
          busyRef.current = false;
          interruptPendingRef.current =
            false;
        }
      }
    },
    [controller, saveTurn],
  );

  const handleFinalTranscript =
    useCallback(
      (raw: string) => {
        const cfg =
          settingsRef.current;

        const text = raw.trim();

        if (!text) return;

        setPartial("");

        controller.emit(
          "USER_AUDIO_ENDED",
          { text },
        );

        /*
         * Wake word mode.
         */
        if (
          !awakeRef.current &&
          cfg.wakeWordEnabled
        ) {
          // The assistant wake phrase is "Hey Remi". The user's
          // nickname is separate from the assistant's wake name.
          const wakeDetected =
            matchesWakePhrase(text, "Remi") ||
            matchesWakePhrase(text, cfg.nickname);

          if (!wakeDetected) {
            return;
          }

          controller.emit(
            "WAKE_WORD_DETECTED",
            {
              nickname: cfg.nickname,
            },
          );

          setAwake(true);
          awakeRef.current = true;

          const remainder =
            stripWakePhrase(
              text,
              cfg.nickname,
            );

          if (remainder) {
            void processUtterance(
              remainder,
              {
                interrupted: false,
                previous: null,
              },
            );
          } else {
            void speakOnce(
              `Hi ${cfg.nickname}! How can I help?`,
            ).catch((error) => {
              setError(
                error instanceof Error
                  ? error.message
                  : String(error),
              );
            });
          }

          return;
        }

        const interrupted =
          interruptPendingRef.current ||
          busyRef.current;

        const previous =
          interrupted
            ? controller.currentRequest
                ?.text ?? null
            : null;

        if (
          interrupted &&
          !interruptPendingRef.current
        ) {
          stopSpeaking();

          controller.detectInterrupt(
            "final_transcript_during_active_turn",
            { text },
          );
        }

        void processUtterance(text, {
          interrupted,
          previous,
        });
      },
      [
        awake,
        controller,
        processUtterance,
        speakOnce,
        stopSpeaking,
      ],
    );

  /*
   * BARGE-IN:
   * first partial speech immediately stops
   * current Rime playback.
   */
  const handlePartialTranscript =
    useCallback(
      (text: string) => {
        setPartial(text);

        if (!awakeRef.current) return;

        const active =
          playerRef.current.isPlaying ||
          busyRef.current;

        if (
          active &&
          !interruptPendingRef.current
        ) {
          interruptPendingRef.current =
            true;

          const previous =
            controller.currentRequest
              ?.text ?? null;

          stopSpeaking();

          controller.detectInterrupt(
            "user_spoke_during_active_turn",
            {
              partial: text,
              previous,
            },
          );

          setState("INTERRUPTED");
        }
      },
      [awake, controller, stopSpeaking],
    );

  const start = useCallback(
    async () => {
      /*
       * Critical:
       * start() should be triggered by the
       * microphone/user interaction.
       */
      unlockAudio();

      if (sttRef.current) return;

      const mode = detectSttMode();

      setSttMode(mode);

      if (mode === "unavailable") {
        setError(
          "This browser cannot capture speech. Use a recent Chrome, Edge or Safari build.",
        );
        return;
      }

      const lang =
        getLanguage(
          settingsRef.current.language,
        );

      const callbacks = {
        onPartial:
          handlePartialTranscript,

        onFinal:
          handleFinalTranscript,

        onLevel:
          setLevel,

        onError:
          (message: string) => {
            setError(message);
          },

        onStateChange:
          (isListening: boolean) => {
            setListening(
              isListening,
            );

            if (isListening) {
              controller.emit(
                "USER_AUDIO_STARTED",
                {},
              );
            }
          },
      };

      try {
        sttRef.current =
          mode === "browser"
            ? createBrowserStt(
                lang.bcp47,
                callbacks,
              )
            : createServerStt(
                lang.sttCode,
                (payload) =>
                  transcribeAudio({
                    data: payload,
                  }),
                callbacks,
              );

        await sttRef.current.start();

        controller.emit(
          "STT_READY",
          { mode },
        );
      } catch (caught) {
        sttRef.current = null;

        const message =
          caught instanceof Error
            ? caught.message
            : String(caught);

        setError(
          `Microphone error: ${message}`,
        );
      }
    },
    [
      controller,
      handleFinalTranscript,
      handlePartialTranscript,
      unlockAudio,
    ],
  );

  const stop = useCallback(() => {
    sttRef.current?.stop();
    sttRef.current = null;

    playerRef.current.stop();

    setListening(false);
    setAwake(false);
    awakeRef.current = false;
    setState("IDLE");

    busyRef.current = false;
    interruptPendingRef.current =
      false;
  }, []);

  useEffect(() => {
    const lang =
      getLanguage(settings.language);

    sttRef.current?.setLanguage(
      lang.bcp47,
      lang.sttCode,
    );
  }, [settings.language]);

  useEffect(
    () => () => stop(),
    [stop],
  );

  const metrics = useMemo(
    () => ({
      interruptions:
        controller.stats.interruptions,

      interruptionsHandled:
        controller.stats
          .interruptionsHandled,

      interruptionSuccessRate:
        controller.stats.interruptions ===
        0
          ? null
          : Math.round(
              (controller.stats
                .interruptionsHandled /
                controller.stats
                  .interruptions) *
                100,
            ),

      audioStopLatencyMs:
        average(
          controller.stats
            .audioStopLatencies,
        ),

      timeToFirstAudioMs:
        average(
          controller.stats
            .timeToFirstAudio,
        ),

      toolDurationMs:
        average(
          controller.stats
            .toolDurations,
        ),

      staleResultsRejected:
        controller.stats
          .staleResultsRejected,

      staleResultLeakage:
        controller.stats
          .staleResultsLeaked,

      duplicateActions:
        controller.stats
          .duplicateActions,

      completedRequests:
        controller.stats
          .completedRequests,

      failedRequests:
        controller.stats
          .failedRequests,
    }),
    [controller, events],
  );

  return {
    state,
    setState,
    partial,
    spokenLanguage,
    lastUser,
    lastReply,
    level:
      state === "SPEAKING"
        ? Math.max(
            level,
            playerRef.current.level,
          )
        : level,
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
    unlockAudio,
  };
}

export type VoiceEngine =
  ReturnType<typeof useVoiceEngine>;