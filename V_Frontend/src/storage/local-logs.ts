// src/storage/local-logs.ts
import * as FileSystem from "expo-file-system/legacy";

/**
 * Local-first log storage.
 * - Used in Privacy mode (device-only).
 * - Can also be used in Sync mode as a local cache if you want later.
 *
 * No AsyncStorage dependency (avoids native module issues).
 */

export type AppMode = "privacy" | "sync";
export type HomeWindow = "daily" | "3d" | "7d" | "14d";

export type LocalLogScoring = {
  score: number;
  reasons: string[];
  confidence?: number;
};

export type LocalLog = {
  id: string;
  capturedAt: string; // ISO
  summary: string;
  mealType?: string | null;
  source?: "food_scan" | "menu_scan" | "manual" | string;

  scoring: LocalLogScoring;

  // optional future fields (keep for compatibility)
  groupId?: string | null;
  placeRefId?: string | null;
};

type LocalLogFileShape = {
  version: 1;
  updatedAt: string;
  logs: LocalLog[];
};

const FILE_NAME = "voravia_local_logs_v1.json";

function getFilePath(): string {
  const dir = FileSystem.documentDirectory;
  if (!dir) {
    // Extremely rare, but avoid crashing.
    // Use cacheDirectory as fallback.
    const fallback = FileSystem.cacheDirectory ?? "";
    return `${fallback}${FILE_NAME}`;
  }
  return `${dir}${FILE_NAME}`;
}

function newId(): string {
  // good-enough local id
  return `ll_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function readFileJson(): Promise<LocalLogFileShape> {
  const path = getFilePath();

  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) {
      return { version: 1, updatedAt: new Date().toISOString(), logs: [] };
    }

    const raw = await FileSystem.readAsStringAsync(path);
    if (!raw?.trim()) {
      return { version: 1, updatedAt: new Date().toISOString(), logs: [] };
    }

    const parsed = JSON.parse(raw) as Partial<LocalLogFileShape>;
    const logs = Array.isArray(parsed.logs) ? (parsed.logs as LocalLog[]) : [];
    return {
      version: 1,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
      logs,
    };
  } catch {
    // If file is corrupted, fail safe to empty rather than crashing the app
    return { version: 1, updatedAt: new Date().toISOString(), logs: [] };
  }
}

async function writeFileJson(next: LocalLogFileShape): Promise<void> {
  const path = getFilePath();
  const tmp = `${path}.tmp`;

  const payload = JSON.stringify(next);

  // Write tmp, then replace (best-effort atomic)
  await FileSystem.writeAsStringAsync(tmp, payload);

  // Delete destination if present (idempotent)
  try {
    await FileSystem.deleteAsync(path, { idempotent: true });
  } catch {
    // ignore
  }

  await FileSystem.moveAsync({ from: tmp, to: path });
}

/**
 * Read all local logs (oldest -> newest).
 */
export async function getLocalLogs(): Promise<LocalLog[]> {
  const file = await readFileJson();
  return file.logs;
}

/**
 * Replace all logs.
 */
export async function setLocalLogs(logs: LocalLog[]): Promise<void> {
  const next: LocalLogFileShape = {
    version: 1,
    updatedAt: new Date().toISOString(),
    logs,
  };
  await writeFileJson(next);
}

/**
 * Append a log and return it (with id assigned).
 */
export async function addLocalLog(input: Omit<LocalLog, "id">): Promise<LocalLog> {
  const file = await readFileJson();
  const log: LocalLog = { ...input, id: newId() };

  const nextLogs = [...file.logs, log];

  await writeFileJson({
    version: 1,
    updatedAt: new Date().toISOString(),
    logs: nextLogs,
  });

  return log;
}

/**
 * Delete a single log by id.
 */
export async function deleteLocalLog(id: string): Promise<void> {
  const file = await readFileJson();
  const nextLogs = file.logs.filter((l) => l.id !== id);

  await writeFileJson({
    version: 1,
    updatedAt: new Date().toISOString(),
    logs: nextLogs,
  });
}

/**
 * Wipe all local logs.
 */
export async function clearLocalLogs(): Promise<void> {
  await writeFileJson({
    version: 1,
    updatedAt: new Date().toISOString(),
    logs: [],
  });
}