import { hasOpenAIKey } from "../../config/openai";
import { openAiScoreOneItem } from "../ai/openai-score";

type UserPreferences = any; // keep loose until you formalize prefs schema

/**
 * Sync-mode scoring for Scan (food text).
 * Canonical rule: AI returns scoringJson (immutable) and we pass it through unchanged.
 */
export async function scoreFoodScanSync(args: {
  text: string;
  preferences: UserPreferences;
}) {
  if (!hasOpenAIKey()) {
    throw new Error("OPENAI_NOT_CONFIGURED");
  }

  const t = String(args.text ?? "").trim();
  if (!t) throw new Error("MISSING_TEXT");

  const scoringJson = await openAiScoreOneItem({
    source: "scan",
    mode: "text",
    itemName: t,
    ingredients: null,
    cuisine: null,
    mealType: null,
    userPreferences: args.preferences,
  });

  // ✅ Return both: minimal summary (for quick UI) + canonical scoringJson (immutable)
  return {
    scoring: {
      score: scoringJson.score,
      label: scoringJson.label, // "Good" | "Ok" | "Not Preferred"
      reasons: scoringJson.reasons ?? [],
      flags: scoringJson.flags ?? [],
    },
    scoringJson,
  };
}
