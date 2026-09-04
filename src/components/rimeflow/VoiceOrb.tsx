import { Mic, MicOff } from "lucide-react";

import { cn } from "@/lib/utils";
import { FRIENDLY_STATE, isWaveActive, type VoiceState } from "@/lib/rimeflow/events";

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
  const active = isWaveActive(state) && !reducedMotion;
  const scale = 1 + Math.min(0.14, level * 0.18);

  return (
    <div className="relative flex h-64 w-64 items-center justify-center">
      {active && (
        <>
          <span className="absolute inset-0 rounded-full border border-primary/25 animate-ring-spin" />
          <span className="absolute inset-4 rounded-full border border-dashed border-primary/20 animate-ring-spin [animation-direction:reverse]" />
        </>
      )}
      {active &&
        [0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className="absolute bottom-10 h-1.5 w-1.5 rounded-full bg-primary/40 animate-float-up"
            style={{ left: `${18 + i * 16}%`, animationDelay: `${i * 0.9}s` }}
          />
        ))}

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
        {listening ? <Mic className="h-9 w-9" /> : <MicOff className="h-9 w-9 opacity-90" />}
        <span className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em]">
          {FRIENDLY_STATE[state]}
        </span>
      </button>
    </div>
  );
}
