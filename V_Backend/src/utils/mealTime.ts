export type MealWindow = "morning" | "midday" | "evening" | "off-hours";
export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

function parseHourRange(envVal: string | undefined, fallback: [number, number]): [number, number] {
  if (!envVal) return fallback;
  const m = envVal.trim().match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
  if (!m) return fallback;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return fallback;
  if (a < 0 || a > 23 || b < 0 || b > 23) return fallback;
  return [a, b];
}

function inRangeInclusive(hour: number, [start, end]: [number, number]) {
  return hour >= start && hour <= end;
}

/**
 * Canonical meal window label (matches your frontend intent).
 * Configurable via env:
 *  - MEAL_MORNING=5-10
 *  - MEAL_MIDDAY=11-14
 *  - MEAL_EVENING=18-23
 */
export function getMealWindow(date: Date = new Date()): { hour: number; window: MealWindow } {
  const hour = date.getHours();

  const morning = parseHourRange(process.env.MEAL_MORNING, [5, 10]);
  const midday = parseHourRange(process.env.MEAL_MIDDAY, [11, 14]);
  const evening = parseHourRange(process.env.MEAL_EVENING, [18, 23]);

  const window: MealWindow =
    inRangeInclusive(hour, morning) ? "morning" :
    inRangeInclusive(hour, midday) ? "midday" :
    inRangeInclusive(hour, evening) ? "evening" :
    "off-hours";

  return { hour, window };
}

/**
 * Canonical mealType for scoring/AI.
 * breakfast/lunch/dinner/snack derived from window.
 */
export function getMealType(date: Date = new Date()): MealType {
  const { window } = getMealWindow(date);
  if (window === "morning") return "breakfast";
  if (window === "midday") return "lunch";
  if (window === "evening") return "dinner";
  return "snack";
}
