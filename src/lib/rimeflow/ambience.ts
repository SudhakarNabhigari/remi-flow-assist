/**
 * Small Web Audio "cinematic" background bed used by the welcome / confirmation
 * animations. Pure synthesis — no audio assets, no network, easy to stop.
 */

export interface Ambience {
  stop: () => void;
}

export function playAmbience(durationMs = 6000): Ambience {
  if (typeof window === "undefined") return { stop: () => {} };
  const AudioCtx =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return { stop: () => {} };

  let ctx: AudioContext;
  try {
    ctx = new AudioCtx();
  } catch {
    return { stop: () => {} };
  }
  void ctx.resume().catch(() => {});

  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.16, now + 1.1);
  master.connect(ctx.destination);

  // Soft evolving pad (a gentle major-ninth chord).
  const pad = [174.6, 261.6, 329.6, 392.0, 587.3];
  const oscillators: OscillatorNode[] = [];
  pad.forEach((freq, index) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = index % 2 === 0 ? "sine" : "triangle";
    osc.frequency.setValueAtTime(freq, now);
    osc.detune.setValueAtTime((index - 2) * 5, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.09 / (index + 1), now + 1.4 + index * 0.15);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now + index * 0.08);
    oscillators.push(osc);
  });

  // Rising shimmer sweep for the "reveal" moment.
  const sweep = ctx.createOscillator();
  const sweepGain = ctx.createGain();
  const sweepFilter = ctx.createBiquadFilter();
  sweepFilter.type = "bandpass";
  sweepFilter.frequency.setValueAtTime(600, now);
  sweepFilter.frequency.exponentialRampToValueAtTime(4200, now + 2.2);
  sweep.type = "sawtooth";
  sweep.frequency.setValueAtTime(110, now);
  sweep.frequency.exponentialRampToValueAtTime(880, now + 2.2);
  sweepGain.gain.setValueAtTime(0.0001, now);
  sweepGain.gain.exponentialRampToValueAtTime(0.05, now + 0.9);
  sweepGain.gain.exponentialRampToValueAtTime(0.0001, now + 2.6);
  sweep.connect(sweepFilter);
  sweepFilter.connect(sweepGain);
  sweepGain.connect(master);
  sweep.start(now);
  sweep.stop(now + 2.8);

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    const t = ctx.currentTime;
    try {
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), t);
      master.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      oscillators.forEach((osc) => osc.stop(t + 0.7));
    } catch {
      /* already stopped */
    }
    window.setTimeout(() => void ctx.close().catch(() => {}), 900);
  };

  window.setTimeout(stop, Math.max(1200, durationMs));
  return { stop };
}

/** Short confirmation chime. */
export function playChime(): void {
  if (typeof window === "undefined") return;
  const AudioCtx =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;
  const ctx = new AudioCtx();
  const now = ctx.currentTime;
  [784, 1046.5, 1568].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now + i * 0.09);
    gain.gain.setValueAtTime(0.0001, now + i * 0.09);
    gain.gain.exponentialRampToValueAtTime(0.12, now + i * 0.09 + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.09 + 0.7);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + i * 0.09);
    osc.stop(now + i * 0.09 + 0.8);
  });
  window.setTimeout(() => void ctx.close().catch(() => {}), 1400);
}
