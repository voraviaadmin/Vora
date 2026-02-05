import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import * as SecureStore from "expo-secure-store";

export type Mode = "privacy" | "sync";
export type ModeStatus = "ready" | "enabling" | "disabling" | "error";

export type ModeReason =
  | "NETWORK_UNAVAILABLE"
  | "AUTH_REQUIRED"
  | "PAYMENT_REQUIRED"
  | "SERVER_REJECTED"
  | "UNKNOWN";

export type ModeState = {
  mode: Mode;
  status: ModeStatus; // UI-only (snapshot will always be "ready")
  lastChangedAt: number;
  reason?: ModeReason;
};

type ModeActions = {
  requestEnableSync: (doEnableOnBackend: () => Promise<void>) => Promise<void>;
  requestDisableSync: (doDisableOnBackend: () => Promise<void>) => Promise<void>;
};

const STORAGE_KEY = "voravia.mode.v1";
const now = () => Date.now();

const ModeContext = createContext<(ModeState & ModeActions) | null>(null);

// ============================================================
// Global snapshot (for non-hook code like src/api/client.ts)
// IMPORTANT: We keep snapshot.status ALWAYS "ready".
// ============================================================

export type ModeSnapshot = {
  mode: Mode;
  status: "ready";
  lastChangedAt: number;
};

let _modeSnapshot: ModeSnapshot = {
  mode: "privacy",
  status: "ready",
  lastChangedAt: now(),
};

const _listeners = new Set<(s: ModeSnapshot) => void>();

function publishSnapshot(next: ModeSnapshot) {
  const prev = _modeSnapshot;
  _modeSnapshot = next;

  if (
    prev.mode !== next.mode ||
    prev.status !== next.status ||
    prev.lastChangedAt !== next.lastChangedAt
  ) {
    _listeners.forEach((fn) => fn(_modeSnapshot));
  }
}

export function getModeSnapshot(): ModeSnapshot {
  return _modeSnapshot;
}

export function subscribeMode(fn: (s: ModeSnapshot) => void) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

// ============================================================
// Secure persistence (persist ONLY stable values, not status)
// ============================================================

type StoredMode = {
  mode: Mode;
  lastChangedAt?: number;
  reason?: ModeReason;
};

async function load(): Promise<StoredMode | null> {
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as StoredMode;
    if (parsed?.mode !== "privacy" && parsed?.mode !== "sync") return null;

    return parsed;
  } catch {
    return null;
  }
}

async function persist(stored: StoredMode) {
  const raw = JSON.stringify(stored);
  await SecureStore.setItemAsync(STORAGE_KEY, raw, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
  });
}

// ============================================================
// Provider
// ============================================================

export function ModeProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);

  // React/UI state: can show enabling/disabling/error
  const [state, setState] = useState<ModeState>({
    mode: "privacy",
    status: "ready",
    lastChangedAt: now(),
  });

  // Commit helper: updates React state + snapshot + persistence
  const setAndPersist = useCallback(async (next: ModeState) => {
    setState(next);

    publishSnapshot({
      mode: next.mode,
      status: "ready",
      lastChangedAt: next.lastChangedAt,
    });

    await persist({
      mode: next.mode,
      lastChangedAt: next.lastChangedAt,
      reason: next.reason,
    });
  }, []);

  // Boot hydration
  useEffect(() => {
    (async () => {
      const stored = await load();

      if (stored?.mode === "privacy" || stored?.mode === "sync") {
        const stable: ModeState = {
          mode: stored.mode,
          status: "ready",
          lastChangedAt: stored.lastChangedAt || now(),
          reason: stored.reason,
        };

        setState(stable);
        publishSnapshot({
          mode: stable.mode,
          status: "ready",
          lastChangedAt: stable.lastChangedAt,
        });
      } else {
        const initial: ModeState = {
          mode: "privacy",
          status: "ready",
          lastChangedAt: now(),
        };

        setState(initial);
        publishSnapshot({
          mode: initial.mode,
          status: "ready",
          lastChangedAt: initial.lastChangedAt,
        });
        await persist({ mode: initial.mode, lastChangedAt: initial.lastChangedAt });
      }

      setHydrated(true);
    })();
  }, []);

  // Enable Sync (UI-only status changes; snapshot stays ready)
  const requestEnableSync = useCallback(
    async (doEnableOnBackend: () => Promise<void>) => {
      setState((s) => ({ ...s, status: "enabling", reason: undefined }));

      try {
        await doEnableOnBackend();

        await setAndPersist({
          mode: "sync",
          status: "ready",
          lastChangedAt: now(),
          reason: undefined,
        });
      } catch (e) {
        setState((s) => ({ ...s, status: "ready" }));
        throw e;
      }
    },
    [setAndPersist]
  );


  
  // Disable Sync
  const requestDisableSync = useCallback(
    async (doDisableOnBackend: () => Promise<void>) => {
      const changedAt = now();
      setState((s) => ({ ...s, status: "disabling", reason: undefined }));

      try {
        await doDisableOnBackend();

        await setAndPersist({
          mode: "privacy",
          status: "ready",
          lastChangedAt: changedAt,
          reason: undefined,
        });
      } catch (e) {
        setState((s) => ({ ...s, status: "ready" }));
        throw e;
      }
    },
    [setAndPersist]
  );

  const value = useMemo(
    () => ({ ...state, requestEnableSync, requestDisableSync }),
    [state, requestEnableSync, requestDisableSync]
  );

  // Avoid rendering children until snapshot is initialized from SecureStore
  if (!hydrated) return null;

  return <ModeContext.Provider value={value}>{children}</ModeContext.Provider>;
}

export function useMode() {
  const ctx = useContext(ModeContext);
  if (!ctx) throw new Error("useMode must be used within ModeProvider");
  return ctx;
}