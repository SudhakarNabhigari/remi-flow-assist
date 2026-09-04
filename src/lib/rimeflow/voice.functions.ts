import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  DEFAULT_TOOL_DELAY_MS,
  getLanguage,
  getVoiceCategory,
} from "./config";

/**
 * Server boundary for the voice pipeline.
 *
 * Responsibilities:
 * - Rime TTS
 * - Agent replies
 * - Delayed tool work
 * - Server-side STT
 *
 * Secrets are read only on the server and are never returned to the browser.
 */

/* -------------------------------------------------------------------------- */
/* SPEECH / RIME TTS                                                         */
/* -------------------------------------------------------------------------- */

const speakInput = z.object({
  text: z.string().min(1).max(2000),
  voiceCategory: z.string().default("conversational"),
  language: z.string().default("en"),
  speed: z.number().min(0.5).max(2).default(1),
});

export const speak = createServerFn({
  method: "POST",
})
  /**
   * TanStack Start now recommends validator() instead of inputValidator().
   */
  .validator((data: unknown) => speakInput.parse(data))
  .handler(async ({ data }) => {
    const {
      synthesizeSpeech,
      fetchRimeCatalog,
    } = await import("./rime.server");

    const category = getVoiceCategory(data.voiceCategory);

    let speaker = category.requestedRimeSpeaker;
    let categoryAvailable = true;
    let availabilityNote: string | null = null;

    /*
     * Always check the connected Rime catalogue.
     *
     * This prevents us from claiming that a speaker is available when
     * the connected Rime account does not actually expose it.
     */
    const catalog = await fetchRimeCatalog();

    if (catalog.reachable) {
      /*
       * If the requested speaker isn't available, use the first speaker
       * actually returned by the connected catalogue.
       *
       * This avoids using stale/invented speaker IDs.
       */
      if (speaker && !catalog.speakers.includes(speaker)) {
        categoryAvailable = false;

        availabilityNote =
          `UNAVAILABLE WITH CURRENT RIME CONFIGURATION — "${speaker}" is not in the connected Rime catalogue.`;

        speaker = catalog.speakers[0] ?? speaker;
      }

      /*
       * If the category doesn't specify a speaker at all, use the first
       * speaker from the live catalogue.
       */
      if (!speaker && catalog.speakers.length > 0) {
        speaker = catalog.speakers[0]!;
      }
    } else if (category.providerDependent) {
      categoryAvailable = false;

      availabilityNote =
        "UNAVAILABLE WITH CURRENT RIME CONFIGURATION — custom/cloned voices depend on the connected Rime account.";
    }

    /*
     * Rime is still the primary speech path.
     *
     * synthesizeSpeech() is responsible for:
     * - calling Rime
     * - returning Base64 audio
     * - disclosed fallback handling
     */
    const result = await synthesizeSpeech({
      text: data.text,
      speaker,
      language: data.language,
      speed: data.speed,
      fallbackVoice: category.fallbackVoice,
      ...(category.voiceInstructions
        ? {
            voiceInstructions: category.voiceInstructions,
          }
        : {}),
    });

    return {
      ...result,
      categoryAvailable,
      availabilityNote,
    };
  });

/* -------------------------------------------------------------------------- */
/* RIME STATUS                                                               */
/* -------------------------------------------------------------------------- */

export const getRimeStatus = createServerFn({
  method: "GET",
}).handler(async () => {
  const {
    readRimeConfig,
    fetchRimeCatalog,
  } = await import("./rime.server");

  const config = readRimeConfig();
  const catalog = await fetchRimeCatalog();

  return {
    configured: config.hasApiKey,

    endpoint: config.endpoint,
    model: config.model,
    speaker: config.speaker,
    language: config.language,
    region: config.region,
    audioFormat: config.audioFormat,
    transport: config.transport,

    catalogReachable: catalog.reachable,
    catalogSpeakerCount: catalog.speakers.length,
    catalogSpeakers: catalog.speakers.slice(0, 40),
    catalogError: catalog.error,

    verifiedAt: new Date().toISOString(),
  };
});

/* -------------------------------------------------------------------------- */
/* AGENT REPLY                                                               */
/* -------------------------------------------------------------------------- */

const agentInput = z.object({
  utterance: z.string().min(1).max(2000),

  language: z.string().default("en"),

  nickname: z.string().default("Remi"),

  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      }),
    )
    .max(12)
    .default([]),

  /*
   * Used by interruption/recovery logic.
   *
   * If a user interrupts an older request, the latest request becomes
   * authoritative.
   */
  supersedes: z.string().nullable().default(null),
});

/**
 * LLM turn.
 *
 * The response is intentionally short and spoken-language friendly.
 */
