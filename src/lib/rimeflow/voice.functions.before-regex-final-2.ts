import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  DEFAULT_TOOL_DELAY_MS,
  getLanguage,
  getVoiceCategory,
} from "./config";

/**
 * Server boundary for the voice pipeline.
 *
 * Responsibilities:
 * - Rime TTS
 * - Agent replies
 * - Delayed tool work
 * - Server-side STT
 *
 * Secrets are read only on the server and are never returned to the browser.
 */

/* -------------------------------------------------------------------------- */
/* SPEECH / RIME TTS                                                         */
/* -------------------------------------------------------------------------- */

const speakInput = z.object({
  text: z.string().min(1).max(2000),
  voiceCategory: z.string().default("conversational"),
  language: z.string().default("en"),
  speed: z.number().min(0.5).max(2).default(1),
});

export const speak = createServerFn({
  method: "POST",
})
  /**
   * TanStack Start now recommends validator() instead of inputValidator().
   */
  .validator((data: unknown) => speakInput.parse(data))
  .handler(async ({ data }) => {
    const {
      synthesizeSpeech,
      fetchRimeCatalog,
    } = await import("./rime.server");

    const category = getVoiceCategory(data.voiceCategory);

    let speaker = category.requestedRimeSpeaker;
    let categoryAvailable = true;
    let availabilityNote: string | null = null;

    /*
     * Always check the connected Rime catalogue.
     *
     * This prevents us from claiming that a speaker is available when
     * the connected Rime account does not actually expose it.
     */
    const catalog = await fetchRimeCatalog();

    if (catalog.reachable) {
      /*
       * If the requested speaker isn't available, use the first speaker
       * actually returned by the connected catalogue.
       *
       * This avoids using stale/invented speaker IDs.
       */
      if (speaker && !catalog.speakers.includes(speaker)) {
        categoryAvailable = false;

        availabilityNote =
          `UNAVAILABLE WITH CURRENT RIME CONFIGURATION â€” "${speaker}" is not in the connected Rime catalogue.`;

        speaker = catalog.speakers[0] ?? speaker;
      }

      /*
       * If the category doesn't specify a speaker at all, use the first
       * speaker from the live catalogue.
       */
      if (!speaker && catalog.speakers.length > 0) {
        speaker = catalog.speakers[0]!;
      }
    } else if (category.providerDependent) {
      categoryAvailable = false;

      availabilityNote =
        "UNAVAILABLE WITH CURRENT RIME CONFIGURATION â€” custom/cloned voices depend on the connected Rime account.";
    }

    /*
     * Rime is still the primary speech path.
     *
     * synthesizeSpeech() is responsible for:
     * - calling Rime
     * - returning Base64 audio
     * - disclosed fallback handling
     */
    const result = await synthesizeSpeech({
      text: data.text,
      speaker,
      language: data.language,
      speed: data.speed,
      fallbackVoice: category.fallbackVoice,
      ...(category.voiceInstructions
        ? {
            voiceInstructions: category.voiceInstructions,
          }
        : {}),
    });

    return {
      ...result,
      categoryAvailable,
      availabilityNote,
    };
  });

/* -------------------------------------------------------------------------- */
/* RIME STATUS                                                               */
/* -------------------------------------------------------------------------- */

export const getRimeStatus = createServerFn({
  method: "GET",
}).handler(async () => {
  const {
    readRimeConfig,
    fetchRimeCatalog,
  } = await import("./rime.server");

  const config = readRimeConfig();
  const catalog = await fetchRimeCatalog();

  return {
    configured: config.hasApiKey,

    endpoint: config.endpoint,
    model: config.model,
    speaker: config.speaker,
    language: config.language,
    region: config.region,
    audioFormat: config.audioFormat,
    transport: config.transport,

    catalogReachable: catalog.reachable,
    catalogSpeakerCount: catalog.speakers.length,
    catalogSpeakers: catalog.speakers.slice(0, 40),
    catalogError: catalog.error,

    verifiedAt: new Date().toISOString(),
  };
});

