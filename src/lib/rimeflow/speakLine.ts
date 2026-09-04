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
 * One-shot spoken line for welcome / confirmation / voice-preview moments.
 * Goes through the same Rime-first server path as conversation audio.
 */
export async function speakLine(
  text: string,
  options: { language?: LanguageCode; voiceCategory?: string; speed?: number } = {},
): Promise<SpokenLineResult> {
  const result = await speak({
    data: {
      text,
      language: options.language ?? "en",
      voiceCategory: options.voiceCategory ?? "female",
      speed: options.speed ?? 1,
    },
  });
  await player.play(result.audioBase64, result.mimeType);
  return { provider: result.provider, speaker: result.speaker, fallbackReason: result.fallbackReason };
}

export function stopSpokenLine(): void {
  player.stop();
}
