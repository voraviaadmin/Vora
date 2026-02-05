import { getModeSnapshot } from "../state/mode";
import { PrivacyNetworkBlockedError } from "../api/client";

export function toUserMessage(err: unknown): string {
  const mode = getModeSnapshot().mode;

  if (mode === "privacy") {
    const isPrivacyBlock =
      err instanceof PrivacyNetworkBlockedError ||
      (err instanceof Error && err.message === "NETWORK_BLOCKED_PRIVACY_MODE");

    if (isPrivacyBlock) {
      return "Sync features are disabled in Privacy Mode. Switch to Sync in Profile to enable them.";
    }
  }

  return "Something went wrong. Please try again.";
}