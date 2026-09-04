/**
 * RimeFlow shared, client-safe configuration.
 *
 * IMPORTANT:
 * - No secrets are stored here.
 * - Rime credentials live only in server environment variables.
 * - Speaker IDs should match voices available in the connected Rime catalogue.
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
  return LANGUAGES.find((language) => language.code === code) ?? LANGUAGES[0]!;
}

/* -------------------------------------------------------------------------- */
/* Voice configuration                                                         */
/* -------------------------------------------------------------------------- */

export type VoiceCategoryId =
  | "female"
  | "male"
  | "child"
  | "robotic"
  | "custom_cloned";

export interface VoiceCategory {
  id: VoiceCategoryId;
  label: string;
  description: string;
  badge: string;

  /**
   * Speaker requested from Rime.
   *
   * The server must still verify that this speaker exists in the
   * connected Rime catalogue before using it.
   */
  requestedRimeSpeaker: string;

  /**
   * Browser/resilience-only fallback voice.
   *
   * This is NOT the primary judged voice.
   */
  fallbackVoice: string;

  /** Delivery steering for the fallback browser voice. */
  voiceInstructions?: string;

  /** Text spoken by the voice preview button. */
  previewLine: string;

  /** Text spoken after a voice is selected. */
  introLine: string;

  /**
   * Rime standard TTS does not automatically provide voice cloning.
   * This flag indicates that the option depends on the provider/account.
   */
  providerDependent?: boolean;
}

/**
 * Rime speaker choices.
 *
 * celeste and orion are used here because they are shown in Rime's
 * official developer examples.
 *
 * The server should verify these against the live connected catalogue.
 */
export const VOICE_CATEGORIES: VoiceCategory[] = [
  {
    id: "female",
    label: "Female Voice",
    description:
      "Warm, natural female speaker. The default conversational voice.",
    badge: "Female",

    // Verified example speaker from Rime developer material.
    requestedRimeSpeaker: "celeste",

    fallbackVoice: "shimmer",

    previewLine:
      "Hi, this is my female voice. Natural, warm and easy to listen to.",

    introLine:
      "Female voice selected. I am ready whenever you want to talk.",
  },

  {
    id: "male",
    label: "Male Voice",
    description:
      "Calm, confident male speaker. Great for clear narration and answers.",
    badge: "Male",

    // Verified example speaker from Rime developer material.
    requestedRimeSpeaker: "orion",

    fallbackVoice: "onyx",

    previewLine:
      "Hello, this is my male voice. Calm, clear and confident.",

    introLine:
      "Male voice selected. Let's get straight to work.",
  },

  {
    id: "child",
    label: "Child Voice",
    description:
      "Bright, playful younger-sounding voice for friendly, fun replies.",
    badge: "Child",

    /*
     * We intentionally do NOT invent a child-specific Rime speaker ID.
     *
     * Use the verified female speaker until a child speaker is confirmed
     * in the connected Rime catalogue.
     */
    requestedRimeSpeaker: "celeste",

    fallbackVoice: "coral",

    voiceInstructions:
      "Speak with a cheerful, bright, playful and youthful delivery.",

    previewLine:
      "Hiii! This is my child voice. It's fun and super friendly!",

    introLine:
      "Yay! Child voice selected. Let's talk!",
  },

  {
    id: "robotic",
    label: "Robotic Voice",
    description:
      "Stylised machine-like delivery for a character or android persona.",
    badge: "Robotic",

    /*
     * We do not invent a special robotic Rime speaker.
     * The server can apply provider-supported controls if available.
     */
    requestedRimeSpeaker: "orion",

    fallbackVoice: "echo",

    voiceInstructions:
      "Speak like a retro robot: flat, metallic, evenly clipped syllables, minimal emotion.",

    previewLine:
      "Voice module online. This is my robotic voice profile.",

    introLine:
      "Robotic voice engaged. Awaiting your command.",
  },

  {
    id: "custom_cloned",
    label: "Custom / Cloned Voice",
    description:
      "Provider-dependent. Only available when the connected Rime account exposes a custom or cloned speaker.",
    badge: "Custom",

    /*
     * Do not send a fake custom speaker to Rime.
     * An empty value tells the application that no verified
     * custom speaker has been configured.
     */
    requestedRimeSpeaker: "",

    fallbackVoice: "sage",

    previewLine:
      "This is the custom voice slot, used only when your Rime account exposes one.",

    introLine:
      "Custom voice selected, subject to your Rime account catalogue.",

    providerDependent: true,
  },
];

