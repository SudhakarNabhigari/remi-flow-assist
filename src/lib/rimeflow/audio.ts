/**
 * Browser audio playback for Rime output.
 *
 * Uses a persistent AudioContext so delayed Rime responses can be
 * played reliably after login/settings actions.
 *
 * Supports:
 * - Rime Base64 audio
 * - waveform analyser
 * - immediate interruption
 * - browser autoplay protection
 */

export class AudioPlayback {
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private playing = false;
  private generation = 0;

  get isPlaying(): boolean {
    return this.playing;
  }

  get level(): number {
    if (!this.analyser || !this.playing) {
      return 0;
    }

    const data = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(data);

    let sum = 0;

    for (let i = 0; i < data.length; i += 1) {
      const value = (data[i]! - 128) / 128;
      sum += value * value;
    }

    return Math.min(1, Math.sqrt(sum / data.length) * 4);
  }

  /**
   * Unlock audio from a user interaction.
   *
   * Call this directly from login/save-nickname/voice-preview handlers.
   */
  unlock(): void {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const AudioContextClass =
        window.AudioContext ??
        (
          window as unknown as {
            webkitAudioContext?: typeof AudioContext;
          }
        ).webkitAudioContext;

      if (!AudioContextClass) {
        return;
      }

      if (!this.context) {
        this.context = new AudioContextClass();
      }

      if (this.context.state === "suspended") {
        void this.context.resume().catch(() => {});
      }
    } catch {
      // Browser does not support Web Audio.
    }
  }

  /**
   * Play Base64 encoded audio.
   */
  async play(
    audioBase64: string,
    mimeType: string,
    onFirstAudio?: () => void,
  ): Promise<void> {
    const currentGeneration = ++this.generation;

    this.stop();

    if (!audioBase64) {
      throw new Error("No audio data was returned.");
    }

    const binary = this.base64ToArrayBuffer(audioBase64);

    /*
     * First try Web Audio.
     */
    if (typeof window !== "undefined") {
      this.unlock();

      if (this.context) {
        try {
          await this.playWithWebAudio(
            binary,
            currentGeneration,
            onFirstAudio,
          );

          return;
        } catch (error) {
          console.warn(
            "[RimeFlow] Web Audio playback failed. Using HTMLAudio fallback.",
            error,
          );

          this.stop();
        }
      }
    }

    /*
     * Fallback for unsupported audio formats/browsers.
     */
    await this.playWithHtmlAudio(
      binary,
      mimeType,
      currentGeneration,
      onFirstAudio,
    );
  }

  /**
   * Web Audio playback.
   */
  private async playWithWebAudio(
    binary: ArrayBuffer,
    generation: number,
    onFirstAudio?: () => void,
  ): Promise<void> {
    if (!this.context) {
      throw new Error("AudioContext is unavailable.");
    }

    const context = this.context;

    if (context.state === "suspended") {
      await context.resume();
    }

    if (generation !== this.generation) {
      return;
    }

    const audioBuffer = await context.decodeAudioData(binary.slice(0));

    if (generation !== this.generation) {
      return;
    }

    const analyser = context.createAnalyser();

    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.75;

    const source = context.createBufferSource();

    source.buffer = audioBuffer;

    source.connect(analyser);
    analyser.connect(context.destination);

    this.analyser = analyser;
    this.source = source;
    this.playing = true;

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let started = false;

      const finish = () => {
        if (settled) {
          return;
        }

        settled = true;

        if (this.source === source) {
          this.source = null;
        }

        if (this.analyser === analyser) {
          this.analyser = null;
        }

        this.playing = false;

        resolve();
      };

      source.onended = finish;

      try {
        source.start(0);

        if (!started) {
          started = true;
          onFirstAudio?.();
        }
      } catch (error) {
        this.playing = false;

        if (this.source === source) {
          this.source = null;
        }

        if (this.analyser === analyser) {
          this.analyser = null;
        }

        reject(error);
      }
    });
  }

  /**
   * HTML Audio fallback.
   */
  private async playWithHtmlAudio(
    binary: ArrayBuffer,
    mimeType: string,
    generation: number,
    onFirstAudio?: () => void,
  ): Promise<void> {
    const blob = new Blob([binary], {
      type: mimeType || "audio/wav",
    });

    const url = URL.createObjectURL(blob);
    const element = new Audio(url);

    element.preload = "auto";

    this.playing = true;

    try {
      await new Promise<void>((resolve, reject) => {
        let started = false;

        const cleanup = () => {
          element.onplaying = null;
          element.onended = null;
          element.onerror = null;
        };

        element.onplaying = () => {
          if (!started) {
            started = true;
            onFirstAudio?.();
          }
        };

        element.onended = () => {
          cleanup();
          resolve();
        };

        element.onerror = () => {
          cleanup();
          reject(new Error("Audio playback failed."));
        };

        if (generation !== this.generation) {
          cleanup();
          resolve();
          return;
        }

        element.play().catch((error) => {
          cleanup();
          reject(error);
        });
      });
    } finally {
      element.pause();
      element.currentTime = 0;
      element.src = "";

      URL.revokeObjectURL(url);

      if (generation === this.generation) {
        this.playing = false;
      }
    }
  }

  /**
   * Immediately stop current speech.
   */
  stop(): void {
    this.generation += 1;
    this.playing = false;

    if (this.source) {
      try {
        this.source.onended = null;
        this.source.stop(0);
        this.source.disconnect();
      } catch {
        // Source may already have ended.
      }

      this.source = null;
    }

    if (this.analyser) {
      try {
        this.analyser.disconnect();
      } catch {
        // Already disconnected.
      }

      this.analyser = null;
    }
  }

  /**
   * Convert Base64 into ArrayBuffer.
   */
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const cleaned = base64.includes(",")
      ? base64.substring(base64.indexOf(",") + 1)
      : base64;

    const binary = atob(cleaned);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }

    return bytes.buffer;
  }
}