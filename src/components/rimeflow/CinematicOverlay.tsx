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
  minDurationMs = 4200,
  reducedMotion = false,
}: CinematicOverlayProps) {
  const [leaving, setLeaving] = useState(false);

  // Prevent duplicate intro speech during React StrictMode/dev remounts.
  const speechStartedRef = useRef(false);
  const doneRef = useRef(false);

  // Track both sides of the synchronization:
  // 1. Minimum cinematic animation duration has completed.
  // 2. Intro speech has completed.
  const minimumDurationReachedRef = useRef(false);
  const speechFinishedRef = useRef(false);

  // Keep the latest callbacks without causing the speech effect
  // to restart whenever their identities change.
  const onSpeakRef = useRef(onSpeak);
  const onDoneRef = useRef(onDone);

  onSpeakRef.current = onSpeak;
  onDoneRef.current = onDone;

  useEffect(() => {
    // React StrictMode can run effects more than once in development.
    // Only allow the intro speech to start once.
    if (speechStartedRef.current) {
      return;
    }

    speechStartedRef.current = true;

    let cancelled = false;

    const ambience = reducedMotion
      ? { stop: () => {} }
      : playAmbience(minDurationMs + 1200);

    /*
     * Finish only when BOTH conditions are true:
     *
     *   minimum animation time reached
     *   +
     *   intro voice finished
     *
     * This keeps the cinematic animation synchronized with
     * the actual spoken introduction.
     */
    const tryFinish = () => {
      if (cancelled || doneRef.current) {
        return;
      }

      if (
        !minimumDurationReachedRef.current ||
        !speechFinishedRef.current
      ) {
        return;
      }

      doneRef.current = true;
      ambience.stop();
      setLeaving(true);

      window.setTimeout(() => {
        if (!cancelled) {
          onDoneRef.current?.();
        }
      }, 600);
    };

    /*
     * Minimum cinematic duration.
     *
     * We do NOT navigate immediately here.
     * We only mark the animation duration as complete.
     * The voice must also be finished before navigation.
     */
    const minimumDurationTimer = window.setTimeout(() => {
      if (cancelled) {
        return;
      }

      minimumDurationReachedRef.current = true;
      tryFinish();
    }, minDurationMs);

    /*
     * Start voice independently.
     *
     * This is important:
     * - animation does not wait for voice to START
     * - voice does not wait for animation
     * - both begin together
     */
    void (async () => {
      try {
        await onSpeakRef.current?.();
      } catch {
        // Speech failure should never trap the user.
      } finally {
        if (cancelled) {
          return;
        }

        speechFinishedRef.current = true;
        tryFinish();
      }
    })();

    /*
     * Absolute safety timeout.
     *
     * If the speech provider hangs indefinitely, the user must
     * still be allowed to enter the Home screen.
     *
     * This is intentionally much longer than the normal intro.
     */
    const hardStop = window.setTimeout(() => {
      if (cancelled || doneRef.current) {
        return;
      }

      doneRef.current = true;
      ambience.stop();
      setLeaving(true);

      window.setTimeout(() => {
        if (!cancelled) {
          onDoneRef.current?.();
        }
      }, 600);
    }, minDurationMs + 14000);

    return () => {
      cancelled = true;

      window.clearTimeout(minimumDurationTimer);
      window.clearTimeout(hardStop);

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