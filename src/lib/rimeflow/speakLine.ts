import { AudioPlayback } from "./audio";
import type { LanguageCode } from "./config";
import { speak } from "./voice.functions";

const player = new AudioPlayback();

export interface SpokenLineResult {
  provider: "rime" | "fallback";
  speaker: string;
  fallbackReason: string | null;
}

/**
 * Unlock browser audio.
 *
 * IMPORTANT:
 * Call this directly inside a user interaction such as:
 * - Login
 * - Save nickname
 * - Voice preview
 */
export function unlockSpokenLine(): void {
  player.unlock();
}

/**
 * Speak a one-shot system message.
 *
 * Used for:
 * - Welcome message
 * - Nickname confirmation
 * - Voice preview
 *
 * Rime remains the primary speech provider.
 */
export async function speakLine(
  text: string,
  options: {
    language?: LanguageCode;
    voiceCategory?: string;
    speed?: number;
  } = {},
): Promise<SpokenLineResult> {
  if (!text.trim()) {
    throw new Error("Cannot speak an empty line.");
  }

  const result = await speak({
    data: {
      text,
      language: options.language ?? "en",
      voiceCategory: options.voiceCategory ?? "female",
      speed: options.speed ?? 1,
    },
  });

  if (!result.audioBase64) {
    throw new Error("Speech service returned no audio.");
  }

  await player.play(
    result.audioBase64,
    result.mimeType || "audio/wav",
  );

  return {
    provider: result.provider,
    speaker: result.speaker,
    fallbackReason: result.fallbackReason,
  };
}

/**
 * Stop current spoken line immediately.
 */
export function stopSpokenLine(): void {
  player.stop();
}