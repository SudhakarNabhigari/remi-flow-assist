import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Languages, Mic, Sparkles } from "lucide-react";

import { AppShell } from "@/components/rimeflow/AppShell";
import { VoiceOrb } from "@/components/rimeflow/VoiceOrb";
import { Waveform } from "@/components/rimeflow/Waveform";
import { Button } from "@/components/ui/button";
import { getLanguage, type LanguageCode } from "@/lib/rimeflow/config";
import { useRimeFlow } from "@/lib/rimeflow/store";
import { useVoiceEngine } from "@/lib/rimeflow/useVoiceEngine";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "RimeFlow — Talk to Remi, your real-time voice assistant" },
      {
        name: "description",
        content:
          "RimeFlow is a real-time multilingual voice assistant with instant interruption handling, powered by Rime speech.",
      },
      { property: "og:title", content: "RimeFlow — Talk to Remi" },
      {
        property: "og:description",
        content: "Speak naturally in English, Telugu or Hindi. Interrupt any time — Remi adapts instantly.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HomeRoute,
});

function HomeRoute() {
  return (
    <AppShell>
      <Home />
    </AppShell>
  );
}

function Home() {
  const { displayName, settings, session, updateSettings } = useRimeFlow();

  const handleLanguageDetected = useCallback(
    (language: LanguageCode) => {
      void updateSettings({ language });
    },
    [updateSettings],
  );

  const engine = useVoiceEngine(settings, session?.user.id ?? null, handleLanguageDetected);
  const [greeted, setGreeted] = useState(false);
  const greetRef = useRef(false);
  const armedRef = useRef(false);

  useEffect(() => {
    if (greetRef.current) return;
    greetRef.current = true;
    setGreeted(true);
  }, []);

  // Auto-ready: the microphone arms itself as soon as you are signed in.
  const startRef = useRef(engine.start);
  startRef.current = engine.start;

  useEffect(() => {
    if (!session || !settings.autoListening || armedRef.current) return;
    armedRef.current = true;
    const timer = window.setTimeout(() => void startRef.current(), 600);
    // Browsers that require a gesture before capturing audio get one retry.
    const retry = () => void startRef.current();
    window.addEventListener("pointerdown", retry, { once: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", retry);
    };
  }, [session, settings.autoListening]);

  const lang = getLanguage(settings.language);

  const toggle = () => {
    if (engine.listening) engine.stop();
    else void engine.start();
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 py-12">
      {!settings.reducedMotion && (
        <>
          <div className="pointer-events-none absolute -left-32 top-10 h-80 w-80 rounded-full bg-primary/10 blur-3xl animate-float-slow" />
          <div className="pointer-events-none absolute -right-24 bottom-0 h-96 w-96 rounded-full bg-primary/10 blur-3xl animate-float-slower" />
        </>
      )}

      <header className={greeted ? "animate-fade-in text-center" : "text-center opacity-0"}>
        <p className="text-xs font-semibold uppercase tracking-[0.32em] text-primary/70">RimeFlow · Live</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight md:text-5xl">
          Hello, <span className="text-gradient-blue">{displayName}</span>
        </h1>
        <p className="mt-3 max-w-md text-sm text-muted-foreground md:text-base">
          Say “hey {settings.nickname}” to start. Speak English, Telugu or Hindi — I answer in whichever
          language you use, and you can interrupt me any time.
        </p>
      </header>

      <VoiceOrb
        state={engine.state}
        listening={engine.listening}
        level={engine.level}
        reducedMotion={settings.reducedMotion}
        onToggle={toggle}
      />

      <div className="w-full max-w-xl">
        <Waveform state={engine.state} level={engine.level} reducedMotion={settings.reducedMotion} />
      </div>

      <div className="mt-2 min-h-[3.5rem] w-full max-w-xl text-center">
        {engine.partial ? (
          <p className="animate-fade-in text-sm text-muted-foreground">“{engine.partial}”</p>
        ) : engine.lastReply ? (
          <p className="animate-fade-in text-base font-medium">{engine.lastReply}</p>
        ) : (
          <p className="text-sm text-muted-foreground">Try: “hey {settings.nickname}, {lang.sampleUtterance}”</p>
        )}
      </div>

      {engine.error && (
        <div className="mt-2 flex max-w-xl items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{engine.error}</span>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
        <Badge>
          <Mic className="mr-1 inline h-3 w-3" />
          {engine.listening ? "Always-on mic" : "Mic idle"}
        </Badge>
        <Badge>
          <Languages className="mr-1 inline h-3 w-3" />
          Auto language · {getLanguage(engine.spokenLanguage).label}
        </Badge>
        <Badge>
          {engine.sttMode === "browser" ? "Browser speech" : engine.sttMode === "server" ? "Server speech" : "No mic"}
        </Badge>
        {engine.providerInfo.provider && (
          <Badge>
            {engine.providerInfo.provider === "rime" ? "Rime voice" : "Fallback voice"}
            {engine.providerInfo.speaker ? ` · ${engine.providerInfo.speaker}` : ""}
          </Badge>
        )}
      </div>

      {engine.providerInfo.fallbackReason && (
        <p className="mt-3 max-w-xl text-center text-xs text-warning">
          Rime unavailable: {engine.providerInfo.fallbackReason}
        </p>
      )}
      {engine.providerInfo.availabilityNote && (
        <p className="mt-1 max-w-xl text-center text-xs text-warning">{engine.providerInfo.availabilityNote}</p>
      )}

      <div className="mt-8 flex gap-3">
        <Button
          variant="outline"
          className="card-lift"
          onClick={() => void engine.speakOnce(`Hi ${displayName}, I am ${settings.nickname}. How can I help?`)}
        >
          <Sparkles className="mr-2 h-4 w-4" />
          Hear {settings.nickname}
        </Button>
        {engine.state === "SPEAKING" && (
          <Button variant="secondary" onClick={engine.stopSpeaking}>
            Stop
          </Button>
        )}
      </div>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-border bg-card px-3 py-1 font-medium text-foreground/80 shadow-sm">
      {children}
    </span>
  );
}
