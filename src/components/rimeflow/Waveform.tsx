import { useEffect, useRef } from "react";

import { isWaveActive, waveEnergy, type VoiceState } from "@/lib/rimeflow/events";

/** Canvas waveform: animates while listening/speaking/thinking, flat when idle. */
export function Waveform({
  state,
  level,
  reducedMotion,
}: {
  state: VoiceState;
  level: number;
  reducedMotion: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef(state);
  const levelRef = useRef(level);
  stateRef.current = state;
  levelRef.current = level;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let t = 0;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const active = isWaveActive(stateRef.current) && !reducedMotion;
      const energy = active ? waveEnergy(stateRef.current) : 0;
      const amp = height * 0.32 * energy * (0.45 + Math.min(1, levelRef.current) * 0.85);

      for (let layer = 0; layer < 3; layer += 1) {
        ctx.beginPath();
        const alpha = 0.9 - layer * 0.28;
        ctx.strokeStyle = `color-mix(in oklch, var(--primary-bright) ${alpha * 100}%, transparent)`;
        ctx.lineWidth = 2.5 - layer * 0.6;
        ctx.lineCap = "round";
        for (let x = 0; x <= width; x += 2) {
          const p = x / width;
          const envelope = Math.sin(Math.PI * p);
          const y =
            height / 2 +
            Math.sin(p * (9 + layer * 3) + t * (0.05 + layer * 0.012)) *
              amp *
              envelope *
              (1 - layer * 0.22);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      t += 1;
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [reducedMotion]);

  return <canvas ref={canvasRef} className="h-24 w-full" aria-hidden />;
}
