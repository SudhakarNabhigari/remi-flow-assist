/**
 * Speech input with automatic path selection:
 *  1. Browser SpeechRecognition (continuous, full-duplex barge-in, wake word)
 *  2. Server streaming-model STT on complete WAV segments (fallback / Telugu, Hindi)
 *
 * The microphone is never released while the assistant speaks — that is what
 * makes barge-in possible.
 */

export type SttMode = "browser" | "server" | "unavailable";

interface RecognitionResultLike {
  0: { transcript: string };
  isFinal: boolean;
  length: number;
}
interface RecognitionEventLike {
  resultIndex: number;
  results: { length: number; [index: number]: RecognitionResultLike };
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
  if (getRecognitionCtor()) return "browser";
  if (typeof navigator !== "undefined" && navigator.mediaDevices) return "server";
  return "unavailable";
}

export interface SttCallbacks {
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onLevel: (level: number) => void;
  onError: (message: string) => void;
  onStateChange?: (listening: boolean) => void;
}

export interface SttEngine {
  mode: SttMode;
  start: () => Promise<void>;
  stop: () => void;
  setLanguage: (bcp47: string, sttCode: string) => void;
}

/** Browser continuous recognition; auto-restarts so listening is truly always-on. */
export function createBrowserStt(lang: string, callbacks: SttCallbacks): SttEngine {
  const Ctor = getRecognitionCtor()!;
  let recognition: RecognitionLike | null = null;
  let running = false;
  let language = lang;

  const build = () => {
    const r = new Ctor();
    r.lang = language;
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    r.onstart = () => callbacks.onStateChange?.(true);
    r.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]!;
        const transcript = result[0].transcript.trim();
        if (!transcript) continue;
        if (result.isFinal) callbacks.onFinal(transcript);
        else callbacks.onPartial(transcript);
      }
    };
    r.onerror = (event) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        running = false;
        callbacks.onError("Microphone access was blocked. Allow the microphone to talk to your assistant.");
        return;
      }
      callbacks.onError(`Speech recognition error: ${event.error}`);
    };
    r.onend = () => {
      callbacks.onStateChange?.(false);
      if (running) {
        window.setTimeout(() => {
          try {
            r.start();
          } catch {
            /* already started */
          }
        }, 250);
      }
    };
    return r;
  };

  return {
    mode: "browser",
    async start() {
      if (running) return;
      running = true;
      recognition = build();
      try {
        recognition.start();
      } catch {
        /* already started */
      }
      void startLevelMeter(callbacks.onLevel);
    },
    stop() {
      running = false;
      stopLevelMeter();
      recognition?.abort();
      recognition = null;
      callbacks.onStateChange?.(false);
    },
    setLanguage(bcp47) {
      language = bcp47;
      if (running && recognition) {
        recognition.abort();
        recognition = build();
        try {
          recognition.start();
        } catch {
          /* noop */
        }
      }
    },
  };
}

/**
 * Server STT: captures PCM through the Web Audio API and uploads a complete WAV
 * every few seconds, so every upload is decodable (no headerless fragments).
 */
export function createServerStt(
  sttCode: string,
  transcribe: (payload: { audioBase64: string; mimeType: string; language: string }) => Promise<{ text: string }>,
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

  const flush = async () => {
    if (buffer.length === 0 || !context) return;
    const chunks = buffer;
    buffer = [];
    const blob = encodeWav(chunks, context.sampleRate);
    if (blob.size < 4096) return;
    try {
      const base64 = await blobToBase64(blob);
      const { text } = await transcribe({ audioBase64: base64, mimeType: "audio/wav", language });
      if (text) callbacks.onFinal(text);
    } catch (error) {
      callbacks.onError((error as Error).message);
    }
  };

  return {
    mode: "server",
    async start() {
      if (running) return;
      running = true;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        running = false;
        callbacks.onError("Microphone access was blocked. Allow the microphone to talk to your assistant.");
        return;
      }
      context = new AudioContext();
      source = context.createMediaStreamSource(stream);
      processor = context.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0);
        buffer.push(new Float32Array(input));
        let sum = 0;
        for (let i = 0; i < input.length; i += 1) sum += input[i]! * input[i]!;
        callbacks.onLevel(Math.min(1, Math.sqrt(sum / input.length) * 6));
      };
      source.connect(processor);
      processor.connect(context.destination);
      callbacks.onStateChange?.(true);
      timer = window.setInterval(() => void flush(), 3500);
    },
    stop() {
      running = false;
      if (timer) window.clearInterval(timer);
      timer = null;
      processor?.disconnect();
      source?.disconnect();
      stream?.getTracks().forEach((t) => t.stop());
      void context?.close().catch(() => {});
      context = null;
      buffer = [];
      callbacks.onStateChange?.(false);
    },
    setLanguage(_bcp47, code) {
      language = code;
    },
  };
}

/* ---------- shared mic level meter for the browser path ---------- */

let meterStream: MediaStream | null = null;
let meterContext: AudioContext | null = null;
let meterFrame: number | null = null;

async function startLevelMeter(onLevel: (level: number) => void) {
  if (meterStream) return;
  try {
    meterStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    return;
  }
  meterContext = new AudioContext();
  const source = meterContext.createMediaStreamSource(meterStream);
  const analyser = meterContext.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  const data = new Uint8Array(analyser.frequencyBinCount);
  const tick = () => {
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i += 1) {
      const v = (data[i]! - 128) / 128;
      sum += v * v;
    }
    onLevel(Math.min(1, Math.sqrt(sum / data.length) * 5));
    meterFrame = requestAnimationFrame(tick);
  };
  tick();
}

function stopLevelMeter() {
  if (meterFrame) cancelAnimationFrame(meterFrame);
  meterFrame = null;
  meterStream?.getTracks().forEach((t) => t.stop());
  meterStream = null;
  void meterContext?.close().catch(() => {});
  meterContext = null;
}

/* ---------- helpers ---------- */

export function encodeWav(chunks: Float32Array[], sampleRate: number): Blob {
  const length = chunks.reduce((total, c) => total + c.length, 0);
  const samples = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    samples.set(chunk, offset);
    offset += chunk.length;
  }
  const bufferLength = 44 + samples.length * 2;
  const view = new DataView(new ArrayBuffer(bufferLength));
  const writeString = (pos: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(pos + i, text.charCodeAt(i));
  };
  writeString(0, "RIFF");
  view.setUint32(4, bufferLength - 8, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);
  let pos = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(pos, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    pos += 2;
  }
  return new Blob([view.buffer], { type: "audio/wav" });
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Could not read the recording."));
    reader.readAsDataURL(blob);
  });
}

/** Wake-phrase matcher — works for any nickname the user sets. */
export function matchesWakePhrase(transcript: string, nickname: string): boolean {
  const normalized = transcript.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ");
  const name = nickname.toLowerCase().trim();
  if (!name) return false;
  return new RegExp(`\\b(hey|hi|hello|ok|okay)\\s+${escapeRegExp(name)}\\b`, "u").test(normalized);
}

export function stripWakePhrase(transcript: string, nickname: string): string {
  const name = escapeRegExp(nickname.toLowerCase().trim());
  return transcript
    .replace(new RegExp(`^\\s*(hey|hi|hello|ok|okay)\\s+${name}[,.!]*\\s*`, "iu"), "")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