export const agentReply = createServerFn({
  method: "POST",
})
  .validator((data: unknown) => agentInput.parse(data))
  .handler(async ({ data }) => {
    const key = process.env["LOVABLE_API_KEY"];

    if (!key) {
      throw new Error(
        "The assistant model is not configured.",
      );
    }

    const language = getLanguage(data.language);

    const system = [
      `You are ${data.nickname}, the voice of RimeFlow — a realtime voice assistant.`,

      `Reply in ${language.label} only.`,

      `Keep replies under 45 spoken words, warm and natural.`,

      `You are being spoken aloud: no markdown, no lists, no emoji, no stage directions.`,

      data.supersedes
        ? `The user just interrupted and replaced their previous request ("${data.supersedes}"). Acknowledge the change briefly and answer only the NEW request.`
        : "",

      `If the user asks for a booking or search, describe what you found in one or two sentences.`,
    ]
      .filter(Boolean)
      .join(" ");

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",

        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          model: "google/gemini-3.7-flash",

          messages: [
            {
              role: "system",
              content: system,
            },

            ...data.history,

            {
              role: "user",
              content: data.utterance,
            },
          ],
        }),
      },
    );

    if (!response.ok) {
      const detail = await response
        .text()
        .catch(() => "");

      if (response.status === 429) {
        throw new Error(
          "The assistant is rate limited. Please try again shortly.",
        );
      }

      if (response.status === 402) {
        throw new Error(
          "AI credits are exhausted for this workspace.",
        );
      }

      throw new Error(
        `Assistant model failed: ${response.status} ${detail.slice(
          0,
          160,
        )}`,
      );
    }

    const payload = (await response.json()) as {
      choices?: {
        message?: {
          content?: string;
        };
      }[];
    };

    const text =
      payload.choices?.[0]?.message?.content?.trim();

    if (!text) {
      throw new Error(
        "The assistant returned an empty reply.",
      );
    }

    return {
      text,
      language: language.code,
    };
  });

/* -------------------------------------------------------------------------- */
/* DELAYED TOOL                                                               */
/* -------------------------------------------------------------------------- */

const toolInput = z.object({
  query: z.string().min(1).max(500),

  delayMs: z
    .number()
    .min(0)
    .max(30000)
    .default(DEFAULT_TOOL_DELAY_MS),
});

/**
 * Deterministic delayed search tool.
 *
 * The real server-side delay is intentional because the hackathon
 * interruption test needs genuine late-arriving work.
 */
export const runStayLookup = createServerFn({
  method: "POST",
})
  .validator((data: unknown) => toolInput.parse(data))
  .handler(async ({ data }) => {
    const started = Date.now();

    await new Promise<void>((resolve) => {
      setTimeout(resolve, data.delayMs);
    });

    return {
      query: data.query,

      results: [
        {
          name: `${data.query} — Option A`,
          price: 6400,
          rating: 4.6,
        },

        {
          name: `${data.query} — Option B`,
          price: 8900,
          rating: 4.8,
        },
      ],

      durationMs: Date.now() - started,

      completedAt: new Date().toISOString(),
    };
  });

/* -------------------------------------------------------------------------- */
/* SERVER-SIDE SPEECH-TO-TEXT                                                */
/* -------------------------------------------------------------------------- */

const transcribeInput = z.object({
  audioBase64: z.string().min(32),

  mimeType: z
    .string()
    .default("audio/wav"),

  language: z
    .string()
    .default("en"),
});

/**
 * Server-side STT used when browser SpeechRecognition isn't available.
 */
export const transcribeAudio = createServerFn({
  method: "POST",
})
  .validator((data: unknown) =>
    transcribeInput.parse(data),
  )
  .handler(async ({ data }) => {
    const key = process.env["LOVABLE_API_KEY"];

    if (!key) {
      throw new Error(
        "Speech recognition is not configured.",
      );
    }

    const language = getLanguage(data.language);

    /*
     * Decode Base64 recording.
     */
    const binary = atob(data.audioBase64);

    const bytes = new Uint8Array(
      binary.length,
    );

    for (
      let i = 0;
      i < binary.length;
      i += 1
    ) {
      bytes[i] = binary.charCodeAt(i);
    }

    /*
     * Ignore extremely small/empty recordings.
     */
    if (bytes.length < 2048) {
      return {
        text: "",
        empty: true,
      };
    }

    /*
     * Determine the file extension from the MIME type.
     */
    const ext = data.mimeType.includes("wav")
      ? "wav"
      : data.mimeType.includes("mp4")
        ? "mp4"
        : "webm";

    const form = new FormData();

    form.append(
      "model",
      "openai/gpt-4o-mini-transcribe",
    );

    form.append(
      "file",
      new Blob(
        [bytes],
        {
          type: data.mimeType,
        },
      ),
      `recording.${ext}`,
    );

    form.append(
      "language",
      language.sttCode,
    );

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/audio/transcriptions",
      {
        method: "POST",

        headers: {
          Authorization: `Bearer ${key}`,
        },

        body: form,
      },
    );

    if (!response.ok) {
      const detail = await response
        .text()
        .catch(() => "");

      throw new Error(
        `Transcription failed: ${response.status} ${detail.slice(
          0,
          160,
        )}`,
      );
    }

    const payload = (await response.json()) as {
      text?: string;
    };

    return {
      text: payload.text?.trim() ?? "",
      empty: false,
    };
  });