/* -------------------------------------------------------------------------- */
/* AGENT REPLY                                                               */
/* -------------------------------------------------------------------------- */

const agentInput = z.object({
  utterance: z.string().min(1).max(2000),

  language: z.string().default("en"),

  nickname: z.string().default("Remi"),

  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      }),
    )
    .max(12)
    .default([]),

  /*
   * Used by interruption/recovery logic.
   *
   * If a user interrupts an older request, the latest request becomes
   * authoritative.
   */
  supersedes: z.string().nullable().default(null),
});

/**
 * LLM turn.
 *
 * Groq is the primary agent/brain.
 * Gemini remains responsible for server-side STT.
 */
export const agentReply = createServerFn({
  method: "POST",
})
  .validator((data: unknown) => agentInput.parse(data))
  .handler(async ({ data }) => {
    const key = process.env["GROQ_API_KEY"];

    if (!key) {
      throw new Error(
        "The assistant model is not configured. Add GROQ_API_KEY to the server .env file.",
      );
    }

    const language = getLanguage(data.language);

    const system = [
      `You are ${data.nickname}, the voice of RimeFlow — a realtime voice assistant.`,
      `Reply in ${language.label} only.`,
      `For normal informational questions, give a useful detailed answer of about 100 to 130 words.`,
      `Use 5 to 7 short spoken sentences.`,
      `Give the main idea first, then useful details and one simple real-world example when appropriate.`,
      `Use simple, conversational language that sounds natural when spoken aloud.`,
      `Do not give a one-line or very short answer unless the user explicitly asks for a short answer.`,
      `You are being spoken aloud: no markdown, no lists, no emoji, no stage directions.`,
      data.supersedes
        ? `The user just interrupted and replaced their previous request ("${data.supersedes}"). Acknowledge the change briefly and answer only the NEW request.`
        : "",
      `If the user asks for a booking or search, describe the useful result clearly.`,
    ]
      .filter(Boolean)
      .join(" ");

    const Groq = (await import("groq-sdk")).default;

    const groq = new Groq({
      apiKey: key,
    });

    const messages = [
      {
        role: "system" as const,
        content: system,
      },
      ...data.history.map((message) => ({
        role: message.role as "user" | "assistant",
        content: message.content,
      })),
      {
        role: "user" as const,
        content: data.utterance,
      },
    ];

    const completion = await groq.chat.completions.create({
      model: "openai/gpt-oss-20b",
      messages,
      temperature: 0.2,
      max_tokens: 180,
      include_reasoning: false,
    });

    const text =
      completion.choices[0]?.message?.content?.trim() ?? "";

    if (!text) {
      throw new Error(
        "The assistant returned an empty reply.",
      );
    }

    console.log("[GROQ_AGENT_REPLY]", {
      model: "openai/gpt-oss-20b",
      words: text.split(/\s+/).filter(Boolean).length,
      chars: text.length,
    });

    return {
      text,
      language: language.code,
    };
  });
/* -------------------------------------------------------------------------- */
/* DELAYED TOOL                                                               */
/* -------------------------------------------------------------------------- */

const toolInput = z.object({
  query: z.string().min(1).max(500),

  delayMs: z
    .number()
    .min(0)
    .max(30000)
    .default(DEFAULT_TOOL_DELAY_MS),
});

/* -------------------------------------------------------------------------- */
/* GOOGLE HOTELS / SERPAPI HELPERS                                           */
/* -------------------------------------------------------------------------- */

function extractNumber(value: string | undefined) {
  if (!value) return null;

  const number = Number(
    value.replace(/[^\d.]/g, ""),
  );

  return Number.isFinite(number)
    ? number
    : null;
}

function extractMaxPrice(query: string) {
  const match = query.match(
    /(?:under|below|less than|up to|upto|within|max(?:imum)?|budget(?:\s+is)?)\s*(?:?|rs\.?|inr)?\s*([\d,]+)/i,
  );

  return extractNumber(match?.[1]);
}

