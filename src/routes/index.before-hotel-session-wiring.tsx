import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ExternalLink, Hotel, Languages, MapPin, Mic, Sparkles, Star, X } from "lucide-react";

import { AppShell } from "@/components/rimeflow/AppShell";
import { VoiceOrb } from "@/components/rimeflow/VoiceOrb";
import { Waveform } from "@/components/rimeflow/Waveform";
import { Button } from "@/components/ui/button";
import { runStayLookup } from "@/lib/rimeflow/voice.functions";
import {
  clearHotelSession,
  findHotelByName,
  getHotelSession,
  selectBestHotel,
  selectHotel,
  setHotelPriceRange,
} from "@/lib/rimeflow/hotelSession";
import { getLanguage, type LanguageCode } from "@/lib/rimeflow/config";
import { useRimeFlow } from "@/lib/rimeflow/store";
import { useVoiceEngine } from "@/lib/rimeflow/useVoiceEngine";

export const Route = createFileRoute("/index/before-hotel-session-wiring")({
  head: () => ({
    meta: [
      { title: "RimeFlow - Talk to Remi, your real-time voice assistant" },
      {
        name: "description",
        content:
          "RimeFlow is a real-time multilingual voice assistant with instant interruption handling, powered by Rime speech.",
      },
      { property: "og:title", content: "RimeFlow - Talk to Remi" },
      {
        property: "og:description",
        content: "Speak naturally in English. Interrupt Remi at any time and get voice-first answers.",
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
    /\b(?:in|at|near)\s+([^,.!?;]+?)(?=\s+(?:around|under|below|less than|up to|upto|within|budget|price|rating|rated|stars?|reviews?|reviewed|free cancellation|refundable|beach|sea|pool|breakfast)\b|[,.!?;]|$)/i,
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
      /\b(around|under|below|less than|up to|upto|within|budget|price)\b/gi,
      " ",
    )
    .replace(
      /\b(today|tomorrow|tonight|now|this weekend|next weekend)\b/gi,
      " ",
    )
    .replace(
      /\b(?:rs\.?|inr)\s*[\d,]+(?:\.\d+)?\b/gi,
      " ",
    )
    .replace(
      /\b\d[\d,]*(?:\.\d+)?\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();

  return cleaned;
}

type HotelResult = {
  name: string;
  type: string;
  description: string;
  link: string | null;
  image: string | null;
  price: number | null;
  rating: number | null;
  reviews: number;
  locationRating: number | null;
  amenities: string[];
  beach: boolean;
  freeCancellation: boolean;
  prices: Array<{
    source: string;
    link: string | null;
    price: number | null;
  }>;
};

function HotelSidePanel({
  query,
  onClose,
  onResultsChange,
}: {
  query: string;
  onClose: () => void;
  onResultsChange: (
    results: HotelResult[],
  ) => void;
}) {
  const destination =
    getHotelDestination(query);

  const [results, setResults] =
    useState<HotelResult[]>([]);

  const [totalResults, setTotalResults] =
    useState(0);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const [requirements, setRequirements] =
    useState<{
      maxPrice: number | null;
      minRating: number | null;
      nearBeach: boolean;
      freeCancellation: boolean;
      sortByReviews: boolean;
    } | null>(null);

  useEffect(() => {
    let cancelled = false;

    setError(null);

if (!destination) {
  setLoading(false);
  setResults([]);
setTotalResults(0);
setRequirements(null);
onResultsChange([]);

  return () => {
    cancelled = true;
  };
}

setLoading(true);

void runStayLookup({
      data: {
        query,
        delayMs: 0,
      },
    })
      .then((response) => {
        if (cancelled) return;

        const nextResults =
  response.results as HotelResult[];

setResults(nextResults);
onResultsChange(nextResults);

        setTotalResults(
          response.totalResults,
        );

        setRequirements(
          response.requirements,
        );
      })
      .catch((caught) => {
        if (cancelled) return;

        setError(
          caught instanceof Error
            ? caught.message
            : String(caught),
        );

        setResults([]);
        onResultsChange([]);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [query]);

  const formatPrice = (
    price: number | null,
  ) => {
    if (price === null) {
      return "Price unavailable";
    }

    return `Rs ${price.toLocaleString("en-IN")}`;
  };

  return (
    <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[620px] flex-col border-l border-border bg-background shadow-2xl lg:w-[620px]">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <Hotel className="h-5 w-5 text-primary" />

            <h2 className="font-bold">
              Remi Hotel Search
            </h2>
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

      <div className="border-b border-border bg-muted/30 px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Your requirements
        </p>

        <p className="mt-1 text-sm">
          {query}
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          {requirements?.maxPrice !== null &&
            requirements?.maxPrice !== undefined && (
              <Badge>
  Up to Rs {requirements.maxPrice.toLocaleString("en-IN")}
</Badge>
            )}

          {requirements?.minRating !== null &&
            requirements?.minRating !== undefined && (
              <Badge>
  {requirements.minRating}+ rating
</Badge>
            )}

          {requirements?.nearBeach && (
            <Badge>
  Near beach
</Badge>
          )}

          {requirements?.sortByReviews && (
            <Badge>
              Most reviewed
            </Badge>
          )}

          {requirements?.freeCancellation && (
            <Badge>
              Free cancellation
            </Badge>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {loading && (
          <div className="flex min-h-[300px] items-center justify-center">
            <div className="text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />

              <p className="mt-3 text-sm font-medium">
                Searching Google Hotels...
              </p>

              <p className="mt-1 text-xs text-muted-foreground">
                Comparing available hotel options
              </p>
            </div>
          </div>
        )}

        {error && !loading && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
            <p className="font-semibold text-destructive">
              Hotel search failed
            </p>

            <p className="mt-1 text-sm text-muted-foreground">
              {error}
            </p>
          </div>
        )}

        {!loading &&
          !error &&
          results.length > 0 && (
            <>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="font-bold">
                    {destination} hotels
                  </p>

                  <p className="text-xs text-muted-foreground">
                    {totalResults.toLocaleString("en-IN")}+
                    matching results
                  </p>
                </div>

                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                  AI shortlisted
                </span>
              </div>

              <div className="space-y-4">
                {results.map(
                  (hotel, index) => (
                    <div
                      key={`${hotel.name}-${index}`}
                      className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition hover:shadow-md"
                    >
                      <div className="flex flex-col sm:flex-row">
                        {hotel.image ? (
  <img
    src={hotel.image}
    alt={hotel.name}
    className="h-48 w-full object-cover sm:h-auto sm:w-40"
    loading="lazy"
    onError={(event) => {
      event.currentTarget.style.display = "none";
      event.currentTarget.nextElementSibling?.classList.remove(
        "hidden",
      );
    }}
  />
) : null}

<div
  className={`${
    hotel.image ? "hidden" : ""
  } flex h-40 w-full items-center justify-center bg-primary/10 sm:w-40`}
>
  <Hotel className="h-10 w-10 text-primary" />
</div>

                        <div className="min-w-0 flex-1 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-bold">
                                {hotel.name}
                              </p>

                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                                {hotel.rating !== null && (
                                  <span className="font-semibold">
                                    ? {hotel.rating.toFixed(1)}
                                  </span>
                                )}

                                <span className="text-muted-foreground">
                                  {hotel.reviews.toLocaleString(
                                    "en-IN",
                                  )}{" "}
                                  reviews
                                </span>

                                {hotel.beach && (
                                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                                    Beach access
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="shrink-0 text-right">
                              <p className="text-lg font-black">
                                {formatPrice(
                                  hotel.price,
                                )}
                              </p>

                              <p className="text-[11px] text-muted-foreground">
                                per night
                              </p>
                            </div>
                          </div>

                          {hotel.description && (
                            <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                              {hotel.description}
                            </p>
                          )}

                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {hotel.amenities
                              .slice(0, 5)
                              .map((amenity) => (
                                <span
                                  key={amenity}
                                  className="rounded-full border border-border px-2 py-1 text-[10px] text-muted-foreground"
                                >
                                  {amenity}
                                </span>
                              ))}

                            {hotel.freeCancellation && (
                              <span className="rounded-full border border-border px-2 py-1 text-[10px] font-semibold">
                                Free cancellation
                              </span>
                            )}
                          </div>

                          {hotel.prices.length > 0 && (
                            <div className="mt-3 rounded-xl bg-muted/40 p-3">
                              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                Compare prices
                              </p>

                              <div className="flex flex-wrap gap-2">
                                {hotel.prices.map(
                                  (source) => (
                                    <a
                                      key={`${hotel.name}-${source.source}`}
                                      href={
                                        source.link ??
                                        hotel.link ??
                                        "#"
                                      }
                                      target="_blank"
                                      rel="noreferrer"
                                      className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] font-semibold hover:bg-muted"
                                    >
                                      {source.source}
                                      {source.price !== null
                                        ? ` ? ?${source.price.toLocaleString("en-IN")}`
                                        : ""}
                                    </a>
                                  ),
                                )}
                              </div>
                            </div>
                          )}

                          <div className="mt-3 flex justify-end">
                            {hotel.link && (
                              <a
                                href={hotel.link}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
                              >
                                View hotel
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ),
                )}
              </div>
            </>
          )}

        {!loading &&
          !error &&
          results.length === 0 && (
            <div className="rounded-2xl border border-border p-6 text-center">
              <Hotel className="mx-auto h-10 w-10 text-muted-foreground" />

              <p className="mt-3 font-semibold">
                No matching hotels found
              </p>

              <p className="mt-1 text-sm text-muted-foreground">
                Try increasing your budget or relaxing
                the rating/location requirements.
              </p>
            </div>
          )}
      </div>

      <div className="border-t border-border px-5 py-3">
        <p className="text-center text-[11px] text-muted-foreground">
          Prices and availability come from Google Hotels
          search data via SerpApi and may change before booking.
        </p>
      </div>
    </aside>
  );
}


function GeneralSidePanel({
  question,
  answer,
  partial,
}: {
  question: string;
  answer: string;
  partial: string;
}) {
  const visibleQuestion = partial.trim() || question.trim();

  return (
    <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[520px] flex-col border-l border-border bg-background/95 shadow-2xl backdrop-blur-xl">
      <div className="border-b border-border px-6 py-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-primary">
          General Mode
        </p>
        <h2 className="mt-1 text-xl font-black">
          Remi Conversation
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Your latest question and Remi response appear here.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6">
        {visibleQuestion && (
          <section className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
              You
            </p>
            <p className="mt-2 text-sm font-medium leading-6">
              {visibleQuestion}
            </p>

            {partial.trim() && (
              <p className="mt-2 text-xs text-muted-foreground">
                Listening...
              </p>
            )}
          </section>
        )}

        <section className="mt-4 rounded-2xl border border-border bg-card p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
            Remi
          </p>

          {answer.trim() ? (
            <p className="mt-2 text-sm leading-6">
              {answer}
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Remi is preparing the answer...
            </p>
          )}
        </section>
      </div>

      <div className="border-t border-border px-5 py-4">
        <p className="text-center text-[11px] text-muted-foreground">
          Speak naturally. You can interrupt at any time.
        </p>
      </div>
    </aside>
  );
}

function HotelModeIntro({
  onSpeak,
  onFinished,
}: {
  onSpeak: () => void;
  onFinished: () => void;
}) {
  const callbacksRef = useRef({ onSpeak, onFinished });

  useEffect(() => {
    callbacksRef.current = { onSpeak, onFinished };
  }, [onSpeak, onFinished]);

  useEffect(() => {
    const voiceTimer = window.setTimeout(() => {
      callbacksRef.current.onSpeak();
    }, 850);

    const finishTimer = window.setTimeout(() => {
      callbacksRef.current.onFinished();
    }, 3200);

    return () => {
      window.clearTimeout(voiceTimer);
      window.clearTimeout(finishTimer);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden">
      <style>{`
        @keyframes remiHotelOverlay {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes remiHotelCard {
          from {
            opacity: 0;
            transform: translateY(34px) scale(0.92);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes remiHotelIcon {
          0% {
            opacity: 0;
            transform: translateY(22px) scale(0.72) rotate(-8deg);
          }
          60% {
            transform: translateY(-5px) scale(1.04) rotate(2deg);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1) rotate(0);
          }
        }

        @keyframes remiHotelFadeUp {
          from {
            opacity: 0;
            transform: translateY(18px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes remiHotelRing {
          0% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.55);
          }
          35% {
            opacity: 0.8;
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(1.3);
          }
        }

        @keyframes remiHotelPulse {
          0%,
          100% {
            transform: scale(1);
            opacity: 0.55;
          }
          50% {
            transform: scale(1.12);
            opacity: 1;
          }
        }

        @keyframes remiHotelShine {
          0% {
            transform: translateX(-130%);
          }
          100% {
            transform: translateX(130%);
          }
        }
      `}</style>

      {/* Background */}
      <div
        className="absolute inset-0 bg-background/95 backdrop-blur-xl"
        style={{
          animation: "remiHotelOverlay 500ms ease-out both",
        }}
      />

      {/* Blue atmospheric glow */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/15 blur-[100px]" />

      <div className="pointer-events-none absolute left-[18%] top-[20%] h-64 w-64 rounded-full bg-primary/10 blur-[90px]" />

      <div className="pointer-events-none absolute bottom-[10%] right-[15%] h-72 w-72 rounded-full bg-primary/10 blur-[100px]" />

      {/* Expanding rings */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[28rem] w-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/20"
        style={{
          animation:
            "remiHotelRing 2.8s ease-out 200ms both",
        }}
      />

      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[20rem] w-[20rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/15"
        style={{
          animation:
            "remiHotelRing 2.4s ease-out 500ms both",
        }}
      />

      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[13rem] w-[13rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/10"
        style={{
          animation:
            "remiHotelRing 2s ease-out 800ms both",
        }}
      />

      {/* Main card */}
      <div className="relative flex min-h-full items-center justify-center px-6 py-10">
        <div
          className="relative w-full max-w-3xl overflow-hidden rounded-[36px] border border-primary/20 bg-card/70 p-9 text-center shadow-[0_25px_100px_rgba(0,0,0,0.45)] backdrop-blur-2xl md:p-14"
          style={{
            animation:
              "remiHotelCard 850ms cubic-bezier(.2,.75,.25,1) both",
          }}
        >
          {/* Card glow */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(50,150,255,0.20),transparent_55%)]" />

          {/* Moving shine */}
          <div className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/5 to-transparent blur-xl">
            <div
              className="h-full w-full"
              style={{
                animation:
                  "remiHotelShine 2.8s ease-in-out 700ms both",
              }}
            />
          </div>

          {/* Hotel icon */}
          <div
            className="relative mx-auto flex h-28 w-28 items-center justify-center rounded-[32px] border border-primary/30 bg-primary/10 shadow-[0_0_90px_rgba(50,150,255,0.30)]"
            style={{
              animation:
                "remiHotelIcon 850ms cubic-bezier(.2,.75,.25,1) 200ms both",
            }}
          >
            <div className="absolute inset-3 rounded-[24px] bg-primary/10 animate-pulse" />

            <svg
              viewBox="0 0 64 64"
              className="relative h-14 w-14 text-primary"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M10 54h44" />
              <path d="M15 54V18h34v36" />
              <path d="M20 18V11h24v7" />
              <path d="M22 25h4" />
              <path d="M30 25h4" />
              <path d="M38 25h4" />
              <path d="M22 33h4" />
              <path d="M30 33h4" />
              <path d="M38 33h4" />
              <path d="M22 41h4" />
              <path d="M30 41h4" />
              <path d="M38 41h4" />
              <path d="M27 54V47h10v7" />
            </svg>
          </div>

          {/* Live label */}
          <p
            className="relative mt-8 text-[11px] font-bold uppercase tracking-[0.38em] text-primary/80"
            style={{
              animation:
                "remiHotelFadeUp 700ms ease-out 500ms both",
            }}
          >
            REMI FLOW - LIVE
          </p>

          {/* Main title */}
          <h2
            className="relative mt-4 text-4xl font-black leading-[0.95] tracking-tight md:text-6xl"
            style={{
              animation:
                "remiHotelFadeUp 800ms ease-out 650ms both",
            }}
          >
            WELCOME TO REMI
            <br />
            <span className="text-gradient-blue">
              HOTEL SUGGESTION MODE
            </span>
          </h2>

          {/* Description */}
          <p
            className="relative mx-auto mt-7 max-w-xl text-sm leading-7 text-muted-foreground md:text-base"
            style={{
              animation:
                "remiHotelFadeUp 800ms ease-out 850ms both",
            }}
          >
            Tell me your destination, budget, ratings, reviews,
            location preferences, or amenities and I&apos;ll help
            you find the right stay.
          </p>

          {/* Rime voice indicator */}
          <div
            className="relative mx-auto mt-9 inline-flex items-center gap-3 rounded-full border border-border bg-background/50 px-5 py-2.5 text-xs font-medium text-foreground/85 shadow-lg"
            style={{
              animation:
                "remiHotelFadeUp 800ms ease-out 1050ms both",
            }}
          >
            <span
              className="h-2.5 w-2.5 rounded-full bg-primary"
              style={{
                animation:
                  "remiHotelPulse 1.3s ease-in-out infinite",
              }}
            />
            <span>Rime voice - celeste</span>
          </div>

          {/* Bottom status */}
          <div
            className="relative mt-7 text-[11px] uppercase tracking-[0.25em] text-muted-foreground/60"
            style={{
              animation:
                "remiHotelFadeUp 700ms ease-out 1250ms both",
            }}
          >
            Finding stays for you
          </div>
        </div>
      </div>
    </div>
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
  const [hotelResults, setHotelResults] =
    useState<HotelResult[]>([]);

  const [selectedHotel, setSelectedHotel] =
    useState<HotelResult | null>(null);
  const [hotelPanelOpen, setHotelPanelOpen] = useState(false);
  const [hotelIntroVisible, setHotelIntroVisible] = useState(false);
  const [hotelIntroPlayed, setHotelIntroPlayed] = useState(false);
  const [conversationPanelOpen, setConversationPanelOpen] = useState(false);
  const [panelQuestion, setPanelQuestion] = useState("");
  const [panelAnswer, setPanelAnswer] = useState("");

  /*
   * Automatically open the hotel side panel whenever
   * Remi receives a hotel/stay/booking request.
   */
  useEffect(() => {
    const query = engine.lastUser.trim();

    if (!query) {
      return;
    }

    const isHotelCloseRequest =
      /\b(?:close|exit|hide|stop)\b.*\bhotel\b/i.test(query) ||
      /\bhotel\b.*\b(?:close|exit|hide|stop)\b/i.test(query);

    if (isHotelCloseRequest) {
      setHotelPanelOpen(false);
      setHotelIntroVisible(false);
      setHotelQuery("");
      setHotelIntroPlayed(false);
      setConversationPanelOpen(false);
      return;
    }

    const isNewHotelSearch =
  HOTEL_QUERY.test(query) &&
  /\b(in|at|near)\b/i.test(query);

const isHotelRequirement =
  /\b(under|below|less than|up to|around|within|budget|price|beach|sea|rating|rated|stars?|reviews?|reviewed|free cancellation|refundable|pool|breakfast|location|area|near)\b/i.test(
    query,
  );

const currentHotelDestination =
  getHotelDestination(hotelQuery);

const isDestinationFollowUp =
  hotelPanelOpen &&
  !currentHotelDestination &&
  !HOTEL_QUERY.test(query) &&
  /^[A-Za-z][A-Za-z .'-]{1,60}$/.test(query);

if (
  !isNewHotelSearch &&
  !(hotelPanelOpen && isHotelRequirement) &&
  !isDestinationFollowUp
) {
  return;
}

const enteringHotelMode =
  (isNewHotelSearch || isHotelRequirement) &&
  !hotelPanelOpen &&
  !hotelIntroPlayed;

setHotelQuery((previous) => {
  if (isNewHotelSearch || !previous) {
    return query;
  }

  if (isDestinationFollowUp) {
    return `${previous}; hotel in ${query}`;
  }

  return `${previous}; ${query}`;
});

setHotelPanelOpen(true);

if (enteringHotelMode) {
  setHotelIntroVisible(true);
  setHotelIntroPlayed(true);
}
  }, [
    engine.lastUser,
    hotelPanelOpen,
    hotelIntroPlayed,
  ]);
  useEffect(() => {
    const partialText = engine.partial.trim();
    const finalText = engine.lastUser.trim();

    if (partialText) {
      setConversationPanelOpen(true);
      setPanelQuestion(partialText);
      setPanelAnswer("");
      return;
    }

    if (finalText) {
      setConversationPanelOpen(true);
      setPanelQuestion(finalText);
      setPanelAnswer("");
    }
  }, [engine.partial, engine.lastUser]);

  useEffect(() => {
    const reply = engine.lastReply.trim();

    if (reply) {
      setPanelAnswer(reply);
    }
  }, [engine.lastReply]);
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
    <>
      <style>{`
        @keyframes hotelOverlayIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes hotelCardIn {
          from {
            opacity: 0;
            transform: translateY(28px) scale(0.94);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes hotelIconIn {
          from {
            opacity: 0;
            transform: translateY(24px) scale(0.76) rotate(-7deg);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1) rotate(0deg);
          }
        }

        @keyframes hotelFadeUp {
          from {
            opacity: 0;
            transform: translateY(18px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes hotelRing {
          from {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.65);
          }
          45% {
            opacity: 1;
          }
          to {
            opacity: 0;
            transform: translate(-50%, -50%) scale(1.25);
          }
        }
      `}</style>

      <div
  className={`relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 py-12 transition-all duration-300 ${
    hotelPanelOpen ? "lg:pr-[620px]" : "lg:pr-8"
  }`}
>
      {!settings.reducedMotion && (
        <>
          <div className="pointer-events-none absolute -left-32 top-10 h-80 w-80 rounded-full bg-primary/10 blur-3xl animate-float-slow" />
          <div className="pointer-events-none absolute -right-24 bottom-0 h-96 w-96 rounded-full bg-primary/10 blur-3xl animate-float-slower" />
        </>
      )}

      <header className={greeted ? "animate-fade-in text-center" : "text-center opacity-0"}>
        <p className="text-xs font-semibold uppercase tracking-[0.32em] text-primary/70">RimeFlow - Live</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight md:text-5xl">
          Hello, <span className="text-gradient-blue">{displayName}</span>
        </h1>
        <p className="mt-3 max-w-md text-sm text-muted-foreground md:text-base">
  Say "hey {settings.nickname}" to start. Speak naturally in English, and you can interrupt me at any time.
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
          Auto language -  {getLanguage(engine.spokenLanguage).label}
        </Badge>
        <Badge>
          {engine.sttMode === "browser" ? "Browser speech" : engine.sttMode === "server" ? "Server speech" : "No mic"}
        </Badge>
        {engine.providerInfo.provider && (
          <Badge>
            {engine.providerInfo.provider === "rime" ? "Rime voice" : "Fallback voice"}
            {engine.providerInfo.speaker ? ` ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â· ${engine.providerInfo.speaker}` : ""}
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

      {conversationPanelOpen &&
        !hotelPanelOpen &&
        !hotelIntroVisible && (
          <GeneralSidePanel
            question={panelQuestion}
            answer={panelAnswer}
            partial={engine.partial}
          />
        )}
      {hotelIntroVisible && (
        <HotelModeIntro
          onFinished={() => setHotelIntroVisible(false)}
          onSpeak={() =>
            void engine.speakOnce(
              "Welcome to Remi Hotel Suggestion Mode.",
            )
          }
        />
      )}

      {hotelPanelOpen && hotelQuery && (
        <HotelSidePanel
          query={hotelQuery}
          onClose={() => {
            setHotelPanelOpen(false);
            setHotelResults([]);
            setSelectedHotel(null);
          }}
          onResultsChange={setHotelResults}
        />
      )}
    </div>
    </>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-border bg-card px-3 py-1 font-medium text-foreground/80 shadow-sm">
      {children}
    </span>
  );
}
