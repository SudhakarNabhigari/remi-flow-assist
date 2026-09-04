import { AudioPlayback } from "./audio";
import type { LanguageCode } from "./config";
import { speak } from "./voice.functions";

const player = new AudioPlayback();

export interface SpokenLineResult {
  provider: "rime" | "fallback";
  speaker: string;
  fallbackReason: string | null;
  mimeType: string;
}

export function unlockSpokenLine(): void {
  player.unlock();
}

export async function speakLine(
  text: string,
  options: {
    language?: LanguageCode;
    voiceCategory?: string;
    speed?: number;
  } = {},
): Promise<SpokenLineResult> {
  const cleanText = text.trim();

  if (!cleanText) {
    throw new Error("Cannot speak an empty line.");
  }

  /*
   * Important:
   * stop any previous welcome / preview / response before starting
   * another spoken line.
   */
  player.stop();

  const result = await speak({
    data: {
      text: cleanText,
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
    result.mimeType || "audio/mpeg",
  );

  return {
    provider: result.provider,
    speaker: result.speaker,
    fallbackReason: result.fallbackReason,
    mimeType: result.mimeType || "audio/mpeg",
  };
}

export function stopSpokenLine(): void {
  player.stop();
}