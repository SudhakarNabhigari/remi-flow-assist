export type HotelSessionHotel = {
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

export type HotelFilterCriteria = {
  minPrice?: number | null;
  maxPrice?: number | null;
  minRating?: number | null;
  maxRating?: number | null;
  minReviews?: number | null;
  maxReviews?: number | null;
  amenities?: string[];
  freeCancellation?: boolean;
  nearBeach?: boolean;
  propertyType?: string | null;
};

export type HotelSessionEventDetail = {
  type:
    | "START"
    | "RESULTS"
    | "FILTER"
    | "SELECT"
    | "CLOSE";
  destination: string;
  results: HotelSessionHotel[];
  selectedHotel: HotelSessionHotel | null;
  minPrice: number | null;
  maxPrice: number | null;
};

type HotelSessionState = {
  active: boolean;
  destination: string;
  results: HotelSessionHotel[];
  filteredResults: HotelSessionHotel[];
  selectedHotel: HotelSessionHotel | null;
  minPrice: number | null;
  maxPrice: number | null;
  filters: HotelFilterCriteria;
};

const state: HotelSessionState = {
  active: false,
  destination: "",
  results: [],
  filteredResults: [],
  selectedHotel: null,
  minPrice: null,
  maxPrice: null,
  filters: {},
};

function emitHotelSession(
  type: HotelSessionEventDetail["type"],
) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<HotelSessionEventDetail>(
      "remi-hotel-session",
      {
        detail: {
          type,
          destination: state.destination,
          results: [...state.filteredResults],
          selectedHotel: state.selectedHotel,
          minPrice: state.minPrice,
          maxPrice: state.maxPrice,
        },
      },
    ),
  );
}

export function startHotelSession(
  destination: string,
  results: HotelSessionHotel[] = [],
) {
  state.active = true;
  state.destination = destination.trim();
  state.results = [...results];
  state.filteredResults = [...results];
  state.selectedHotel = null;
  state.minPrice = null;
  state.maxPrice = null;
  state.filters = {};

  emitHotelSession("START");
}

export function updateHotelResults(
  results: HotelSessionHotel[],
) {
  state.results = [...results];

  state.filteredResults =
    applyHotelFilters(
      results,
      state.filters,
    );

  if (
    state.selectedHotel &&
    !state.filteredResults.some(
      (hotel) =>
        hotel.name ===
        state.selectedHotel?.name,
    )
  ) {
    state.selectedHotel = null;
  }

  emitHotelSession("RESULTS");
}

export function setHotelPriceRange(
  minPrice: number | null,
  maxPrice: number | null,
) {
  return setHotelFilters({
    ...state.filters,
    minPrice,
    maxPrice,
  });
}

export function setHotelFilters(
  filters: HotelFilterCriteria,
) {
  state.filters = {
    ...filters,
  };

  state.minPrice =
    filters.minPrice ?? null;

  state.maxPrice =
    filters.maxPrice ?? null;

  state.filteredResults =
    applyHotelFilters(
      state.results,
      state.filters,
    );

  if (
    state.selectedHotel &&
    !state.filteredResults.some(
      (hotel) =>
        hotel.name ===
        state.selectedHotel?.name,
    )
  ) {
    state.selectedHotel = null;
  }

  emitHotelSession("FILTER");

  return [...state.filteredResults];
}

