// src/utils/scan-config.ts

function numEnv(key: string, fallback: number) {
  const raw = process.env[key];
  const n = raw == null ? NaN : Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export const MENU_PARSE = {
  maxItems: Math.floor(clamp(numEnv("EXPO_PUBLIC_MENU_PARSE_MAX_ITEMS", 30), 1, 200)),
  minLen: Math.floor(clamp(numEnv("EXPO_PUBLIC_MENU_PARSE_MIN_LEN", 4), 1, 50)),
  numericDominance: clamp(numEnv("EXPO_PUBLIC_MENU_PARSE_NUMERIC_DOMINANCE", 0.35), 0, 1),

  // Removes prices like:
  // $12.99, 12.99, 12,99, £9, €10.5, ₹299, 12.99+, 12.99*, 12.99 / 14.99
  // Typically at end of a line or near the end.
  pricePattern:
    /(?:\s+(?:[$€£₹]|usd|eur|gbp|inr)?\s*\d{1,4}(?:[.,]\d{1,2})?(?:\s*(?:\/|-)\s*(?:[$€£₹]|usd|eur|gbp|inr)?\s*\d{1,4}(?:[.,]\d{1,2})?)?\s*[+*]?\s*)$/i,

  ignoreExact: new Set(
    [
      "menu",
      "appetizers",
      "starters",
      "entrees",
      "mains",
      "desserts",
      "drinks",
      "beverages",
      "sides",
      "salads",
      "soups",
      "breakfast",
      "lunch",
      "dinner",
      "specials",
      "kids",
      "add-ons",
      "addons",
      "extras",
    ].map((s) => s.toLowerCase())
  ),
};