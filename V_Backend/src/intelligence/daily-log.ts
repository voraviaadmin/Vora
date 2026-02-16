import { DailyConsumed } from "./engine";

export function mergeIntoDailyConsumed(
  current: DailyConsumed | null,
  addition: {
    calories?: number | null;
    protein_g?: number | null;
    carbs_g?: number | null;
    fat_g?: number | null;
    fiber_g?: number | null;
    sugar_g?: number | null;
    sodium_mg?: number | null;
  }
): DailyConsumed {
  const base: DailyConsumed = current ?? {
    calories: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    fiber_g: 0,
    sugar_g: 0,
    sodium_mg: 0,
  };

  return {
    calories: base.calories + (addition.calories ?? 0),
    protein_g: base.protein_g + (addition.protein_g ?? 0),
    carbs_g: base.carbs_g + (addition.carbs_g ?? 0),
    fat_g: base.fat_g + (addition.fat_g ?? 0),
    fiber_g: base.fiber_g + (addition.fiber_g ?? 0),
    sugar_g: base.sugar_g + (addition.sugar_g ?? 0),
    sodium_mg: base.sodium_mg + (addition.sodium_mg ?? 0),
  };
}


const mem = new Map<string, DailyConsumed>();

function zero(): DailyConsumed {
  return {
    calories: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    fiber_g: 0,
    sugar_g: 0,
    sodium_mg: 0,
  };
}

function isoLocalDay(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function k(userId: string, day: string) {
  return `${userId}::${day}`;
}

export async function loadTodayConsumed(userId: string, now = new Date()): Promise<DailyConsumed> {
  const key = k(userId, isoLocalDay(now));
  return mem.get(key) ?? zero();
}

export async function saveTodayConsumed(userId: string, consumed: DailyConsumed, now = new Date()): Promise<void> {
  const key = k(userId, isoLocalDay(now));
  mem.set(key, consumed);
}
