import { MENU_PARSE } from "./scan-config";

export function parseMenuToItemsText(raw: string): string {
  const text = (raw ?? "").toString();
  if (!text.trim()) return "";

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const cleaned: string[] = [];

  for (const line0 of lines) {
    if (cleaned.length >= MENU_PARSE.maxItems) break;

    const lower0 = line0.toLowerCase();
    if (MENU_PARSE.ignoreExact.has(lower0)) continue;

    // Strip prices early (so numeric filters don’t over-fire)
    const noPrice = line0.replace(MENU_PARSE.pricePattern, "").trim();
    if (noPrice.length < MENU_PARSE.minLen) continue;

    const lower = noPrice.toLowerCase();

    // Numeric dominance check AFTER price stripping
    const digitCount = (lower.match(/[0-9]/g) || []).length;
    const denom = Math.max(1, lower.length);

    // Allow common menu patterns with some digits
    const hasMenuNumberCue =
      /\b(combo|no\.|#|item|option|size)\b/.test(lower);

    const numericRatio = digitCount / denom;
    const tooNumeric =
      !hasMenuNumberCue &&
      digitCount >= 3 &&
      numericRatio >= MENU_PARSE.numericDominance;

    if (tooNumeric) continue;

    cleaned.push(noPrice);
  }

  return Array.from(new Set(cleaned)).join("\n");
}