function extractMinRating(query: string) {
  const match = query.match(
    /(?:rating|rated|stars?)\s*(?:of\s*)?([3-5](?:\.\d)?)\s*\+?/i,
  );

  const direct = extractNumber(match?.[1]);

  if (direct !== null) return direct;

  if (/4\.5\s*\+/i.test(query)) return 4.5;
  if (/4\s*\+/i.test(query)) return 4;
  if (/3\.5\s*\+/i.test(query)) return 3.5;

  return null;
}

function extractDestination(query: string) {
  const matches = [
    ...query.matchAll(
      /\b(?:in|at|around)\s+([A-Za-z][A-Za-z .'-]{1,60}?)(?=\s+(?:tomorrow|today|tonight|under|below|less|up to|upto|with|and|near|for|on)\b|[,.!?;]|$)/gi,
    ),
  ];

  const destination =
    matches.at(-1)?.[1]?.trim();

  return destination || "";
}

function getIndiaDate(offsetDays: number) {
  const parts = new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    },
  ).formatToParts(new Date());

  const year = Number(
    parts.find((part) => part.type === "year")?.value,
  );

  const month = Number(
    parts.find((part) => part.type === "month")?.value,
  );

  const day = Number(
    parts.find((part) => part.type === "day")?.value,
  );

  const date = new Date(
    Date.UTC(year, month - 1, day),
  );

  date.setUTCDate(
    date.getUTCDate() + offsetDays,
  );

  return date.toISOString().slice(0, 10);
}

function extractHotelRequirements(query: string) {
  const normalized = query.toLowerCase();

  const destination =
    extractDestination(query);

  const maxPrice =
    extractMaxPrice(query);

  const minRating =
    extractMinRating(query);

  const nearBeach =
    /\b(beach|sea|seaside|coast|shore)\b/i.test(
      normalized,
    );

  const freeCancellation =
    /free cancellation|cancel for free|refundable/i.test(
      normalized,
    );

  const sortByReviews =
    /reviews?|most reviewed|best reviewed|highly reviewed/i.test(
      normalized,
    );

  const checkIn =
    /\btoday\b/i.test(normalized)
      ? getIndiaDate(0)
      : getIndiaDate(1);

  const checkOut =
    /\btoday\b/i.test(normalized)
      ? getIndiaDate(1)
      : getIndiaDate(2);

  return {
    destination,
    maxPrice,
    minRating,
    nearBeach,
    freeCancellation,
    sortByReviews,
    checkIn,
    checkOut,
  };
}

type SerpApiHotel = {
  name?: string;
  type?: string;
  description?: string;
  link?: string;
  thumbnail?: string;
  overall_rating?: number;
  reviews?: number;
  location_rating?: number;
  amenities?: string[];
  excluded_amenities?: string[];
  free_cancellation?: boolean;
  rate_per_night?: {
    extracted_lowest?: number;
    lowest?: string;
  };
  prices?: Array<{
    source?: string;
    link?: string;
    rate_per_night?: {
      extracted_lowest?: number;
      lowest?: string;
    };
  }>;
  property_token?: string;
  gps_coordinates?: {
    latitude?: number;
    longitude?: number;
  };
};

function normalizeHotel(
  hotel: SerpApiHotel,
) {
  const amenities =
    Array.isArray(hotel.amenities)
      ? hotel.amenities
      : [];

  const beach =
    amenities.some((amenity) =>
      /beach access|beachfront|private beach/i.test(
        amenity,
      ),
    ) &&
    !(
      hotel.excluded_amenities ?? []
    ).some((amenity) =>
      /no beach access/i.test(amenity),
    );

  const prices =
    (hotel.prices ?? [])
      .map((price) => ({
        source: price.source ?? "Booking source",
        link: price.link ?? null,
        price:
          price.rate_per_night
            ?.extracted_lowest ??
          extractNumber(
            price.rate_per_night?.lowest,
          ),
      }))
      .filter(
        (price) =>
          price.price !== null,
      );

  return {
    name:
      hotel.name ??
      "Unnamed hotel",

    type:
      hotel.type ??
      "hotel",

    description:
      hotel.description ??
      "",

    link:
      hotel.link ??
      null,

    image:
      hotel.thumbnail ??
      null,

    price:
      hotel.rate_per_night
        ?.extracted_lowest ??
      extractNumber(
        hotel.rate_per_night?.lowest,
      ),

    rating:
      hotel.overall_rating ??
      null,

    reviews:
      hotel.reviews ??
      0,

    locationRating:
      hotel.location_rating ??
      null,

    amenities: amenities.slice(0, 8),

    beach,

    freeCancellation:
      Boolean(hotel.free_cancellation),

    prices: prices.slice(0, 5),

    propertyToken:
      hotel.property_token ??
      null,

    coordinates:
      hotel.gps_coordinates ??
      null,
  };
}

