/**
 * Browser audio playback for Rime output.
 * Playback must stop within milliseconds when the user barges in, so the
 * element is paused, detached and its source revoked synchronously.
 */
export class AudioPlayback {
  private element: HTMLAudioElement | null = null;
  private url: string | null = null;
  private analyser: AnalyserNode | null = null;
  private context: AudioContext | null = null;

  get isPlaying(): boolean {
    return Boolean(this.element && !this.element.paused && !this.element.ended);
  }

  /** Returns a live 0..1 loudness value while Rime speaks (for the waveform). */
  get level(): number {
    if (!this.analyser) return 0;
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i += 1) {
      const v = (data[i]! - 128) / 128;
      sum += v * v;
    }
    return Math.min(1, Math.sqrt(sum / data.length) * 4);
  }

  async play(audioBase64: string, mimeType: string, onFirstAudio?: () => void): Promise<void> {
    this.stop();
    const binary = atob(audioBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: mimeType });
    this.url = URL.createObjectURL(blob);

    const element = new Audio(this.url);
    element.preload = "auto";
    this.element = element;

    try {
      const AudioCtx =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.context = new AudioCtx();
        if (this.context.state === "suspended") await this.context.resume().catch(() => {});
        const source = this.context.createMediaElementSource(element);
        this.analyser = this.context.createAnalyser();
        this.analyser.fftSize = 512;
        source.connect(this.analyser);
        this.analyser.connect(this.context.destination);
      }
    } catch {
      this.analyser = null;
    }

    await new Promise<void>((resolve, reject) => {
      let started = false;
      element.onplaying = () => {
        if (!started) {
          started = true;
          onFirstAudio?.();
        }
      };
      element.onended = () => resolve();
      element.onerror = () => reject(new Error("Audio playback failed."));
      element.play().catch(reject);
    });
    this.cleanup();
  }

  /** Hard stop — used by the interrupt controller. */
  stop(): void {
    if (this.element) {
      this.element.onended = null;
      this.element.onerror = null;
      this.element.pause();
      this.element.currentTime = 0;
      this.element.src = "";
    }
    this.cleanup();
  }

  private cleanup(): void {
    if (this.url) {
      URL.revokeObjectURL(this.url);
      this.url = null;
    }
    this.element = null;
    this.analyser = null;
    if (this.context) {
      void this.context.close().catch(() => {});
      this.context = null;
    }
  }
}
