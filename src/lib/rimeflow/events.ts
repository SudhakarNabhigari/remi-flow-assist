export const VOICE_EVENTS = [
  "USER_AUDIO_STARTED",
  "USER_AUDIO_ENDED",
  "WAKE_WORD_DETECTED",
  "STT_READY",
  "REQUEST_CREATED",
  "TOOL_STARTED",
  "RIME_STARTED",
  "INTERRUPTION_DETECTED",
  "RIME_STOPPED",
  "VERSION_INVALIDATED",
  "TOOL_CANCELLED",
  "STALE_RESULT_REJECTED",
  "NEW_REQUEST_ACCEPTED",
  "TOOL_COMPLETED",
  "RIME_RESPONSE_STARTED",
  "TASK_COMPLETED",
  "ERROR",
] as const;

export type VoiceEventType = (typeof VOICE_EVENTS)[number];

export interface VoiceEvent {
  eventId: string;
  timestamp: number;
  requestId: string | null;
  conversationVersion: number;
  eventType: VoiceEventType;
  metadata: Record<string, unknown>;
}

/** Internal machine states. */
export type VoiceState =
  | "IDLE"
  | "LISTENING"
  | "THINKING"
  | "TOOL_RUNNING"
  | "SPEAKING"
  | "INTERRUPTED"
  | "RECOVERING"
  | "STALE_RESULT_REJECTED"
  | "COMPLETED"
  | "ERROR";

/** Friendly labels shown on Home. */
export const FRIENDLY_STATE: Record<VoiceState, string> = {
  IDLE: "READY",
  LISTENING: "LISTENING",
  THINKING: "THINKING",
  TOOL_RUNNING: "THINKING",
  SPEAKING: "SPEAKING",
  INTERRUPTED: "UPDATING",
  RECOVERING: "UPDATING",
  STALE_RESULT_REJECTED: "UPDATING",
  COMPLETED: "DONE",
  ERROR: "ERROR",
};

/** States where the waveform must animate. IDLE/COMPLETED stay flat. */
export function isWaveActive(state: VoiceState): boolean {
  return (
    state === "LISTENING" ||
    state === "SPEAKING" ||
    state === "THINKING" ||
    state === "TOOL_RUNNING" ||
    state === "INTERRUPTED" ||
    state === "RECOVERING"
  );
}

export function waveEnergy(state: VoiceState): number {
  switch (state) {
    case "LISTENING":
      return 1;
    case "SPEAKING":
      return 0.9;
    case "INTERRUPTED":
      return 1.2;
    case "RECOVERING":
      return 0.6;
    case "THINKING":
    case "TOOL_RUNNING":
      return 0.28;
    default:
      return 0;
  }
}
