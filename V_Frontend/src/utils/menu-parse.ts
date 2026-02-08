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


export type MenuCandidate = {
  text: string;
  norm: string;
  confidence: number; // 0..1
};

const STOP_PHRASES = [
  "weekend only",
  "special",
  "only",
  "veg",
  "non-veg",
  "vegetarian",
  "gluten free",
];

function normalizeLine(s: string) {
  return s
    .replace(/[•·•]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonical(s: string) {
  return normalizeLine(s)
    .toLowerCase()
    .replace(/[$₹€£]/g, "")
    .replace(/[0-9]/g, "")
    .replace(/[^a-z\s-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikePriceOrNumbers(s: string) {
  const t = s.trim();
  if (!t) return true;
  // If line is mostly digits/symbols
  const digits = (t.match(/[0-9]/g) ?? []).length;
  const letters = (t.match(/[A-Za-z]/g) ?? []).length;
  if (digits >= 2 && letters === 0) return true;
  if (digits > letters && digits >= 3) return true;
  // "14 28" style
  if (/^\d+(\s+\d+){1,3}$/.test(t)) return true;
  return false;
}

function confidenceScore(raw: string) {
  const s = raw.trim();
  const lower = s.toLowerCase();
  const words = s.split(/\s+/).filter(Boolean);

  let c = 0.55;

  // length heuristic
  if (isLikelyDescription(raw)) return 0.12;
  if (words.length >= 2 && words.length <= 6) c += 0.20;
  if (words.length === 1) c -= 0.12;
  if (words.length >= 7) c -= 0.22;
  if (s.length >= 40) c -= 0.18;

  // description-like penalties
  if (isLikelyDescription(s)) c -= 0.35;

  // numbers / price penalties
  const digits = (s.match(/[0-9]/g) ?? []).length;
  if (digits >= 2) c -= 0.25;

  // dish-title bonuses
  const allCaps = s === s.toUpperCase() && /[A-Z]/.test(s);
  if (allCaps && words.length >= 2 && words.length <= 6) c += 0.18;

  const titleCaseish = /^[A-Z][a-z]/.test(words[0] ?? "");
  if (titleCaseish && words.length >= 2 && words.length <= 6) c += 0.08;

  // clamp
  c = Math.max(0.05, Math.min(0.95, c));
  return c;
}


function jaccard(a: string, b: string) {
  const A = new Set(a.split(" ").filter(Boolean));
  const B = new Set(b.split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union ? inter / union : 0;
}

// Attach "(WEEKEND ONLY)" style line to previous dish instead of treating it as a dish
function foldModifiers(lines: string[]) {
  const out: string[] = [];
  for (const line of lines) {
    const t = normalizeLine(line);
    if (!t) continue;

    const isModifier =
      /^\(.*\)$/.test(t) ||
      STOP_PHRASES.some((p) => t.toLowerCase().includes(p)) ||
      t.toLowerCase().includes("weekend");

    if (isModifier && out.length) {
      out[out.length - 1] = `${out[out.length - 1]} ${t}`.trim();
      continue;
    }
    out.push(t);
  }
  return out;
}


function isLikelyDescription(t: string) {
  const s = t.trim();
  const lower = s.toLowerCase();
  const words = s.split(/\s+/).filter(Boolean);

  // “menu description” patterns
  const phrasey =
    /\b(loaded|served|topped|made|with|touch|choice|chef|traditional|popular|perfect)\b/i.test(s) ||
    /\b(with a|touch of|choice of|served with|made with)\b/i.test(lower);

  const sentencey = /[.,;:]/.test(s);

  // descriptions are typically longer + more lowercase
  const long = words.length >= 7 || s.length >= 38;
  const lowerWords = words.filter((w) => /^[a-z]/.test(w)).length;
  const lowercaseHeavy = words.length >= 6 && lowerWords / words.length > 0.5;

  // dish titles are usually short OR ALL CAPS
  const allCaps = s === s.toUpperCase() && /[A-Z]/.test(s);
  const shortDishy = words.length <= 6 && s.length <= 28;

  // if it’s clearly a short title, do NOT treat as description
  if (allCaps || shortDishy) return false;
  console.log("isLikelyDescription", s, long && (phrasey || sentencey || lowercaseHeavy));

  return long && (phrasey || sentencey || lowercaseHeavy);
}




function looksLikeDishTitle(t: string) {
  const s = t.trim();
  const words = s.split(/\s+/).filter(Boolean);
  const allCaps = s === s.toUpperCase() && /[A-Z]/.test(s);
  return allCaps || (words.length >= 1 && words.length <= 6 && s.length <= 32);
}

export function foldDescriptions(lines: string[]) {
  const out: string[] = [];

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;

    if (isLikelyDescription(t)) {
      // attach only if previous is a dish title, else drop
      if (out.length && looksLikeDishTitle(out[out.length - 1])) {
        out[out.length - 1] = `${out[out.length - 1]} — ${t}`.trim();
      }
      continue; // critical: never emit description as its own line
    }

    out.push(t);
  }

  return out;
}

function isTooLongToBeDish(text: string) {
  const words = text.trim().split(/\s+/);
  if (words.length > 10 ) return true;

  if (text.length > 30) {
    // descriptive words heuristic
    const descriptiveWords = [
      "with", "and", "served", "loaded", "tossed",
      "made", "style", "flavored", "crispy", "fried",
      "choice", "spicy"
    ];
    const lower = text.toLowerCase();
    if (descriptiveWords.some(w => lower.includes(w))) {
      return true;
    }
  }

  return false;
}





export function buildMenuCandidates(rawLines: string[]): MenuCandidate[] {
  const cleaned = foldModifiers(rawLines.map(normalizeLine).filter(Boolean));

  const items: MenuCandidate[] = [];
  for (const text of cleaned) {
    if (isTooLongToBeDish(text)) continue;
    if (isLikelyDescription(text)) continue;
    if (looksLikePriceOrNumbers(text)) continue;

    const norm = canonical(text);
    if (!norm) continue;

    const confidence = confidenceScore(text);
    items.push({ text, norm, confidence });
  }

  // de-dup exact + near-dup (token overlap)
  const deduped: MenuCandidate[] = [];
  for (const it of items.sort((a, b) => b.confidence - a.confidence)) {
    const clash = deduped.find((x) => x.norm === it.norm || jaccard(x.norm, it.norm) >= 0.86);
    if (clash) continue;
    deduped.push(it);
  }

  return deduped;
}
