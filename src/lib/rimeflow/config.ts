/**
 * RimeFlow shared, client-safe configuration.
 * No secrets here — the Rime credentials live only in server env vars.
 */

export type LanguageCode = "en" | "te" | "hi";

export interface LanguageOption {
  code: LanguageCode;
  label: string;
  nativeLabel: string;
  /** BCP-47 tag used by browser SpeechRecognition + SpeechSynthesis. */
  bcp47: string;
  /** ISO-639-1 code passed to the server transcription model. */
  sttCode: string;
  sampleUtterance: string;
}

export const LANGUAGES: LanguageOption[] = [
  {
    code: "en",
    label: "English",
    nativeLabel: "English",
    bcp47: "en-IN",
    sttCode: "en",
    sampleUtterance: "I need a duplex villa in Goa tomorrow.",
  },
  {
    code: "te",
    label: "Telugu",
    nativeLabel: "తెలుగు",
    bcp47: "te-IN",
    sttCode: "te",
    sampleUtterance: "Goa lo repu duplex villa kavali.",
  },
  {
    code: "hi",
    label: "Hindi",
    nativeLabel: "हिन्दी",
    bcp47: "hi-IN",
    sttCode: "hi",
    sampleUtterance: "Mujhe Goa mein kal ek villa chahiye.",
  },
];

export function getLanguage(code: string): LanguageOption {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0]!;
}

export type VoiceCategoryId =
  | "conversational"
  | "expressive"
  | "informational"
  | "custom_cloned"
  | "character";

export interface VoiceCategory {
  id: VoiceCategoryId;
  label: string;
  description: string;
  /**
   * Rime speaker requested for this category. The actual availability is decided
   * server-side against the live Rime catalogue — never assumed here.
   */
  requestedRimeSpeaker: string;
  /** Provider-dependent: Rime does not expose voice cloning on the standard TTS API. */
  providerDependent?: boolean;
}

export const VOICE_CATEGORIES: VoiceCategory[] = [
  {
    id: "conversational",
    label: "Conversational AI Voice",
    description: "Natural, everyday speaking style. Best for normal back-and-forth conversation.",
    requestedRimeSpeaker: "luna",
  },
  {
    id: "expressive",
    label: "Expressive & Emotional AI Voice",
    description: "More emotion and energy. Good for storytelling and lively replies.",
    requestedRimeSpeaker: "celeste",
  },
  {
    id: "informational",
    label: "Informational & TTS Voice",
    description: "Clear, neutral narration. Best for reading out facts, lists and confirmations.",
    requestedRimeSpeaker: "orion",
  },
  {
    id: "custom_cloned",
    label: "Custom & Cloned AI Voice",
    description:
      "Provider-dependent. Only available when the configured Rime account exposes a custom or cloned speaker.",
    requestedRimeSpeaker: "custom",
    providerDependent: true,
  },
  {
    id: "character",
    label: "Non-Human & Character AI Voice",
    description: "Stylised, character-like delivery for playful or robotic personas.",
    requestedRimeSpeaker: "rainforest",
  },
];

export function getVoiceCategory(id: string): VoiceCategory {
  return VOICE_CATEGORIES.find((v) => v.id === id) ?? VOICE_CATEGORIES[0]!;
}

/** Deterministic delayed-tool duration used by the stress test (real wall-clock delay). */
export const DEFAULT_TOOL_DELAY_MS = 5000;

export const DEFAULT_NICKNAME = "Remi";
