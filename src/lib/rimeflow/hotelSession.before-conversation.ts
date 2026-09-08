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

type HotelSessionState = {
  active: boolean;
  destination: string;
  results: HotelSessionHotel[];
  filteredResults: HotelSessionHotel[];
  selectedHotel: HotelSessionHotel | null;
  minPrice: number | null;
  maxPrice: number | null;
};

const state: HotelSessionState = {
  active: false,
  destination: "",
  results: [],
  filteredResults: [],
  selectedHotel: null,
  minPrice: null,
  maxPrice: null,
};

export function startHotelSession(
  destination: string,
  results: HotelSessionHotel[] = [],
) {
  state.active = true;
  state.destination = destination.trim();
  state.results = results;
  state.filteredResults = results;
  state.selectedHotel = null;
  state.minPrice = null;
  state.maxPrice = null;
}

export function updateHotelResults(
  results: HotelSessionHotel[],
) {
  state.results = results;
  state.filteredResults = applyHotelPriceFilter(
    results,
    state.minPrice,
    state.maxPrice,
  );

  if (
    state.selectedHotel &&
    !state.filteredResults.some(
      (hotel) =>
        hotel.name === state.selectedHotel?.name,
    )
  ) {
    state.selectedHotel = null;
  }
}

export function setHotelPriceRange(
  minPrice: number | null,
  maxPrice: number | null,
) {
  state.minPrice = minPrice;
  state.maxPrice = maxPrice;

  state.filteredResults = applyHotelPriceFilter(
    state.results,
    minPrice,
    maxPrice,
  );

  if (
    state.selectedHotel &&
    !state.filteredResults.some(
      (hotel) =>
        hotel.name === state.selectedHotel?.name,
    )
  ) {
    state.selectedHotel = null;
  }

  return state.filteredResults;
}

function applyHotelPriceFilter(
  results: HotelSessionHotel[],
  minPrice: number | null,
  maxPrice: number | null,
) {
  return results.filter((hotel) => {
    if (hotel.price === null) {
      return false;
    }

    if (
      minPrice !== null &&
      hotel.price < minPrice
    ) {
      return false;
    }

    if (
      maxPrice !== null &&
      hotel.price > maxPrice
    ) {
      return false;
    }

    return true;
  });
}

export function selectHotel(
  hotel: HotelSessionHotel,
) {
  state.selectedHotel = hotel;
  return hotel;
}

export function selectBestHotel() {
  const candidates =
    state.filteredResults.length > 0
      ? state.filteredResults
      : state.results;

  if (candidates.length === 0) {
    return null;
  }

  const ranked = [...candidates].sort(
    (a, b) => {
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
    },
  );

  state.selectedHotel = ranked[0];

  return ranked[0];
}

export function getHotelSession() {
  return {
    ...state,
    results: [...state.results],
    filteredResults: [...state.filteredResults],
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
}

export function findHotelByName(
  query: string,
) {
  const normalized = normalizeHotelText(query);

  const candidates =
    state.filteredResults.length > 0
      ? state.filteredResults
      : state.results;

  if (!normalized) {
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
    .filter((word) => word.length >= 3);

  let best: HotelSessionHotel | null = null;
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

export function getSelectedHotel() {
  return state.selectedHotel;
}

function normalizeHotelText(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
