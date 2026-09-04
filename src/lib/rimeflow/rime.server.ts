/**
 * Server-side Rime service. Credentials never leave this boundary.
 *
 * Rime is the PRIMARY spoken output path: every assistant reply, the welcome
 * line, the nickname confirmation and the voice preview all call synthesize()
 * first. A fallback voice exists only for resilience and is always reported
 * back to the UI so it can be disclosed to the user.
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

export function readRimeConfig(): RimeConfig {
  return {
    endpoint: process.env["RIME_ENDPOINT"] || "https://users.rime.ai/v1/rime-tts",
    model: process.env["RIME_MODEL"] || "mistv2",
    speaker: process.env["RIME_SPEAKER"] || "luna",
    language: process.env["RIME_LANGUAGE"] || "eng",
    region: process.env["RIME_REGION"] || "global",
    audioFormat: process.env["RIME_AUDIO_FORMAT"] || "mp3",
    transport: process.env["RIME_TRANSPORT"] || "https",
    hasApiKey: Boolean(process.env["RIME_API_KEY"]),
  };
}

export interface SynthesisResult {
  audioBase64: string;
  mimeType: string;
  provider: "rime" | "fallback";
  speaker: string;
  model: string;
  fallbackReason: string | null;
  latencyMs: number;
}

const MIME_BY_FORMAT: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  pcm: "audio/wav",
};

/** Rime language codes for the speech pipeline's supported languages. */
const RIME_LANG: Record<string, string> = { en: "eng", te: "tel", hi: "hin" };

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

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
  const speaker = opts.speaker?.trim() || config.speaker;
  const language = RIME_LANG[opts.language ?? "en"] ?? config.language;
  const apiKey = process.env["RIME_API_KEY"];

  if (apiKey) {
    try {
      const response = await fetch(config.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: MIME_BY_FORMAT[config.audioFormat] ?? "audio/mpeg",
        },
        body: JSON.stringify({
          text: opts.text,
          speaker,
          modelId: config.model,
          lang: language,
          audioFormat: config.audioFormat,
          samplingRate: 24000,
          speedAlpha: opts.speed ?? 1,
          reduceLatency: true,
        }),
        signal: opts.signal ?? null,
      });

      if (response.ok) {
        const buffer = await response.arrayBuffer();
        if (buffer.byteLength > 0) {
          return {
            audioBase64: toBase64(buffer),
            mimeType: MIME_BY_FORMAT[config.audioFormat] ?? "audio/mpeg",
            provider: "rime",
            speaker,
            model: config.model,
            fallbackReason: null,
            latencyMs: Date.now() - started,
          };
        }
      }
      const detail = await response.text().catch(() => "");
      return await fallbackSpeech(
        opts,
        `Rime returned ${response.status}${detail ? `: ${detail.slice(0, 160)}` : ""}`,
        started,
      );
    } catch (error) {
      if (opts.signal?.aborted) throw error;
      return await fallbackSpeech(opts, `Rime request failed: ${(error as Error).message}`, started);
    }
  }

  return await fallbackSpeech(opts, "RIME_API_KEY is not configured on the server", started);
}

/**
 * Resilience-only fallback voice. Never silent: the caller receives
 * provider:"fallback" plus the reason and must surface it in the UI.
 */
async function fallbackSpeech(
  opts: { text: string; speed?: number; fallbackVoice?: string; voiceInstructions?: string; signal?: AbortSignal },
  reason: string,
  started: number,
): Promise<SynthesisResult> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) {
    throw new Error(`Rime unavailable (${reason}) and no fallback voice is configured.`);
  }
  const response = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini-tts",
      input: opts.text,
      voice: opts.fallbackVoice || "alloy",
      ...(opts.voiceInstructions ? { instructions: opts.voiceInstructions } : {}),
      speed: opts.speed ?? 1,
      response_format: "mp3",
      stream_format: "audio",
    }),
    signal: opts.signal ?? null,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Fallback voice failed: ${response.status} ${detail.slice(0, 160)}`);
  }
  const buffer = await response.arrayBuffer();
  return {
    audioBase64: toBase64(buffer),
    mimeType: "audio/mpeg",
    provider: "fallback",
    speaker: `openai/gpt-4o-mini-tts:${opts.fallbackVoice || "alloy"}`,
    model: "openai/gpt-4o-mini-tts",
    fallbackReason: reason,
    latencyMs: Date.now() - started,
  };
}

export interface RimeCatalogResult {
  reachable: boolean;
  speakers: string[];
  error: string | null;
}

/** Verifies the live Rime catalogue so voice categories are never faked. */
export async function fetchRimeCatalog(): Promise<RimeCatalogResult> {
  const apiKey = process.env["RIME_API_KEY"];
  if (!apiKey) return { reachable: false, speakers: [], error: "RIME_API_KEY is not configured" };
  try {
    const response = await fetch("https://users.rime.ai/data/voices/voice_details.json", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) {
      return { reachable: false, speakers: [], error: `Catalogue request returned ${response.status}` };
    }
    const payload = (await response.json()) as unknown;
    const speakers = Array.isArray(payload)
      ? payload
          .map((entry) => (entry as { name?: string }).name)
          .filter((name): name is string => typeof name === "string")
      : [];
    return { reachable: true, speakers, error: null };
  } catch (error) {
    return { reachable: false, speakers: [], error: (error as Error).message };
  }
}
