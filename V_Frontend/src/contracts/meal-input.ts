// src/contracts/meal-input.ts

export type MealTypeHint = "breakfast" | "lunch" | "dinner" | "snack";

export type MealItem = {
  name: string; // normalized item name (no PII)
  quantityText?: string | null; // "2 slices", "1 bowl"
  notes?: string | null; // optional, avoid PII
};

export type MealInputSource = "log" | "manual" | "food_scan" | "menu_scan" | "suggestion";

export type MealInput = {
  capturedAt: string; // ISO string

  // Backend derives mealType; this is only a hint (optional)
  mealTypeHint?: MealTypeHint | null;

  // For privacy mode, this will usually be the primary input.
  // For sync mode, this can be derived from OCR/menu parsing.
  itemsText?: string | null;

  // Optional structured items (future / connector-ready)
  items?: MealItem[] | null;

  // optional, future-proof
  derived?: { mealType?: string | null } | null;

  // references to already-uploaded images (sync) OR local image refs (privacy)
  imageRefs?: string[] | null;

  source: MealInputSource;

  // Optional minimal metadata (no PII). Example: { restaurant: "Chipotle" } (only if you choose)
  sourceMeta?: Record<string, unknown> | null;
};

// ---- Optional lightweight runtime check (no dependencies) ----
export function assertMealInput(x: any): asserts x is MealInput {
  if (!x || typeof x !== "object") throw new Error("MealInput must be an object");
  if (typeof x.capturedAt !== "string") throw new Error("MealInput.capturedAt must be string");
  if (typeof x.source !== "string") throw new Error("MealInput.source must be string");
}