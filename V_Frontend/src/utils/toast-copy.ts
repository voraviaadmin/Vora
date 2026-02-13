import { getModeSnapshot } from "../state/mode";
import { PrivacyNetworkBlockedError } from "../api/client";

export function toUserMessage(err: unknown): string {
  const mode = getModeSnapshot().mode;

  if (mode === "privacy") {
    const isPrivacyBlock =
      err instanceof PrivacyNetworkBlockedError ||
      (err instanceof Error && err.message === "NETWORK_BLOCKED_PRIVACY_MODE");

    if (isPrivacyBlock) {
      return "This feature requires Sync. Switch to Sync in Profile.";
    }
  }

  return "Something went wrong. Please try again.";
}