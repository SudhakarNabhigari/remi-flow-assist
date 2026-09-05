import { useEffect, useRef, useState } from "react";

import { playAmbience } from "@/lib/rimeflow/ambience";
import { cn } from "@/lib/utils";

export interface CinematicOverlayProps {
  title: string;
  subtitle?: string;
  onSpeak?: () => Promise<unknown>;
  onDone: () => void;
  minDurationMs?: number;
  reducedMotion?: boolean;
}

export function CinematicOverlay({
  title,
  subtitle,
  onSpeak,
  onDone,
  minDurationMs = 4000,
  reducedMotion = false,
}: CinematicOverlayProps) {
  const [leaving, setLeaving] = useState(false);

  // Prevent the voice from starting more than once
  const speechStartedRef = useRef(false);

  // Prevent the intro from finishing more than once
  const doneRef = useRef(false);

  // Keep the latest callbacks
  const onSpeakRef = useRef(onSpeak);
  const onDoneRef = useRef(onDone);

  onSpeakRef.current = onSpeak;
  onDoneRef.current = onDone;

  useEffect(() => {
    let cancelled = false;

    const ambience = reducedMotion
      ? { stop: () => {} }
      : playAmbience(minDurationMs + 1200);

    const finish = () => {
      if (doneRef.current || cancelled) {
        return;
      }

      doneRef.current = true;

      ambience.stop();
      setLeaving(true);

      // Finish the exit animation, then open Home
      window.setTimeout(() => {
        if (!cancelled) {
          onDoneRef.current?.();
        }
      }, 300);
    };

    // Start the introduction voice ONLY ONCE.
    // React StrictMode may run this effect more than once.
    if (!speechStartedRef.current) {
      speechStartedRef.current = true;

      void (async () => {
        try {
          await onSpeakRef.current?.();
        } catch {
          // Speech failure should never trap the user.
        }
      })();
    }

    // IMPORTANT:
    // Every effect run gets its own 4-second timer.
    // This allows React StrictMode cleanup/re-run
    // without playing the voice again.
    const timer = window.setTimeout(() => {
      finish();
    }, minDurationMs);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      ambience.stop();
    };
  }, [minDurationMs, reducedMotion]);

  const letters = title.split("");

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden px-4 text-white",
        "bg-[radial-gradient(circle_at_center,_#24104f_0%,_#0b0620_42%,_#02010a_100%)]",
        leaving ? "animate-overlay-out" : "animate-overlay-in",
      )}
    >
      {/* Ambient futuristic background */}
      {!reducedMotion && (
        <>
          <div className="pointer-events-none absolute -left-32 top-1/4 h-96 w-96 rounded-full bg-fuchsia-600/20 blur-[110px] animate-float-slow" />

          <div className="pointer-events-none absolute -right-32 bottom-10 h-[28rem] w-[28rem] rounded-full bg-violet-500/20 blur-[120px] animate-float-slower" />

          <div className="pointer-events-none absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400/10 blur-[100px]" />

          {/* Purple particles */}
          {Array.from({ length: 22 }).map((_, i) => (
            <span
              key={i}
              className="pointer-events-none absolute h-1.5 w-1.5 rounded-full bg-fuchsia-300/70 animate-spark"
              style={{
                left: `${(i * 37) % 100}%`,
                top: `${(i * 53) % 100}%`,
                animationDelay: `${(i % 9) * 180}ms`,
              }}
            />
          ))}
        </>
      )}

      {/* Energy Orb */}
      <div className="relative mb-10 flex h-40 w-40 items-center justify-center">
        {/* Outer energy rings */}
        <span className="absolute inset-0 rounded-full border border-fuchsia-400/50 animate-ring-expand" />

        <span
          className="absolute inset-3 rounded-full border border-violet-400/50 animate-ring-expand"
          style={{ animationDelay: "450ms" }}
        />

        <span
          className="absolute inset-6 rounded-full border border-cyan-300/30 animate-ring-expand"
          style={{ animationDelay: "900ms" }}
        />

        {/* Orb glow */}
        <span className="absolute h-28 w-28 rounded-full bg-fuchsia-600/20 blur-2xl animate-orb-pulse" />

        {/* Main orb */}
        <span
          className="
            relative h-20 w-20 rounded-full
            bg-[radial-gradient(circle_at_35%_30%,_#f5d0fe_0%,_#d946ef_30%,_#7c3aed_65%,_#312e81_100%)]
            shadow-[0_0_35px_8px_rgba(217,70,239,0.45),0_0_90px_20px_rgba(124,58,237,0.35)]
            animate-orb-pulse
          "
        />

        {/* Small core */}
        <span className="absolute h-5 w-5 rounded-full bg-white/90 shadow-[0_0_20px_8px_rgba(255,255,255,0.65)]" />
      </div>

      {/* Title */}
      <h2 className="w-full whitespace-nowrap text-center text-[clamp(1.15rem,5vw,3rem)] font-black uppercase leading-tight tracking-[0.12em]">
        {letters.map((char, i) => (
          <span
            key={`${char}-${i}`}
            className="inline-block bg-gradient-to-r from-fuchsia-200 via-violet-200 to-cyan-200 bg-clip-text text-transparent animate-letter-rise"
            style={{
              animationDelay: `${i * 32}ms`,
            }}
          >
            {char === " " ? "\u00A0" : char}
          </span>
        ))}
      </h2>

      {/* Subtitle */}
      {subtitle && (
        <p
          className="mt-5 max-w-xl text-center text-sm text-violet-100/80 opacity-0 animate-fade-in-delayed md:text-base"
          style={{ animationDelay: "900ms" }}
        >
          {subtitle}
        </p>
      )}

      {/* Voice visualizer */}
      <div className="mt-10 flex h-10 items-end gap-1.5">
        {Array.from({ length: 22 }).map((_, i) => (
          <span
            key={i}
            className="w-1.5 rounded-full bg-gradient-to-t from-violet-600 via-fuchsia-400 to-cyan-300 animate-bar"
            style={{
              height: `${12 + ((i * 17) % 26)}px`,
              animationDelay: `${i * 60}ms`,
              animationPlayState: reducedMotion
                ? "paused"
                : "running",
            }}
          />
        ))}
      </div>

      {/* Small status label */}
      <div className="mt-7 rounded-full border border-fuchsia-400/20 bg-white/5 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.3em] text-fuchsia-200/70 backdrop-blur-md">
        Voice interface initializing
      </div>
    </div>
  );
}