/* -------------------------------------------------------------------------- */
/* REAL GOOGLE HOTELS SEARCH                                                  */
/* -------------------------------------------------------------------------- */

export const runStayLookup = createServerFn({
  method: "POST",
})
  .validator((data: unknown) =>
    toolInput.parse(data),
  )
  .handler(async ({ data }) => {
    const started = Date.now();

    if (data.delayMs > 0) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, data.delayMs);
      });
    }

    const apiKey =
      process.env["SERPAPI_API_KEY"];

    if (!apiKey) {
      throw new Error(
        "Hotel search is not configured. Add SERPAPI_API_KEY to the server .env file.",
      );
    }

    const requirements =
      extractHotelRequirements(
        data.query,
      );

    if (!requirements.destination) {
      throw new Error(
        "I need the hotel destination first. Please say something like: hotel in Goa.",
      );
    }

    const params =
      new URLSearchParams();

    params.set(
      "engine",
      "google_hotels",
    );

    params.set(
      "q",
      `${requirements.destination} hotels${
        requirements.nearBeach
          ? " near beach"
          : ""
      }`,
    );

    params.set(
      "check_in_date",
      requirements.checkIn,
    );

    params.set(
      "check_out_date",
      requirements.checkOut,
    );

    params.set("adults", "2");
    params.set("children", "0");
    params.set("gl", "in");
    params.set("hl", "en");
    params.set("currency", "INR");
    params.set("api_key", apiKey);

    if (
      requirements.maxPrice !== null
    ) {
      params.set(
        "max_price",
        String(
          requirements.maxPrice,
        ),
      );
    }

    if (
      requirements.minRating !== null
    ) {
      const rating =
        requirements.minRating >= 4.5
          ? "9"
          : requirements.minRating >= 4
            ? "8"
            : "7";

      params.set("rating", rating);
    }

    if (
      requirements.nearBeach
    ) {
      /*
       * SerpApi Google Hotels amenity 11
       * represents Beach access.
       */
      params.set(
        "amenities",
        "11",
      );
    }

    if (
      requirements.freeCancellation
    ) {
      params.set(
        "free_cancellation",
        "true",
      );
    }

    if (
      requirements.sortByReviews
    ) {
      params.set(
        "sort_by",
        "13",
      );
    } else if (
      requirements.minRating !== null
    ) {
      params.set(
        "sort_by",
        "8",
      );
    } else if (
      requirements.maxPrice !== null
    ) {
      params.set(
        "sort_by",
        "3",
      );
    }

    const response =
      await fetch(
        `https://serpapi.com/search?${params.toString()}`,
      );

    if (!response.ok) {
      throw new Error(
        `Hotel search failed with HTTP ${response.status}.`,
      );
    }

    const payload =
      (await response.json()) as {
        error?: string;
        search_information?: {
          total_results?: number;
        };
        properties?: SerpApiHotel[];
        ads?: SerpApiHotel[];
      };

    if (payload.error) {
      throw new Error(
        `Hotel search failed: ${payload.error}`,
      );
    }

    const allHotels = [
      ...(payload.ads ?? []),
      ...(payload.properties ?? []),
    ];

    const normalized =
      allHotels
        .map(normalizeHotel)
        .filter(
          (hotel) =>
            hotel.price !== null,
        );

    /*
     * When beach is requested, prioritize
     * actual beach-access hotels even if the
     * API returns a few close alternatives.
     */
    normalized.sort(
      (a, b) => {
        if (
          requirements.nearBeach &&
          a.beach !== b.beach
        ) {
          return a.beach ? -1 : 1;
        }

        if (
          requirements.minRating !== null
        ) {
          return (
            (b.rating ?? 0) -
            (a.rating ?? 0)
          );
        }

        if (
          requirements.sortByReviews
        ) {
          return (
            b.reviews -
            a.reviews
          );
        }

        return (
          (a.price ?? Infinity) -
          (b.price ?? Infinity)
        );
      },
    );

    const results =
      normalized.slice(0, 12);

    console.log(
      "[SERPAPI_HOTEL_SEARCH]",
      {
        query: data.query,
        destination:
          requirements.destination,
        results: results.length,
        total:
          payload.search_information
            ?.total_results ?? 0,
        maxPrice:
          requirements.maxPrice,
        minRating:
          requirements.minRating,
        nearBeach:
          requirements.nearBeach,
      },
    );

    return {
      query: data.query,

      destination:
        requirements.destination,

      checkIn:
        requirements.checkIn,

      checkOut:
        requirements.checkOut,

      requirements: {
        maxPrice:
          requirements.maxPrice,

        minRating:
          requirements.minRating,

        nearBeach:
          requirements.nearBeach,

        freeCancellation:
          requirements.freeCancellation,

        sortByReviews:
          requirements.sortByReviews,
      },

      totalResults:
        payload.search_information
          ?.total_results ?? results.length,

      results,

      durationMs:
        Date.now() - started,

      completedAt:
        new Date().toISOString(),
    };
  });

