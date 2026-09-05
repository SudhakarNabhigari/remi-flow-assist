/**
 * Server-side Rime service.
 *
 * IMPORTANT:
 * - Rime credentials NEVER leave this server boundary.
 * - Rime is the PRIMARY spoken-output provider.
 * - Browser/secondary TTS is used only as a disclosed resilience fallback.
 * - Speaker/model defaults are real Rime configuration values.
 */

export interface RimeConfig {
  endpoint: string;
  model: string;
  speaker: string;
  language: string;
  region: string;
  audioFormat: string;
  transport: string;
  hasApiKey: boolean;
}

/**
 * Reads Rime configuration from server environment variables.
 *
 * Defaults:
 *   model   = arcana
 *   speaker = celeste
 *
 * These are used only when the corresponding environment variables
 * are not supplied.
 */
export function readRimeConfig(): RimeConfig {
  return {
    endpoint:
      process.env["RIME_ENDPOINT"] ||
      "https://users.rime.ai/v1/rime-tts",

    model:
      process.env["RIME_MODEL"] ||
      "arcana",

    speaker:
      process.env["RIME_SPEAKER"] ||
      "celeste",

    language:
      process.env["RIME_LANGUAGE"] ||
      "eng",

    region:
      process.env["RIME_REGION"] ||
      "global",

    audioFormat:
      process.env["RIME_AUDIO_FORMAT"] ||
      "mp3",

    transport:
      process.env["RIME_TRANSPORT"] ||
      "https",

    hasApiKey: Boolean(process.env["RIME_API_KEY"]),
  };
}

export interface SynthesisResult {
  audioBase64: string;
  mimeType: string;

  /**
   * "rime" = primary judged path
   * "fallback" = resilience-only path
   */
  provider: "rime" | "fallback";

  speaker: string;
  model: string;

  /**
   * Null when Rime successfully generated audio.
   */
  fallbackReason: string | null;

  latencyMs: number;
}

/* -------------------------------------------------------------------------- */
/* Audio configuration                                                        */
/* -------------------------------------------------------------------------- */

const MIME_BY_FORMAT: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  pcm: "audio/wav",
};

/**
 * Application language -> Rime language code.
 *
 * English and Hindi are currently supported by the current Arcana v3
 * multilingual material. Telugu support must be verified against the
 * connected Rime account/model before claiming Rime-native Telugu output.
 */
const RIME_LANG: Record<string, string> = {
  en: "eng",
  hi: "hin",
  te: "tel",
};

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);

  let binary = "";

  const chunk = 0x8000;

  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(
      ...bytes.subarray(i, i + chunk),
    );
  }

  return btoa(binary);
}

/* -------------------------------------------------------------------------- */
/* Rime TTS                                                                   */
/* -------------------------------------------------------------------------- */