export function getVoiceCategory(id: string): VoiceCategory {
  return (
    VOICE_CATEGORIES.find((voice) => voice.id === id) ??
    VOICE_CATEGORIES[0]!
  );
}

/* -------------------------------------------------------------------------- */
/* Automatic spoken-language detection                                        */
/* -------------------------------------------------------------------------- */

const TELUGU_SCRIPT = /[\u0C00-\u0C7F]/;
const DEVANAGARI_SCRIPT = /[\u0900-\u097F]/;

const TELUGU_ROMAN = [
  "kavali",
  "cheppu",
  "chepu",
  "ela",
  "enti",
  "emiti",
  "meeru",
  "nenu",
  "chala",
  "ledu",
  "undi",
  "unnaru",
  "bagunnara",
  "cheyyi",
  "ravali",
  "vellali",
  "ikkada",
  "akkada",
  "ippudu",
  "repu",
  "nuvvu",
  "manchi",
  "telugu",
  "kada",
  "anna",
  "akka",
  "enduku",
  "evaru",
  "eppudu",
  "koncham",
  "chala",
  "bagundi",
];

const HINDI_ROMAN = [
  "chahiye",
  "kaise",
  "kaisa",
  "kya",
  "aap",
  "mujhe",
  "nahi",
  "nahin",
  "karo",
  "kal",
  "accha",
  "achha",
  "theek",
  "bahut",
  "kripya",
  "hindi",
  "batao",
  "kyun",
  "mera",
  "meri",
  "tum",
  "hain",
  "karna",
  "dijiye",
  "bhai",
  "abhi",
  "zaroorat",
];

/**
 * Detects the language actually spoken.
 *
 * Priority:
 * 1. Telugu script
 * 2. Devanagari script
 * 3. Romanised Telugu/Hindi keywords
 * 4. Configured fallback language
 */
export function detectSpokenLanguage(
  text: string,
  fallback: LanguageCode = "en",
): LanguageCode {
  if (TELUGU_SCRIPT.test(text)) {
    return "te";
  }

  if (DEVANAGARI_SCRIPT.test(text)) {
    return "hi";
  }

  const words = text
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);

  if (words.length === 0) {
    return fallback;
  }

  const set = new Set(words);

  const teluguMatches = TELUGU_ROMAN.filter((word) =>
    set.has(word),
  ).length;

  const hindiMatches = HINDI_ROMAN.filter((word) =>
    set.has(word),
  ).length;

  if (teluguMatches === 0 && hindiMatches === 0) {
    return fallback;
  }

  return teluguMatches >= hindiMatches ? "te" : "hi";
}

/* -------------------------------------------------------------------------- */
/* Voice stress-test configuration                                             */
/* -------------------------------------------------------------------------- */

/**
 * Deterministic delayed-tool duration used by the interruption stress test.
 *
 * This must remain a real wall-clock delay so the test exercises:
 *
 * user request
 *      ↓
 * delayed tool
 *      ↓
 * user interruption
 *      ↓
 * cancellation/fencing
 *      ↓
 * latest request wins
 */
export const DEFAULT_TOOL_DELAY_MS = 5000;

/* -------------------------------------------------------------------------- */
/* Default application configuration                                           */
/* -------------------------------------------------------------------------- */

export const DEFAULT_NICKNAME = "Remi";