/* -------------------------------------------------------------------------- */
/* SERVER-SIDE SPEECH-TO-TEXT                                                */
/* -------------------------------------------------------------------------- */

const transcribeInput = z.object({
  audioBase64: z.string().min(32),

  mimeType: z
    .string()
    .default("audio/wav"),

  language: z
    .string()
    .default("en"),
});

/**
 * Server-side STT used when browser SpeechRecognition isn't available.
 */
export const transcribeAudio = createServerFn({
  method: "POST",
})
  .validator((data: unknown) =>
    transcribeInput.parse(data),
  )
  .handler(async ({ data }) => {
    const key = process.env["GEMINI_API_KEY"];

    if (!key) {
      throw new Error(
        "Speech recognition is not configured. Add GEMINI_API_KEY to the server .env file.",
      );
    }

    const language = getLanguage(data.language);

    /*
     * Decode Base64 recording so we can reject extremely small/empty
     * recordings before sending them to Gemini.
     */
    const binary = atob(data.audioBase64);

    const bytes = new Uint8Array(
      binary.length,
    );

    for (
      let i = 0;
      i < binary.length;
      i += 1
    ) {
      bytes[i] = binary.charCodeAt(i);
    }

    if (bytes.length < 2048) {
      return {
        text: "",
        empty: true,
      };
    }

    const { GoogleGenAI } = await import("@google/genai");

    const ai = new GoogleGenAI({
      apiKey: key,
    });

    /*
     * Gemini can transcribe the uploaded audio directly.
     * Keep the prompt language-aware for English, Telugu, and Hindi.
     */
    const prompt = [
      "Transcribe the user's speech exactly.",
      `The expected language is ${language.label}.`,
      "The user may code-switch between English, Telugu, and Hindi.",
      "Return only the transcription, with no explanation, labels, or quotation marks.",
    ].join(" ");

    const response = await ai.models.generateContent({
      model: "gemini-3.5-transcribe",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: prompt,
            },
            {
              inlineData: {
                mimeType: data.mimeType,
                data: data.audioBase64,
              },
            },
          ],
        },
      ],
      config: {
        temperature: 0,
        maxOutputTokens: 512,
      },
    });

    const text = response.text?.trim() ?? "";

    return {
      text,
      empty: text.length === 0,
    };
  });