export async function synthesizeSpeech(opts: {
  text: string;
  speaker?: string;
  language?: string;
  speed?: number;
  fallbackVoice?: string;
  voiceInstructions?: string;
  signal?: AbortSignal;
}): Promise<SynthesisResult> {
  const config = readRimeConfig();

  const started = Date.now();

  const text = opts.text?.trim();

  if (!text) {
    throw new Error("Cannot synthesize empty text.");
  }

  /*
   * Priority:
   *
   * 1. Explicit speaker supplied by the caller.
   * 2. RIME_SPEAKER from environment.
   * 3. Verified default: celeste.
   */
  const speaker =
    opts.speaker?.trim() ||
    config.speaker.trim() ||
    "celeste";

  /*
   * Convert application language to Rime language.
   *
   * If the caller already provides a Rime language code such as "eng",
   * preserve it.
   */
  const requestedLanguage = opts.language?.trim() || "";

  const language =
    RIME_LANG[requestedLanguage] ||
    requestedLanguage ||
    config.language;

  const apiKey = process.env["RIME_API_KEY"];

  /*
   * The current Rime configuration does not provide native Telugu.
   * Route Telugu directly to the disclosed Gemini TTS fallback instead of
   * intentionally making a request that is expected to return HTTP 400.
   */
  if (language === "tel") {
    return await fallbackSpeech(
      opts,
      "Rime native Telugu is unavailable with the current Rime configuration.",
      started,
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Validate server configuration                                          */
  /* ---------------------------------------------------------------------- */

  if (!apiKey) {
    return await fallbackSpeech(
      opts,
      "RIME_API_KEY is not configured on the server.",
      started,
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Rime primary path                                                      */
  /* ---------------------------------------------------------------------- */

  try {
    const response = await fetch(config.endpoint, {
      method: "POST",

      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",

        Accept:
          MIME_BY_FORMAT[config.audioFormat] ??
          "audio/mpeg",
      },

      body: JSON.stringify({
        text,

        speaker,

        modelId: config.model,

        lang: language,

        audioFormat: config.audioFormat,

        samplingRate: 24000,

        speedAlpha:
          typeof opts.speed === "number"
            ? opts.speed
            : 1,

        reduceLatency: true,
      }),

      ...(opts.signal ? { signal: opts.signal } : {}),
    });

    /* -------------------------------------------------------------------- */
    /* Successful Rime response                                             */
    /* -------------------------------------------------------------------- */

    if (response.ok) {
      const buffer = await response.arrayBuffer();

      if (buffer.byteLength > 0) {
        return {
          audioBase64: toBase64(buffer),

          mimeType:
            MIME_BY_FORMAT[config.audioFormat] ??
            "audio/mpeg",

          provider: "rime",

          speaker,

          model: config.model,

          fallbackReason: null,

          latencyMs: Date.now() - started,
        };
      }

      return await fallbackSpeech(
        opts,
        "Rime returned an empty audio response.",
        started,
      );
    }

    /* -------------------------------------------------------------------- */
    /* Rime returned an error                                               */
    /* -------------------------------------------------------------------- */

    const detail = await response
      .text()
      .catch(() => "");

    const cleanDetail = detail
      ? detail.slice(0, 300)
      : "No error body returned.";

    return await fallbackSpeech(
      opts,
      `Rime returned HTTP ${response.status}: ${cleanDetail}`,
      started,
    );
  } catch (error) {
    /*
     * IMPORTANT:
     * If the current request was intentionally interrupted/cancelled,
     * propagate the abort rather than converting it into fallback speech.
     */
    if (opts.signal?.aborted) {
      throw error;
    }

    const message =
      error instanceof Error
        ? error.message
        : String(error);

    return await fallbackSpeech(
      opts,
      `Rime request failed: ${message}`,
      started,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Resilience-only fallback                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Fallback TTS exists ONLY for resilience.
 *
 * The caller receives:
 *
 * provider: "fallback"
 *
 * plus fallbackReason so the UI can disclose that Rime was unavailable.
 */
async function fallbackSpeech(
  opts: {
    text: string;
    language?: string;
    speed?: number;
    fallbackVoice?: string;
    voiceInstructions?: string;
    signal?: AbortSignal;
  },
  reason: string,
  started: number,
): Promise<SynthesisResult> {
  /*
   * Telugu:
   *
   * The connected Rime configuration currently does not support native
   * Telugu output (`tel`). Do not waste a request on a known-invalid Rime
   * call. Use Gemini 3.1 Flash TTS as the disclosed resilience fallback.
   *
   * Rime remains the PRIMARY provider for the supported Rime path.
   */
  if (opts.language === "te" || opts.language === "tel") {
    const geminiKey = process.env["GEMINI_API_KEY"];

    if (geminiKey) {
      try {
        const response = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/interactions",
          {
            method: "POST",
            headers: {
              "x-goog-api-key": geminiKey,
              "Content-Type": "application/json",
              "Accept": "application/json",
            },
            body: JSON.stringify({
              model: "gemini-3.1-flash-tts-preview",
              input: [
                "Speak naturally and clearly in Telugu.",
                "Preserve Telugu words and code-switched words exactly.",
                "Do not translate the user's text.",
                `Text: ${opts.text}`,
              ].join("\n"),
              response_format: {
                type: "audio",
              },
              generation_config: {
                speech_config: [
                  {
                    voice: "Kore",
                  },
                ],
              },
            }),
            ...(opts.signal ? { signal: opts.signal } : {}),
          },
        );

        if (!response.ok) {
          const detail = await response.text().catch(() => "");
          throw new Error(
            `Gemini Telugu TTS returned HTTP ${response.status}${
              detail ? `: ${detail.slice(0, 300)}` : ""
            }`,
          );
        }

        const payload = (await response.json()) as {
          output_audio?: {
            data?: unknown;
          };
          outputAudio?: {
            data?: unknown;
          };
          output?: Array<{
            type?: unknown;
            data?: unknown;
          }>;
        };

        /*
         * Current Interactions API response uses output_audio.data.
         * Keep camelCase and output[] compatibility so a minor SDK/API
         * serialization difference does not break the fallback.
         */
        const pcmBase64 =
          typeof payload.output_audio?.data === "string"
            ? payload.output_audio.data
            : typeof payload.outputAudio?.data === "string"
              ? payload.outputAudio.data
              : payload.output?.find(
                  (item) =>
                    item.type === "audio" &&
                    typeof item.data === "string",
                )?.data as string | undefined;

        if (!pcmBase64) {
          throw new Error(
            "Gemini Telugu TTS returned no audio data.",
          );
        }

        const wavBase64 = pcm16Base64ToWavBase64(
          pcmBase64,
          24000,
          1,
          16,
        );

        return {
          audioBase64: wavBase64,
          mimeType: "audio/wav",
          provider: "fallback",
          speaker: "gemini-3.1-flash-tts-preview:Kore",
          model: "gemini-3.1-flash-tts-preview",
          fallbackReason: reason,
          latencyMs: Date.now() - started,
        };
      } catch (error) {
        /*
         * Never convert an intentional interruption into another speech
         * request. This preserves the hard interruption/fencing behavior.
         */
        if (opts.signal?.aborted) {
          throw error;
        }

        console.warn(
          "Gemini Telugu fallback failed:",
          error instanceof Error
            ? error.message
            : String(error),
        );
      }
    }
  }

  /*
   * Existing secondary fallback.
   * This remains available when LOVABLE_API_KEY is configured.
   */
  const key = process.env["LOVABLE_API_KEY"];

  if (!key) {
    throw new Error(
      `Rime unavailable (${reason}) and no fallback voice is configured.`,
    );
  }

  const fallbackModel = "openai/gpt-4o-mini-tts";

  const response = await fetch(
    "https://ai.gateway.lovable.dev/v1/audio/speech",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: fallbackModel,
        input: opts.text,
        voice:
          opts.fallbackVoice ||
          "alloy",
        ...(opts.voiceInstructions
          ? {
              instructions: opts.voiceInstructions,
            }
          : {}),
        speed:
          typeof opts.speed === "number"
            ? opts.speed
            : 1,
        response_format: "mp3",
        stream_format: "audio",
      }),
      ...(opts.signal ? { signal: opts.signal } : {}),
    },
  );

  if (!response.ok) {
    const detail = await response
      .text()
      .catch(() => "");

    throw new Error(
      `Fallback voice failed: HTTP ${response.status} ${
        detail.slice(0, 300)
      }`,
    );
  }

  const buffer = await response.arrayBuffer();

  if (buffer.byteLength === 0) {
    throw new Error(
      "Fallback voice returned empty audio.",
    );
  }

  return {
    audioBase64: toBase64(buffer),

    mimeType: "audio/mpeg",

    provider: "fallback",

    speaker:
      `${fallbackModel}:${
        opts.fallbackVoice || "alloy"
      }`,

    model: fallbackModel,

    fallbackReason: reason,

    latencyMs: Date.now() - started,
  };
}

/**
 * Gemini 3.1 Flash TTS returns raw 24 kHz, 16-bit, mono PCM audio.
 * The browser AudioContext expects a normal audio container, so wrap the
 * PCM bytes in a WAV header before returning them to the client.
 */
function pcm16Base64ToWavBase64(
  pcmBase64: string,
  sampleRate: number,
  channels: number,
  bitsPerSample: number,
): string {
  const binary = atob(pcmBase64);
  const pcm = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    pcm[i] = binary.charCodeAt(i);
  }

  const headerSize = 44;
  const buffer = new ArrayBuffer(
    headerSize + pcm.length,
  );
  const view = new DataView(buffer);

  const writeAscii = (
    offset: number,
    value: string,
  ) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(
        offset + i,
        value.charCodeAt(i),
      );
    }
  };

  const bytesPerSample = bitsPerSample / 8;
  const byteRate =
    sampleRate *
    channels *
    bytesPerSample;
  const blockAlign =
    channels * bytesPerSample;

  writeAscii(0, "RIFF");
  view.setUint32(
    4,
    36 + pcm.length,
    true,
  );
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(
    22,
    channels,
    true,
  );
  view.setUint32(
    24,
    sampleRate,
    true,
  );
  view.setUint32(
    28,
    byteRate,
    true,
  );
  view.setUint16(
    32,
    blockAlign,
    true,
  );
  view.setUint16(
    34,
    bitsPerSample,
    true,
  );
  writeAscii(36, "data");
  view.setUint32(
    40,
    pcm.length,
    true,
  );

  new Uint8Array(
    buffer,
    headerSize,
  ).set(pcm);

  return toBase64(buffer);
}

