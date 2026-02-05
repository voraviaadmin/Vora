export type MealType = "Breakfast" | "Lunch" | "Dinner" | "Snack";

/**
 * Centralized meal-time rules.
 * These rules are intentionally simple and deterministic.
 *
 * Local time is used (device time).
 * This logic must stay in ONE place only.
 */
export function getSuggestedMealType(date: Date = new Date()): MealType {
  const hour = date.getHours();

  // 5am – 10am
  if (hour >= 5 && hour <= 10) return "Breakfast";

  // 11am – 2pm
  if (hour >= 11 && hour <= 14) return "Lunch";

  // 6pm – 11pm
  if (hour >= 18 && hour <= 23) return "Dinner";

  // Everything else
  return "Snack";
}

/**
 * Optional helper (future use):
 * Returns the meal window label for AI context.
 */
export function getMealWindow(date: Date = new Date()) {
  const hour = date.getHours();
  return {
    hour,
    window:
      hour >= 5 && hour <= 10
        ? "morning"
        : hour >= 11 && hour <= 14
        ? "midday"
        : hour >= 18 && hour <= 23
        ? "evening"
        : "off-hours",
  };
}
