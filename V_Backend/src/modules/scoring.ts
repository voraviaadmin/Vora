// V_Backend/src/modules/scoring.ts
import { z } from "zod";

/**
 * Sync-mode AI scoring contract (Single Source of Truth).
 * Persist unchanged as scoringJson and render unchanged in frontend.
 */

export const ScoreLabelSchema = z.enum(["Good", "Ok", "Not Preferred"]);

export const EstimatesSchema = z.object({
  calories: z.number().nullable(),
  protein_g: z.number().nullable(),
  carbs_g: z.number().nullable(),
  fat_g: z.number().nullable(),
  sugar_g: z.number().nullable(),
  sodium_mg: z.number().nullable(),
});

export const FeaturesSchema = z
  .object({
    cuisineMatch: z.enum(["high", "medium", "low"]),
    goalAlignment: z.enum(["high", "medium", "low"]),
    healthRisk: z.enum(["low", "medium", "high"]),
    satiety: z.enum(["low", "medium", "high"]),
  })
  .partial()
  .optional();

/**
 * Canonical scoring object stored in DB.
 * NOTE: Keep this stable. Only add fields (backward-compatible).
 */
export const AiScoringSchema = z.object({
  score: z.number().min(0).max(100),
  label: ScoreLabelSchema,
  why: z.string().min(1).max(400),
  reasons: z.array(z.string().min(1).max(120)).min(1).max(6),
  flags: z.array(z.string().min(1).max(40)).max(20),
  nutritionNotes: z.string().max(200).nullable().optional(),
  estimates: EstimatesSchema,
  features: FeaturesSchema,
});

export type AiScoring = z.infer<typeof AiScoringSchema>;

export function parseAiScoring(input: unknown): AiScoring {
  return AiScoringSchema.parse(input);
}

export function safeParseAiScoring(input: unknown): AiScoring | null {
  const r = AiScoringSchema.safeParse(input);
  return r.success ? r.data : null;
}

export function stringifyAiScoring(scoring: AiScoring): string {
  // stable stringify (plain JSON.stringify is fine for now)
  return JSON.stringify(scoring);
}
