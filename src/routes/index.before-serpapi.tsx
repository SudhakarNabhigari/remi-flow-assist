import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ExternalLink, Hotel, Languages, MapPin, Mic, Sparkles, Star, X } from "lucide-react";

import { AppShell } from "@/components/rimeflow/AppShell";
import { VoiceOrb } from "@/components/rimeflow/VoiceOrb";
import { Waveform } from "@/components/rimeflow/Waveform";
import { Button } from "@/components/ui/button";
import { getLanguage, type LanguageCode } from "@/lib/rimeflow/config";
import { useRimeFlow } from "@/lib/rimeflow/store";
import { useVoiceEngine } from "@/lib/rimeflow/useVoiceEngine";

export const Route = createFileRoute("/index/before-serpapi")({
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

const HOTEL_QUERY =
  /\b(hotel|hotels|villa|villas|resort|resorts|room|rooms|stay|stays|apartment|apartments|accommodation|booking|book a stay)\b/i;

function getHotelDestination(query: string) {
  const inMatch = query.match(
    /\b(?:in|at|near|around)\s+([^,.!?]+?)(?:\s+(?:today|tomorrow|tonight|now|this weekend|next weekend)\b|[,.!?]|$)/i,
  );

  if (inMatch?.[1]?.trim()) {
    return inMatch[1].trim();
  }

  const cleaned = query
    .replace(
      /\b(book|find|search|show|suggest|need|want|a|an|the|me|for)\b/gi,
      " ",
    )
    .replace(
      /\b(hotel|hotels|villa|villas|resort|resorts|room|rooms|stay|stays|apartment|apartments|accommodation|booking)\b/gi,
      " ",
    )
    .replace(
      /\b(today|tomorrow|tonight|now|this weekend|next weekend)\b/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || "your destination";
}

function HotelSidePanel({
  query,
  onClose,
}: {
  query: string;
  onClose: () => void;
}) {
  const destination = getHotelDestination(query);

  const bookingUrl =
    `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(destination)}` +
    `&group_adults=2&no_rooms=1&group_children=0&lang=en-us`;

  const stays = [
    {
      label: "Stay Option A",
      price: "?6,400",
      rating: "4.6",
    },
    {
      label: "Stay Option B",
      price: "?8,900",
      rating: "4.8",
    },
  ];

  return (
    <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[440px] flex-col border-l border-border bg-background/95 shadow-2xl backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <Hotel className="h-5 w-5 text-primary" />
            <h2 className="font-bold">Hotel suggestions</h2>
          </div>

          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" />
            {destination}
          </p>
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close hotel panel"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-3 overflow-y-auto p-5">
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
          <p className="text-sm font-semibold">Your request</p>
          <p className="mt-1 text-sm text-muted-foreground">
            ?{query}?
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {stays.map((stay) => (
            <div
              key={stay.label}
              className="rounded-2xl border border-border bg-card p-4 shadow-sm"
            >
              <div className="flex h-20 items-center justify-center rounded-xl bg-primary/10">
                <Hotel className="h-8 w-8 text-primary" />
              </div>

              <p className="mt-3 font-semibold">{stay.label}</p>

              <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>{stay.price}/night</span>

                <span className="flex items-center gap-1">
                  <Star className="h-3 w-3 fill-current" />
                  {stay.rating}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <p className="text-sm font-semibold">
                Live hotel search
              </p>

              <p className="text-xs text-muted-foreground">
                Booking.com ? {destination}
              </p>
            </div>

            <a
              href={bookingUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted"
            >
              Open
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          <iframe
            title={`Hotel search for ${destination}`}
            src={bookingUrl}
            className="h-[430px] w-full bg-background"
            loading="lazy"
          />

          <p className="px-4 py-3 text-xs text-muted-foreground">
            If the hotel site blocks embedded viewing, use Open above
            to continue in a new tab.
          </p>
        </div>
      </div>
    </aside>
  );
}

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

  const engine = useVoiceEngine(
    settings,
    session?.user.id ?? null,
    handleLanguageDetected,
  );

  const [hotelQuery, setHotelQuery] = useState("");
  const [hotelPanelOpen, setHotelPanelOpen] = useState(false);

  /*
   * Automatically open the hotel side panel whenever
   * Remi receives a hotel/stay/booking request.
   */
  useEffect(() => {
    const query = engine.lastUser.trim();

    if (!query || !HOTEL_QUERY.test(query)) {
      return;
    }

    setHotelQuery(query);
    setHotelPanelOpen(true);
  }, [engine.lastUser]);
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

      {hotelPanelOpen && hotelQuery && (
        <HotelSidePanel
          query={hotelQuery}
          onClose={() => setHotelPanelOpen(false)}
        />
      )}
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
