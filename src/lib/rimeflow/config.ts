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

export type VoiceCategoryId = "female" | "male" | "child" | "robotic" | "custom_cloned";

export interface VoiceCategory {
  id: VoiceCategoryId;
  label: string;
  description: string;
  /** Short tag shown on the card. */
  badge: string;
  /**
   * Rime speaker requested for this category. The actual availability is decided
   * server-side against the live Rime catalogue — never assumed here.
   */
  requestedRimeSpeaker: string;
  /** Resilience-only fallback voice, used and disclosed when Rime is unavailable. */
  fallbackVoice: string;
  /** Delivery steering for the fallback voice. */
  voiceInstructions?: string;
  /** Line spoken by the preview button. */
  previewLine: string;
  /** Line spoken by the confirmation introduction. */
  introLine: string;
  /** Provider-dependent: Rime does not expose voice cloning on the standard TTS API. */
  providerDependent?: boolean;
}

export const VOICE_CATEGORIES: VoiceCategory[] = [
  {
    id: "female",
    label: "Female Voice",
    description: "Warm, natural female speaker. The default conversational voice.",
    badge: "Female",
    requestedRimeSpeaker: "luna",
    fallbackVoice: "shimmer",
    previewLine: "Hi, this is my female voice. Natural, warm and easy to listen to.",
    introLine: "Female voice selected. I am ready whenever you want to talk.",
  },
  {
    id: "male",
    label: "Male Voice",
    description: "Calm, confident male speaker. Great for clear narration and answers.",
    badge: "Male",
    requestedRimeSpeaker: "orion",
    fallbackVoice: "onyx",
    previewLine: "Hello, this is my male voice. Calm, clear and confident.",
    introLine: "Male voice selected. Let's get straight to work.",
  },
  {
    id: "child",
    label: "Child Voice",
    description: "Bright, playful younger-sounding voice for friendly, fun replies.",
    badge: "Child",
    requestedRimeSpeaker: "juniper",
    fallbackVoice: "coral",
    voiceInstructions: "Speak like a cheerful young child: bright, high pitched, playful and excited.",
    previewLine: "Hiii! This is my child voice. It's fun and super friendly!",
    introLine: "Yay! Child voice selected. Let's talk!",
  },
  {
    id: "robotic",
    label: "Robotic Voice",
    description: "Stylised machine-like delivery for a character or android persona.",
    badge: "Robotic",
    requestedRimeSpeaker: "rainforest",
    fallbackVoice: "echo",
    voiceInstructions: "Speak like a retro robot: flat, metallic, evenly clipped syllables, minimal emotion.",
    previewLine: "Voice module online. This is my robotic voice profile.",
    introLine: "Robotic voice engaged. Awaiting your command.",
  },
  {
    id: "custom_cloned",
    label: "Custom / Cloned Voice",
    description:
      "Provider-dependent. Only available when the connected Rime account exposes a custom or cloned speaker.",
    badge: "Custom",
    requestedRimeSpeaker: "custom",
    fallbackVoice: "sage",
    previewLine: "This is the custom voice slot, used only when your Rime account exposes one.",
    introLine: "Custom voice selected, subject to your Rime account catalogue.",
    providerDependent: true,
  },
];

export function getVoiceCategory(id: string): VoiceCategory {
  return VOICE_CATEGORIES.find((v) => v.id === id) ?? VOICE_CATEGORIES[0]!;
}

/* ---------- automatic spoken-language detection ---------- */

const TELUGU_SCRIPT = /[\u0C00-\u0C7F]/;
const DEVANAGARI_SCRIPT = /[\u0900-\u097F]/;

const TELUGU_ROMAN = [
  "kavali","cheppu","chepu","ela","enti","emiti","meeru","nenu","chala","ledu","undi","unnaru",
  "bagunnara","cheyyi","ravali","vellali","ikkada","akkada","ippudu","repu","nuvvu","manchi",
  "telugu","kada","anna","akka","enduku","evaru","eppudu","koncham","chala bagundi",
];

const HINDI_ROMAN = [
  "chahiye","kaise","kaisa","kya","aap","mujhe","nahi","nahin","karo","kal","accha","achha",
  "theek","bahut","kripya","hindi","batao","kyun","mera","meri","tum","hain","karna","dijiye",
  "bhai","abhi","zaroorat",
];

/**
 * Detects the language actually spoken, so replies follow the user automatically.
 * Script wins; otherwise romanised keyword hits decide.
 */
export function detectSpokenLanguage(text: string, fallback: LanguageCode = "en"): LanguageCode {
  if (TELUGU_SCRIPT.test(text)) return "te";
  if (DEVANAGARI_SCRIPT.test(text)) return "hi";
  const words = text.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  if (words.length === 0) return fallback;
  const set = new Set(words);
  const te = TELUGU_ROMAN.filter((w) => set.has(w)).length;
  const hi = HINDI_ROMAN.filter((w) => set.has(w)).length;
  if (te === 0 && hi === 0) return fallback;
  return te >= hi ? "te" : "hi";
}

/** Deterministic delayed-tool duration used by the stress test (real wall-clock delay). */
export const DEFAULT_TOOL_DELAY_MS = 5000;

export const DEFAULT_NICKNAME = "Remi";
