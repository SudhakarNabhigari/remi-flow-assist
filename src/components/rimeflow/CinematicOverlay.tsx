import { useEffect, useRef, useState } from "react";

import { playAmbience } from "@/lib/rimeflow/ambience";
import { cn } from "@/lib/utils";

export interface CinematicOverlayProps {
  title: string;
  subtitle?: string;
  /** Spoken line — runs through the same Rime-first speech path as everything else. */
  onSpeak?: () => Promise<unknown>;
  onDone: () => void;
  /** Minimum time the animation stays on screen. */
  minDurationMs?: number;
  reducedMotion?: boolean;
}

/**
 * Full-screen cinematic reveal: animated title, orb burst, particles, a synthesized
 * background bed, and one spoken line. Used for login welcome, nickname confirmation
 * and voice introductions.
 */
export function CinematicOverlay({
  title,
  subtitle,
  onSpeak,
  onDone,
  minDurationMs = 4200,
  reducedMotion = false,
}: CinematicOverlayProps) {
  const [leaving, setLeaving] = useState(false);
  const doneRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const ambience = reducedMotion ? { stop: () => {} } : playAmbience(minDurationMs + 1200);
    const started = Date.now();

    const finish = () => {
      if (doneRef.current || cancelled) return;
      doneRef.current = true;
      ambience.stop();
      setLeaving(true);
      window.setTimeout(() => !cancelled && onDone(), 600);
    };

    void (async () => {
      try {
        await onSpeak?.();
      } catch {
        /* speech failure must never trap the user in the overlay */
      }
      const elapsed = Date.now() - started;
      window.setTimeout(finish, Math.max(400, minDurationMs - elapsed));
    })();

    const hardStop = window.setTimeout(finish, minDurationMs + 14000);
    return () => {
      cancelled = true;
      window.clearTimeout(hardStop);
      ambience.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const letters = title.split("");

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden bg-sidebar-gradient px-6 text-sidebar-foreground",
        leaving ? "animate-overlay-out" : "animate-overlay-in",
      )}
    >
      {!reducedMotion && (
        <>
          <div className="pointer-events-none absolute -left-24 top-1/4 h-80 w-80 rounded-full bg-white/10 blur-3xl animate-float-slow" />
          <div className="pointer-events-none absolute -right-16 bottom-10 h-96 w-96 rounded-full bg-white/10 blur-3xl animate-float-slower" />
          {Array.from({ length: 18 }).map((_, i) => (
            <span
              key={i}
              className="pointer-events-none absolute h-1.5 w-1.5 rounded-full bg-white/60 animate-spark"
              style={{
                left: `${(i * 37) % 100}%`,
                top: `${(i * 53) % 100}%`,
                animationDelay: `${(i % 9) * 180}ms`,
              }}
            />
          ))}
        </>
      )}

      <div className="relative mb-10 flex h-32 w-32 items-center justify-center">
        <span className="absolute inset-0 rounded-full border border-white/40 animate-ring-expand" />
        <span
          className="absolute inset-0 rounded-full border border-white/30 animate-ring-expand"
          style={{ animationDelay: "600ms" }}
        />
        <span className="h-20 w-20 rounded-full bg-white/90 shadow-[0_0_80px_20px_rgba(255,255,255,0.45)] animate-orb-pulse" />
      </div>

      <h2 className="max-w-4xl text-center text-2xl font-black uppercase leading-tight tracking-[0.18em] md:text-5xl">
        {letters.map((char, i) => (
          <span
            key={`${char}-${i}`}
            className="inline-block animate-letter-rise"
            style={{ animationDelay: `${i * 32}ms` }}
          >
            {char === " " ? "\u00A0" : char}
          </span>
        ))}
      </h2>

      {subtitle && (
        <p
          className="mt-5 max-w-xl text-center text-sm opacity-0 animate-fade-in-delayed md:text-base"
          style={{ animationDelay: "900ms" }}
        >
          {subtitle}
        </p>
      )}

      <div className="mt-10 flex h-10 items-end gap-1.5">
        {Array.from({ length: 22 }).map((_, i) => (
          <span
            key={i}
            className="w-1.5 rounded-full bg-white/70 animate-bar"
            style={{
              height: `${12 + ((i * 17) % 26)}px`,
              animationDelay: `${i * 60}ms`,
              animationPlayState: reducedMotion ? "paused" : "running",
            }}
          />
        ))}
      </div>
    </div>
  );
}
