import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { DEFAULT_TOOL_DELAY_MS, getLanguage, getVoiceCategory } from "./config";

/**
 * Server boundary for the voice pipeline: Rime TTS, agent replies, tool work and
 * server-side STT. Every secret is read inside the handler and never returned.
 */

const speakInput = z.object({
  text: z.string().min(1).max(2000),
  voiceCategory: z.string().default("conversational"),
  language: z.string().default("en"),
  speed: z.number().min(0.5).max(2).default(1),
});

export const speak = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => speakInput.parse(data))
  .handler(async ({ data }) => {
    const { synthesizeSpeech, fetchRimeCatalog } = await import("./rime.server");
    const category = getVoiceCategory(data.voiceCategory);

    let speaker = category.requestedRimeSpeaker;
    let categoryAvailable = true;
    let availabilityNote: string | null = null;

    const catalog = await fetchRimeCatalog();
    if (catalog.reachable) {
      if (!catalog.speakers.includes(speaker)) {
        categoryAvailable = false;
        availabilityNote = `UNAVAILABLE WITH CURRENT RIME CONFIGURATION — "${speaker}" is not in the connected Rime catalogue.`;
        speaker = catalog.speakers[0] ?? speaker;
      }
    } else if (category.providerDependent) {
      categoryAvailable = false;
      availabilityNote =
        "UNAVAILABLE WITH CURRENT RIME CONFIGURATION — custom/cloned voices depend on the connected Rime account.";
    }

    const result = await synthesizeSpeech({
      text: data.text,
      speaker,
      language: data.language,
      speed: data.speed,
      fallbackVoice: category.fallbackVoice,
      voiceInstructions: category.voiceInstructions,
    });

    return { ...result, categoryAvailable, availabilityNote };
  });

export const getRimeStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { readRimeConfig, fetchRimeCatalog } = await import("./rime.server");
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

const agentInput = z.object({
  utterance: z.string().min(1).max(2000),
  language: z.string().default("en"),
  nickname: z.string().default("Remi"),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .max(12)
    .default([]),
  supersedes: z.string().nullable().default(null),
});

/** LLM turn. The reply is written to be spoken, never read. */
export const agentReply = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => agentInput.parse(data))
  .handler(async ({ data }) => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("The assistant model is not configured.");
    const language = getLanguage(data.language);

    const system = [
      `You are ${data.nickname}, the voice of RimeFlow — a realtime voice assistant.`,
      `Reply in ${language.label} only. Keep replies under 45 spoken words, warm and natural.`,
      `You are being spoken aloud: no markdown, no lists, no emoji, no stage directions.`,
      data.supersedes
        ? `The user just interrupted and replaced their previous request ("${data.supersedes}"). Acknowledge the change briefly and answer only the NEW request.`
        : "",
      `If the user asks for a booking or search, describe what you found in one or two sentences.`,
    ]
      .filter(Boolean)
      .join(" ");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3.7-flash",
        messages: [
          { role: "system", content: system },
          ...data.history,
          { role: "user", content: data.utterance },
        ],
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      if (response.status === 429) throw new Error("The assistant is rate limited. Please try again shortly.");
      if (response.status === 402) throw new Error("AI credits are exhausted for this workspace.");
      throw new Error(`Assistant model failed: ${response.status} ${detail.slice(0, 160)}`);
    }

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = payload.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("The assistant returned an empty reply.");
    return { text, language: language.code };
  });

const toolInput = z.object({
  query: z.string().min(1).max(500),
  delayMs: z.number().min(0).max(30000).default(DEFAULT_TOOL_DELAY_MS),
});

/**
 * Deterministic "search stay" tool. The delay is a real wall-clock delay on the
 * server so the stress test exercises genuine late-arriving work.
 */
export const runStayLookup = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => toolInput.parse(data))
  .handler(async ({ data }) => {
    const started = Date.now();
    await new Promise((resolve) => setTimeout(resolve, data.delayMs));
    return {
      query: data.query,
      results: [
        { name: `${data.query} — Option A`, price: 6400, rating: 4.6 },
        { name: `${data.query} — Option B`, price: 8900, rating: 4.8 },
      ],
      durationMs: Date.now() - started,
      completedAt: new Date().toISOString(),
    };
  });

const transcribeInput = z.object({
  audioBase64: z.string().min(32),
  mimeType: z.string().default("audio/wav"),
  language: z.string().default("en"),
});

/** Server-side streaming-model STT used when the browser has no SpeechRecognition. */
export const transcribeAudio = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => transcribeInput.parse(data))
  .handler(async ({ data }) => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("Speech recognition is not configured.");
    const language = getLanguage(data.language);

    const binary = atob(data.audioBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    if (bytes.length < 2048) return { text: "", empty: true };

    const ext = data.mimeType.includes("wav") ? "wav" : data.mimeType.includes("mp4") ? "mp4" : "webm";
    const form = new FormData();
    form.append("model", "openai/gpt-4o-mini-transcribe");
    form.append("file", new Blob([bytes], { type: data.mimeType }), `recording.${ext}`);
    form.append("language", language.sttCode);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Transcription failed: ${response.status} ${detail.slice(0, 160)}`);
    }
    const payload = (await response.json()) as { text?: string };
    return { text: payload.text?.trim() ?? "", empty: false };
  });
