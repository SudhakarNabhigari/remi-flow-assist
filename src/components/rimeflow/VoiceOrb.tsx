import { Mic, MicOff } from "lucide-react";

import { cn } from "@/lib/utils";
import { FRIENDLY_STATE, type VoiceState } from "@/lib/rimeflow/events";

export function VoiceOrb({
  state,
  listening,
  level,
  reducedMotion,
  onToggle,
}: {
  state: VoiceState;
  listening: boolean;
  level: number;
  reducedMotion: boolean;
  onToggle: () => void;
}) {
  const active = !reducedMotion;
  const scale = 1 + Math.min(0.14, level * 0.18);

  return (
    <div className="relative flex h-64 w-64 items-center justify-center">

      {/* NEON AUDIO WAVES */}
      {active && (
        <div className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none">
          <svg
  viewBox="0 0 560 180"
  className="absolute h-40 w-[540px] max-w-none overflow-visible"
            aria-hidden="true"
          >
            {/* Outer soft glow */}
            {/* Outer glow wave */}
<path
  className="audio-wave audio-wave-glow"
  d="
    M 0 90
    C 45 90, 55 45, 95 45
    C 135 45, 140 135, 180 135
    C 220 135, 225 30, 270 30
    M 290 30
    C 335 30, 340 135, 380 135
    C 420 135, 425 45, 465 45
    C 505 45, 515 90, 560 90
  "
/>

{/* Main neon wave */}
<path
  className="audio-wave audio-wave-main"
  d="
    M 0 90
    C 45 90, 55 55, 95 55
    C 135 55, 140 125, 180 125
    C 220 125, 225 40, 270 40
    M 290 40
    C 335 40, 340 125, 380 125
    C 420 125, 425 55, 465 55
    C 505 55, 515 90, 560 90
  "
/>

{/* Inner glow wave */}
<path
  className="audio-wave audio-wave-inner"
  d="
    M 0 90
    C 45 90, 60 70, 95 70
    C 130 70, 145 110, 180 110
    C 215 110, 230 55, 270 55
    M 290 55
    C 330 55, 345 110, 380 110
    C 415 110, 430 70, 465 70
    C 500 70, 515 90, 560 90
  "
/>
          </svg>
        </div>
      )}

      {/* MICROPHONE */}
      <button
        type="button"
        onClick={onToggle}
        aria-label={listening ? "Stop listening" : "Start listening"}
        aria-pressed={listening}
        className={cn(
          "relative z-10 flex h-40 w-40 flex-col items-center justify-center gap-1 rounded-full bg-orb text-primary-foreground shadow-orb transition-transform duration-200 hover:scale-[1.03] focus-visible:outline-primary",
          active && "animate-orb-pulse",
        )}
        style={reducedMotion ? undefined : { transform: `scale(${scale})` }}
      >
        {listening ? (
          <Mic className="h-9 w-9" />
        ) : (
          <MicOff className="h-9 w-9 opacity-90" />
        )}

        <span className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em]">
          {FRIENDLY_STATE[state]}
        </span>
      </button>
    </div>
  );
}