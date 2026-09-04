/**
 * Speech input with automatic path selection:
 *  1. Browser SpeechRecognition (continuous, full-duplex barge-in, wake word)
 *  2. Server streaming-model STT on complete WAV segments (fallback / Telugu, Hindi)
 *
 * Browser recognition is automatically recreated whenever Chrome ends a session.
 * The microphone remains available while the assistant speaks so barge-in works.
 */

export type SttMode = "browser" | "server" | "unavailable";

interface RecognitionResultLike {
  0: { transcript: string };
  isFinal: boolean;
  length: number;
}

interface RecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: RecognitionResultLike;
  };
}

interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

function getRecognitionCtor(): (new () => RecognitionLike) | null {
  if (typeof window === "undefined") return null;

  const w = window as unknown as {
    SpeechRecognition?: new () => RecognitionLike;
    webkitSpeechRecognition?: new () => RecognitionLike;
  };

  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function detectSttMode(): SttMode {
  if (typeof window === "undefined") return "unavailable";

  if (getRecognitionCtor()) {
    return "browser";
  }

  if (typeof navigator !== "undefined" && navigator.mediaDevices) {
    return "server";
  }

  return "unavailable";
}

export interface SttCallbacks {
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onLevel: (level: number) => void;
  onError: (message: string) => void;
  onStateChange?: (listening: boolean) => void;
}

/**
 * Common STT interface.
 */
export interface SttEngine {
  mode: SttMode;
  start: () => Promise<void>;
  stop: () => void;
  setLanguage: (bcp47: string, sttCode: string) => void;
}

/* -------------------------------------------------------------------------- */
/* Browser SpeechRecognition                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Browser continuous recognition.
 *
 * Important:
 * Chrome/SpeechRecognition can end its recognition session by itself even when
 * continuous=true. Therefore we create a NEW recognition object after onend
 * instead of trying to restart the old object.
 */
export function createBrowserStt(
  lang: string,
  callbacks: SttCallbacks,
): SttEngine {
  const Ctor = getRecognitionCtor();

  if (!Ctor) {
    throw new Error("Browser SpeechRecognition is unavailable.");
  }

  let recognition: RecognitionLike | null = null;
  let running = false;
  let language = lang;

  // Prevent stale recognition instances from restarting themselves.
  let generation = 0;

  // Prevent multiple restart timers.
  let restartTimer: number | null = null;

  const clearRestartTimer = () => {
    if (restartTimer !== null) {
      window.clearTimeout(restartTimer);
      restartTimer = null;
    }
  };

  const scheduleRestart = (myGeneration: number) => {
    if (!running) return;
    if (myGeneration !== generation) return;
    if (restartTimer !== null) return;

    restartTimer = window.setTimeout(() => {
      restartTimer = null;

      if (!running) return;
      if (myGeneration !== generation) return;

      buildAndStart();
    }, 400);
  };

  const build = (myGeneration: number): RecognitionLike => {
    const r = new Ctor();

    r.lang = language;
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;

    r.onstart = () => {
      if (!running || myGeneration !== generation) return;

      callbacks.onStateChange?.(true);
    };

    r.onresult = (event) => {
      if (!running || myGeneration !== generation) return;

      for (
        let i = event.resultIndex;
        i < event.results.length;
        i += 1
      ) {
        const result = event.results[i];

        if (!result) continue;

        const transcript = result[0]?.transcript?.trim();

        if (!transcript) continue;

        if (result.isFinal) {
          callbacks.onFinal(transcript);
        } else {
          callbacks.onPartial(transcript);
        }
      }
    };

    r.onerror = (event) => {
      if (myGeneration !== generation) return;

      const error = event.error;

      /*
       * These are normal browser lifecycle conditions.
       *
       * no-speech:
       * Chrome simply didn't hear speech.
       *
       * aborted:
       * We intentionally aborted or Chrome ended the session.
       *
       * We do NOT stop the engine here.
       * onend will recreate recognition.
       */
      if (
        error === "no-speech" ||
        error === "aborted" ||
        error === "network"
      ) {
        return;
      }

      /*
       * Permission errors are different.
       * Do not continuously restart when the browser explicitly denied
       * microphone permission.
       */
      if (
        error === "not-allowed" ||
        error === "service-not-allowed"
      ) {
        running = false;
        clearRestartTimer();

        callbacks.onStateChange?.(false);

        callbacks.onError(
          "Microphone access was blocked. Allow microphone permission in Chrome and try again.",
        );

        return;
      }

      callbacks.onError(`Speech recognition error: ${error}`);
    };

    r.onend = () => {
      if (myGeneration !== generation) {
        return;
      }

      callbacks.onStateChange?.(false);

      /*
       * If the application is still running, immediately schedule a fresh
       * recognition session.
       */
      if (running) {
        scheduleRestart(myGeneration);
      }
    };

    return r;
  };

  function buildAndStart() {
    if (!running) return;

    const myGeneration = generation;

    const oldRecognition = recognition;

    /*
     * Detach old callbacks before aborting so the old instance cannot trigger
     * another restart.
     */
    if (oldRecognition) {
      oldRecognition.onresult = null;
      oldRecognition.onerror = null;
      oldRecognition.onend = null;
      oldRecognition.onstart = null;

      try {
        oldRecognition.abort();
      } catch {
        // Ignore stale recognition shutdown errors.
      }
    }

    const nextRecognition = build(myGeneration);

    recognition = nextRecognition;

    try {
      nextRecognition.start();
    } catch (error) {
      /*
       * Chrome can briefly report InvalidStateError when start() happens too
       * quickly. Recreate it after a short delay.
       */
      if (running && myGeneration === generation) {
        scheduleRestart(myGeneration);
      } else {
        console.debug("SpeechRecognition start skipped:", error);
      }
    }
  }

  return {
    mode: "browser",

    async start() {
      if (running) return;

      running = true;
      generation += 1;

      clearRestartTimer();

      /*
       * Start the recognition immediately.
       */
      buildAndStart();

      /*
       * Start the microphone level meter separately.
       */
      void startLevelMeter(callbacks.onLevel);
    },

    stop() {
      running = false;
      generation += 1;

      clearRestartTimer();

      stopLevelMeter();

      const current = recognition;

      recognition = null;

      if (current) {
        current.onresult = null;
        current.onerror = null;
        current.onend = null;
        current.onstart = null;

        try {
          current.abort();
        } catch {
          // Ignore shutdown errors.
        }
      }

      callbacks.onStateChange?.(false);
    },

    setLanguage(bcp47: string, _sttCode: string) {
      language = bcp47;

      if (!running) return;

      /*
       * Recreate recognition with the new language.
       */
      generation += 1;

      clearRestartTimer();

      buildAndStart();
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Server STT                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Server STT:
 * captures PCM through the Web Audio API and uploads a complete WAV
 * every few seconds, so every upload is decodable.
 */
export function createServerStt(
  sttCode: string,
  transcribe: (
    payload: {
      audioBase64: string;
      mimeType: string;
      language: string;
    },
  ) => Promise<{ text: string }>,
  callbacks: SttCallbacks,
): SttEngine {
  let stream: MediaStream | null = null;
  let context: AudioContext | null = null;
  let processor: ScriptProcessorNode | null = null;
  let source: MediaStreamAudioSourceNode | null = null;

  let buffer: Float32Array[] = [];
  let timer: number | null = null;

  let language = sttCode;
  let running = false;

  let flushing = false;

  const flush = async () => {
    if (!running) return;
    if (flushing) return;
    if (buffer.length === 0 || !context) return;

    flushing = true;

    const chunks = buffer;
    buffer = [];

    const blob = encodeWav(chunks, context.sampleRate);

    if (blob.size < 4096) {
      flushing = false;
      return;
    }

    try {
      const base64 = await blobToBase64(blob);

      const { text } = await transcribe({
        audioBase64: base64,
        mimeType: "audio/wav",
        language,
      });

      if (running && text) {
        callbacks.onFinal(text);
      }
    } catch (error) {
      if (running) {
        callbacks.onError(
          (error as Error).message || "Speech transcription failed.",
        );
      }
    } finally {
      flushing = false;
    }
  };

  return {
    mode: "server",

    async start() {
      if (running) return;

      running = true;

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
      } catch {
        running = false;

        callbacks.onError(
          "Microphone access was blocked. Allow the microphone to talk to your assistant.",
        );

        return;
      }

      try {
        context = new AudioContext();

        if (context.state === "suspended") {
          await context.resume();
        }

        source = context.createMediaStreamSource(stream);

        processor = context.createScriptProcessor(
          4096,
          1,
          1,
        );

        processor.onaudioprocess = (event) => {
          if (!running) return;

          const input = event.inputBuffer.getChannelData(0);

          buffer.push(new Float32Array(input));

          let sum = 0;

          for (let i = 0; i < input.length; i += 1) {
            sum += input[i]! * input[i]!;
          }

          callbacks.onLevel(
            Math.min(
              1,
              Math.sqrt(sum / input.length) * 6,
            ),
          );
        };

        source.connect(processor);

        /*
         * ScriptProcessorNode requires a destination connection in some
         * browsers to continue processing.
         */
        processor.connect(context.destination);

        callbacks.onStateChange?.(true);

        /*
         * Upload a complete WAV every 3.5 seconds.
         */
        timer = window.setInterval(() => {
          void flush();
        }, 3500);
      } catch (error) {
        running = false;

        stream?.getTracks().forEach((track) => track.stop());
        stream = null;

        callbacks.onError(
          (error as Error).message ||
            "Could not initialize microphone audio.",
        );
      }
    },

    stop() {
      running = false;

      if (timer !== null) {
        window.clearInterval(timer);
      }

      timer = null;

      processor?.disconnect();
      processor = null;

      source?.disconnect();
      source = null;

      stream?.getTracks().forEach((track) => track.stop());
      stream = null;

      void context?.close().catch(() => undefined);
      context = null;

      buffer = [];
      flushing = false;

      callbacks.onStateChange?.(false);
    },

    setLanguage(_bcp47: string, code: string) {
      language = code;
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Shared microphone level meter                                               */
/* -------------------------------------------------------------------------- */

let meterStream: MediaStream | null = null;
let meterContext: AudioContext | null = null;
let meterFrame: number | null = null;

async function startLevelMeter(
  onLevel: (level: number) => void,
) {
  /*
   * Don't create multiple meter streams.
   */
  if (meterStream) return;

  try {
    meterStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });
  } catch {
    /*
     * SpeechRecognition itself can still work even when the visual
     * level-meter stream cannot be opened.
     */
    return;
  }

  try {
    meterContext = new AudioContext();

    if (meterContext.state === "suspended") {
      await meterContext.resume();
    }

    const source =
      meterContext.createMediaStreamSource(meterStream);

    const analyser = meterContext.createAnalyser();

    analyser.fftSize = 512;

    source.connect(analyser);

    const data = new Uint8Array(
      analyser.frequencyBinCount,
    );

    const tick = () => {
      if (!meterContext || !meterStream) {
        return;
      }

      analyser.getByteTimeDomainData(data);

      let sum = 0;

      for (let i = 0; i < data.length; i += 1) {
        const value = (data[i]! - 128) / 128;
        sum += value * value;
      }

      onLevel(
        Math.min(
          1,
          Math.sqrt(sum / data.length) * 5,
        ),
      );

      meterFrame = requestAnimationFrame(tick);
    };

    tick();
  } catch {
    stopLevelMeter();
  }
}

function stopLevelMeter() {
  if (meterFrame !== null) {
    cancelAnimationFrame(meterFrame);
  }

  meterFrame = null;

  meterStream?.getTracks().forEach((track) => track.stop());

  meterStream = null;

  void meterContext?.close().catch(() => undefined);

  meterContext = null;
}

/* -------------------------------------------------------------------------- */
/* WAV helpers                                                                 */
/* -------------------------------------------------------------------------- */

export function encodeWav(
  chunks: Float32Array[],
  sampleRate: number,
): Blob {
  const length = chunks.reduce(
    (total, chunk) => total + chunk.length,
    0,
  );

  const samples = new Float32Array(length);

  let offset = 0;

  for (const chunk of chunks) {
    samples.set(chunk, offset);
    offset += chunk.length;
  }

  const bufferLength = 44 + samples.length * 2;

  const view = new DataView(
    new ArrayBuffer(bufferLength),
  );

  const writeString = (
    position: number,
    text: string,
  ) => {
    for (let i = 0; i < text.length; i += 1) {
      view.setUint8(
        position + i,
        text.charCodeAt(i),
      );
    }
  };

  writeString(0, "RIFF");

  view.setUint32(
    4,
    bufferLength - 8,
    true,
  );

  writeString(8, "WAVE");

  writeString(12, "fmt ");

  view.setUint32(16, 16, true);

  view.setUint16(20, 1, true);

  view.setUint16(22, 1, true);

  view.setUint32(
    24,
    sampleRate,
    true,
  );

  view.setUint32(
    28,
    sampleRate * 2,
    true,
  );

  view.setUint16(32, 2, true);

  view.setUint16(34, 16, true);

  writeString(36, "data");

  view.setUint32(
    40,
    samples.length * 2,
    true,
  );

  let position = 44;

  for (let i = 0; i < samples.length; i += 1) {
    const sample = Math.max(
      -1,
      Math.min(1, samples[i]!),
    );

    view.setInt16(
      position,
      sample < 0
        ? sample * 0x8000
        : sample * 0x7fff,
      true,
    );

    position += 2;
  }

  return new Blob([view.buffer], {
    type: "audio/wav",
  });
}

export function blobToBase64(
  blob: Blob,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onloadend = () => {
      const result = String(reader.result);

      resolve(
        result.split(",")[1] ?? "",
      );
    };

    reader.onerror = () => {
      reject(
        new Error(
          "Could not read the recording.",
        ),
      );
    };

    reader.readAsDataURL(blob);
  });
}

/* -------------------------------------------------------------------------- */
/* Wake phrase                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Wake-phrase matcher — works for any nickname the user sets.
 *
 * Examples:
 *   "hey nayak"
 *   "hi nayak"
 *   "hello nayak"
 *   "okay nayak"
 */
export function matchesWakePhrase(
  transcript: string,
  nickname: string,
): boolean {
  const normalized = normalizeWakeText(transcript);
  const name = normalizeWakeText(nickname);

  if (!name) return false;

  /*
   * The configured nickname remains authoritative. We also tolerate
   * common speech-to-text distortions (for example "Remi" -> "redmi")
   * without making arbitrary spoken words wake the assistant.
   */
  const candidates = buildNicknameCandidates(name);
  const words = normalized.split(/\s+/).filter(Boolean);

  for (const candidate of candidates) {
    const escaped = escapeRegExp(candidate);

    // Normal wake phrase: "hey <nickname>", "hi <nickname>", etc.
    if (
      new RegExp(
        `\\b(hey|hi|hello|ok|okay)\\s+${escaped}\\b`,
        "u",
      ).test(normalized)
    ) {
      return true;
    }

    // Also accept the configured nickname by itself. This is useful
    // when browser STT drops "hey" or starts the transcript late.
    if (words.includes(candidate)) {
      return true;
    }
  }

  // Fuzzy matching for a single-word nickname. This handles small
  // STT spelling differences while keeping the wake trigger narrow.
  if (!name.includes(" ")) {
    for (const word of words) {
      if (isCloseNickname(word, name)) {
        return true;
      }
    }
  }

  return false;
}

export function stripWakePhrase(
  transcript: string,
  nickname: string,
): string {
  const original = transcript.trim();
  const normalized = normalizeWakeText(original);
  const name = normalizeWakeText(nickname);

  if (!name) return original;

  const candidates = buildNicknameCandidates(name);

  // First remove the normal "hey/hi/hello/ok/okay <nickname>" form.
  for (const candidate of candidates) {
    const prefix = new RegExp(
      `^\\s*(hey|hi|hello|ok|okay)\\s+${escapeRegExp(candidate)}[,.!?]*\\s*`,
      "iu",
    );

    if (prefix.test(normalized)) {
      return normalized.replace(prefix, "").trim();
    }
  }

  // If STT dropped "hey", remove the nickname when it is the first word.
  for (const candidate of candidates) {
    const nicknamePrefix = new RegExp(
      `^\\s*${escapeRegExp(candidate)}[,.!?]*\\s*`,
      "iu",
    );

    if (nicknamePrefix.test(normalized)) {
      return normalized.replace(nicknamePrefix, "").trim();
    }
  }

  // Fuzzy single-word nickname at the start, e.g. "redmi find hotel"
  // for configured nickname "Remi".
  if (!name.includes(" ")) {
    const words = normalized.split(/\s+/).filter(Boolean);

    if (words.length > 0 && isCloseNickname(words[0]!, name)) {
      return words.slice(1).join(" ").trim();
    }
  }

  return original;
}

function normalizeWakeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildNicknameCandidates(name: string): string[] {
  const candidates = new Set<string>([name]);

  // Useful for short/common assistant names that browser STT commonly
  // renders with a nearby spelling.
  const compact = name.replace(/\s+/g, "");

  if (compact === "remi") {
    candidates.add("remy");
    candidates.add("remmy");
    candidates.add("remie");
    candidates.add("redmi");
  }

  if (compact === "remy") {
    candidates.add("remi");
    candidates.add("remmy");
    candidates.add("remie");
    candidates.add("redmi");
  }

  if (compact === "remmy" || compact === "remie" || compact === "redmi") {
    candidates.add("remi");
    candidates.add("remy");
    candidates.add("remmy");
    candidates.add("remie");
    candidates.add("redmi");
  }

  // Additional assistant wake aliases requested by the user.
  // Keep the configured nickname above so custom nicknames still work.
  candidates.add("rami");
  candidates.add("ram");
  candidates.add("hear me");

  return [...candidates];
}

function isCloseNickname(word: string, name: string): boolean {
  if (!word || !name) return false;
  if (word === name) return true;

  // Only allow small edits for reasonably short names. This prevents
  // ordinary conversation from accidentally becoming a wake phrase.
  if (name.length < 3 || word.length < 3) return false;

  const maxDistance = name.length <= 5 ? 1 : 2;
  if (Math.abs(word.length - name.length) > maxDistance) return false;

  return levenshteinDistance(word, name) <= maxDistance;
}

function levenshteinDistance(a: string, b: string): number {
  const previous = Array.from(
    { length: b.length + 1 },
    (_, index) => index,
  );

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];

    for (let j = 1; j <= b.length; j += 1) {
      const insertion = current[j - 1]! + 1;
      const deletion = previous[j]! + 1;
      const substitution =
        previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1);

      current[j] = Math.min(
        insertion,
        deletion,
        substitution,
      );
    }

    for (let j = 0; j < current.length; j += 1) {
      previous[j] = current[j]!;
    }
  }

  return previous[b.length]!;
}

function escapeRegExp(value: string): string {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
}