export function applyHotelFilters(
  results: HotelSessionHotel[],
  filters: HotelFilterCriteria,
) {
  return results.filter((hotel) => {
    if (
      filters.minPrice !== null &&
      filters.minPrice !== undefined
    ) {
      if (
        hotel.price === null ||
        hotel.price < filters.minPrice
      ) {
        return false;
      }
    }

    if (
      filters.maxPrice !== null &&
      filters.maxPrice !== undefined
    ) {
      if (
        hotel.price === null ||
        hotel.price > filters.maxPrice
      ) {
        return false;
      }
    }

    if (
      filters.minRating !== null &&
      filters.minRating !== undefined
    ) {
      if (
        hotel.rating === null ||
        hotel.rating < filters.minRating
      ) {
        return false;
      }
    }

    if (
      filters.maxRating !== null &&
      filters.maxRating !== undefined
    ) {
      if (
        hotel.rating === null ||
        hotel.rating > filters.maxRating
      ) {
        return false;
      }
    }

    if (
      filters.minReviews !== null &&
      filters.minReviews !== undefined
    ) {
      if (
        hotel.reviews < filters.minReviews
      ) {
        return false;
      }
    }

    if (
      filters.maxReviews !== null &&
      filters.maxReviews !== undefined
    ) {
      if (
        hotel.reviews > filters.maxReviews
      ) {
        return false;
      }
    }

    if (
      filters.amenities &&
      filters.amenities.length > 0
    ) {
      const hotelAmenities =
        hotel.amenities.map(
          (amenity) =>
            amenity.toLowerCase(),
        );

      const hasAllAmenities =
        filters.amenities.every(
          (required) => {
            const normalized =
              required.toLowerCase();

            return hotelAmenities.some(
              (available) =>
                available.includes(
                  normalized,
                ) ||
                normalized.includes(
                  available,
                ),
            );
          },
        );

      if (!hasAllAmenities) {
        return false;
      }
    }

    if (
      filters.freeCancellation === true &&
      !hotel.freeCancellation
    ) {
      return false;
    }

    if (
      filters.nearBeach === true &&
      !hotel.beach
    ) {
      return false;
    }

    if (
      filters.propertyType
    ) {
      const type =
        hotel.type.toLowerCase();

      const requiredType =
        filters.propertyType.toLowerCase();

      if (
        !type.includes(requiredType)
      ) {
        return false;
      }
    }

    return true;
  });
}

export function selectHotel(
  hotel: HotelSessionHotel,
) {
  state.selectedHotel = hotel;

  emitHotelSession("SELECT");

  return hotel;
}

export function getTopHotelRecommendations(
  count = 3,
) {
  const candidates =
    state.filteredResults;

  if (candidates.length === 0) {
    return [];
  }

  return [...candidates]
    .sort((a, b) => {
      const ratingA = a.rating ?? 0;
      const ratingB = b.rating ?? 0;

      if (ratingA !== ratingB) {
        return ratingB - ratingA;
      }

      if (a.reviews !== b.reviews) {
        return b.reviews - a.reviews;
      }

      const priceA =
        a.price ?? Number.MAX_SAFE_INTEGER;

      const priceB =
        b.price ?? Number.MAX_SAFE_INTEGER;

      return priceA - priceB;
    })
    .slice(0, count);
}

export function selectBestHotel() {
  const recommendations =
    getTopHotelRecommendations(1);

  if (recommendations.length === 0) {
    return null;
  }

  state.selectedHotel =
    recommendations[0];

  emitHotelSession("SELECT");

  return recommendations[0];
}

export function getHotelSession() {
  return {
    ...state,
    results: [...state.results],
    filteredResults: [
      ...state.filteredResults,
    ],
    filters: {
      ...state.filters,
      amenities: state.filters.amenities
        ? [...state.filters.amenities]
        : undefined,
    },
  };
}

export function clearHotelSession() {
  state.active = false;
  state.destination = "";
  state.results = [];
  state.filteredResults = [];
  state.selectedHotel = null;
  state.minPrice = null;
  state.maxPrice = null;
  state.filters = {};

  emitHotelSession("CLOSE");
}

export function findHotelByName(
  query: string,
) {
  const normalized =
    normalizeHotelText(query);

  if (!normalized) {
    return null;
  }

  const candidates =
    state.filteredResults;

  if (candidates.length === 0) {
    return null;
  }

  const exact = candidates.find(
    (hotel) =>
      normalizeHotelText(hotel.name) ===
      normalized,
  );

  if (exact) {
    return exact;
  }

  const contains = candidates.find(
    (hotel) => {
      const name =
        normalizeHotelText(hotel.name);

      return (
        name.includes(normalized) ||
        normalized.includes(name)
      );
    },
  );

  if (contains) {
    return contains;
  }

  const queryWords = normalized
    .split(/\s+/)
    .filter(
      (word) => word.length >= 3,
    );

  let best: HotelSessionHotel | null =
    null;

  let bestScore = 0;

  for (const hotel of candidates) {
    const name =
      normalizeHotelText(hotel.name);

    const score = queryWords.reduce(
      (total, word) =>
        name.includes(word)
          ? total + 1
          : total,
      0,
    );

    if (score > bestScore) {
      bestScore = score;
      best = hotel;
    }
  }

  return best;
}

function normalizeHotelText(
  value: string,
) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
