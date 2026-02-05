import { useMode } from "../state/mode";

type Mode = "privacy" | "sync";

export function useModeGate() {
  const { mode } = useMode();

  // Since ModeProvider blocks render until hydrated, this is always ready.
  const ready = true;

  const canUseAI = mode === "sync";

  return { ready, mode: mode as Mode, canUseAI };
}