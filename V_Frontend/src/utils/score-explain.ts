// src/utils/score-explain.ts
export type ExplainContext = "food" | "menu" | "log";

type NormalizeOpts = {
  context: ExplainContext;
  max?: number;          // default 3
  maxLen?: number;       // default 120
};

function uniqKey(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function cleanOne(raw: string): string | null {
  let s = String(raw ?? "").trim();
  if (!s) return null;

  // Remove leading bullets and odd prefixes
  s = s.replace(/^[•\-\u2022]+\s*/, "").trim();

  // Drop HTML-ish responses
  if (/<\/?(html|body|head|pre|meta|title|doctype)\b/i.test(s)) return null;

  // Rewrite common “internal” / non-premium phrasing into user copy
  const rules: Array<[RegExp, string | null]> = [
    [/^preferences applied\.?$/i, "Using your preferences."],
    [/recent logs available for pattern context\.?/i, "Using your recent history for consistency."],
    [/health constraints enabled: applying caution\.?/i, "Accounting for your health profile."],
    [/recent eating pattern looks consistent.*$/i, "Recent logging looks consistent."],
    [/^recent pattern:\s*late[- ]night snacking\.?$/i, "Noticing late-night snacking lately."],
    [/missing recent logs for:.*$/i, "Limited history for some meals — logging more improves accuracy."],
    [/low meal variety.*$/i, "Logging different meals improves consistency over time."],

    // If a line is basically meta, drop it
    [/pattern context/i, null],
    [/signals?/i, null],
    [/nowiso/i, null],
  ];

  for (const [re, out] of rules) {
    if (re.test(s)) return out;
  }

  // Trim overly long lines (keeps UI calm)
  if (s.length > 160) s = s.slice(0, 157).trimEnd() + "…";

  return s;
}

export function normalizeReasons(
  reasons: unknown,
  opts: NormalizeOpts
): string[] {
  const max = opts.max ?? 3;

  const arr = Array.isArray(reasons) ? reasons : [];
  const out: string[] = [];
  const seen = new Set<string>();

  for (const r of arr) {
    const cleaned = cleanOne(String(r ?? ""));
    if (!cleaned) continue;

    const key = uniqKey(cleaned);
    if (seen.has(key)) continue;
    seen.add(key);

    out.push(cleaned);
    if (out.length >= max) break;
  }

  // Context-sensitive fallback (keeps it never-empty)
  if (!out.length) {
    if (opts.context === "menu") return ["Score reflects your profile and goals."];
    if (opts.context === "food") return ["Score reflects your profile and goals."];
    return [];
  }

  return out;
}