/* -------------------------------------------------------------------------- */
/* Rime catalogue                                                             */
/* -------------------------------------------------------------------------- */

export interface RimeCatalogResult {
  reachable: boolean;

  speakers: string[];

  error: string | null;
}

/**
 * Verifies the live Rime voice catalogue.
 *
 * We NEVER assume that every voice exists for every account/model.
 */
export async function fetchRimeCatalog(): Promise<RimeCatalogResult> {
  /*
   * Rime's public voice_details.json is currently a direct array of voice
   * objects.  The important field is `speaker`, not `name`.
   *
   * We intentionally do NOT require RIME_API_KEY here because this catalogue
   * endpoint is public.  The API key is still required for actual TTS calls.
   */
  try {
    const response = await fetch(
      "https://users.rime.ai/data/voices/voice_details.json",
      {
        headers: {
          Accept: "application/json",
        },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => "");

      return {
        reachable: false,
        speakers: [],
        error:
          `Catalogue request returned HTTP ${response.status}` +
          (detail ? `: ${detail.slice(0, 200)}` : ""),
      };
    }

    const payload = (await response.json()) as unknown;
    const speakers: string[] = [];

    /*
     * Current Rime format:
     *
     * [
     *   {
     *     "speaker": "celeste",
     *     "modelId": "arcana",
     *     "lang": "eng"
     *   }
     * ]
     */
    if (Array.isArray(payload)) {
      for (const entry of payload) {
        if (typeof entry === "string") {
          speakers.push(entry);
          continue;
        }

        if (entry && typeof entry === "object") {
          const item = entry as {
            speaker?: unknown;
            name?: unknown;
          };

          /*
           * `speaker` is the canonical Rime field.
           * `name` is retained only for compatibility with older formats.
           */
          if (typeof item.speaker === "string") {
            speakers.push(item.speaker);
          } else if (typeof item.name === "string") {
            speakers.push(item.name);
          }
        }
      }
    }

    /*
     * Compatibility with catalogue responses wrapped in an object:
     * { voices: [...] } or { speakers: [...] }
     */
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      const objectPayload = payload as {
        voices?: unknown;
        speakers?: unknown;
      };

      const possibleArrays = [
        objectPayload.voices,
        objectPayload.speakers,
      ];

      for (const candidate of possibleArrays) {
        if (!Array.isArray(candidate)) {
          continue;
        }

        for (const entry of candidate) {
          if (typeof entry === "string") {
            speakers.push(entry);
            continue;
          }

          if (entry && typeof entry === "object") {
            const item = entry as {
              speaker?: unknown;
              name?: unknown;
            };

            if (typeof item.speaker === "string") {
              speakers.push(item.speaker);
            } else if (typeof item.name === "string") {
              speakers.push(item.name);
            }
          }
        }
      }
    }

    const uniqueSpeakers = [
      ...new Set(
        speakers
          .map((speaker) => speaker.trim())
          .filter(Boolean),
      ),
    ];

    return {
      reachable: true,
      speakers: uniqueSpeakers,
      error: null,
    };
  } catch (error) {
    return {
      reachable: false,
      speakers: [],
      error:
        error instanceof Error
          ? error.message
          : String(error),
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Configuration diagnostics                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Returns a safe diagnostic object.
 *
 * NEVER returns the API key.
 */
export function getRimeDiagnostics() {
  const config = readRimeConfig();

  return {
    endpoint: config.endpoint,

    model: config.model,

    speaker: config.speaker,

    language: config.language,

    region: config.region,

    audioFormat: config.audioFormat,

    transport: config.transport,

    hasApiKey: config.hasApiKey,
  };
}