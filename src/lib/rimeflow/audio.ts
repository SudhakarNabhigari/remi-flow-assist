export type AudioStopCallback = () => void;

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const clean = base64
    .replace(/^data:[^;]+;base64,/, "")
    .replace(/\s/g, "");

  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer;
}

export class AudioPlayback {
  private context: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private htmlAudio: HTMLAudioElement | null = null;

  private generation = 0;
  private playing = false;
  private levelValue = 0;

  private getContext(): AudioContext | null {
    if (typeof window === "undefined") return null;

    if (!this.context) {
      const AudioContextClass =
        window.AudioContext ||
        (
          window as typeof window & {
            webkitAudioContext?: typeof AudioContext;
          }
        ).webkitAudioContext;

      if (!AudioContextClass) return null;

      this.context = new AudioContextClass();
    }

    return this.context;
  }

  /**
   * Must be called from a real user gesture whenever possible.
   * This removes the browser autoplay lock.
   */
  unlock(): void {
    const context = this.getContext();

    if (!context) return;

    if (context.state === "suspended") {
      void context.resume().catch(() => undefined);
    }
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  get level(): number {
    if (!this.analyser || !this.playing) return this.levelValue;

    const data = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(data);

    let sum = 0;

    for (const value of data) {
      const normalized = (value - 128) / 128;
      sum += normalized * normalized;
    }

    const rms = Math.sqrt(sum / data.length);

    this.levelValue = Math.min(1, rms * 4);

    return this.levelValue;
  }

  async play(
    audioBase64: string,
    mimeType = "audio/mpeg",
    onFirstAudio?: () => void,
  ): Promise<void> {
    if (!audioBase64) {
      throw new Error("Speech service returned no audio.");
    }

    this.stop();

    const myGeneration = this.generation;
    this.playing = true;
    this.levelValue = 0;

    const context = this.getContext();

    /*
     * Preferred path:
     * Web Audio API.
     */
    if (context) {
      try {
        if (context.state === "suspended") {
          await context.resume();
        }

        if (myGeneration !== this.generation) {
          return;
        }

        const buffer = base64ToArrayBuffer(audioBase64);
        const decoded = await context.decodeAudioData(buffer.slice(0));

        if (myGeneration !== this.generation) {
          return;
        }

        const source = context.createBufferSource();
        const gain = context.createGain();
        const analyser = context.createAnalyser();

        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;

        source.buffer = decoded;

        source.connect(gain);
        gain.connect(analyser);
        analyser.connect(context.destination);

        this.source = source;
        this.gain = gain;
        this.analyser = analyser;

        source.onended = () => {
          if (myGeneration !== this.generation) return;

          this.playing = false;
          this.levelValue = 0;

          if (this.source === source) {
            this.source = null;
          }
        };

        source.start(0);

        onFirstAudio?.();

        await new Promise<void>((resolve) => {
          const check = () => {
            if (myGeneration !== this.generation) {
              resolve();
              return;
            }

            if (!this.playing) {
              resolve();
              return;
            }

            window.setTimeout(check, 50);
          };

          check();
        });

        return;
      } catch (error) {
        /*
         * Web Audio failed.
         * Continue to HTMLAudio fallback.
         */
        console.warn("Web Audio playback failed; using HTMLAudio fallback.", error);

        this.source = null;
        this.analyser = null;
        this.gain = null;
      }
    }

    /*
     * Final fallback:
     * normal HTMLAudioElement.
     */
    const audio = new Audio(
      `data:${mimeType || "audio/mpeg"};base64,${audioBase64}`,
    );

    audio.preload = "auto";

    this.htmlAudio = audio;

    const finish = () => {
      if (myGeneration !== this.generation) return;

      this.playing = false;
      this.levelValue = 0;

      if (this.htmlAudio === audio) {
        this.htmlAudio = null;
      }
    };

    audio.onended = finish;
    audio.onerror = () => {
      finish();
    };

    try {
      await audio.play();
      onFirstAudio?.();

      await new Promise<void>((resolve) => {
        audio.onended = () => {
          finish();
          resolve();
        };

        audio.onerror = () => {
          finish();
          resolve();
        };
      });
    } catch (error) {
      finish();
      throw new Error(
        `Browser blocked audio playback: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  stop(): void {
    this.generation += 1;

    this.playing = false;
    this.levelValue = 0;

    if (this.source) {
      try {
        this.source.stop();
      } catch {
        // Already stopped.
      }

      this.source.disconnect();
      this.source = null;
    }

    if (this.gain) {
      this.gain.disconnect();
      this.gain = null;
    }

    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }

    if (this.htmlAudio) {
      this.htmlAudio.pause();
      this.htmlAudio.currentTime = 0;
      this.htmlAudio.src = "";
      this.htmlAudio = null;
    }
  }
}