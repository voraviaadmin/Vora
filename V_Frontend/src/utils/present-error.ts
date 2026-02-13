import { getModeSnapshot } from "../state/mode";
import { PrivacyNetworkBlockedError } from "../api/client";

export type PresentedError = {
  title: string;
  body?: string;
  tone?: "neutral" | "danger";
  cta?: "go_to_profile" | "retry" | "none";
};

export function presentError(err: unknown): PresentedError {
  const mode = getModeSnapshot().mode;

  // Privacy-mode intentional network block
  if (mode === "privacy") {
    const isPrivacyBlock =
      err instanceof PrivacyNetworkBlockedError ||
      (err instanceof Error && err.message === "NETWORK_BLOCKED_PRIVACY_MODE");

    if (isPrivacyBlock) {
      return {
        title: "This action requires Sync",
        body: "Privacy Mode blocks some network features. Switch to Sync in Profile to enable them.",
        tone: "neutral",
        cta: "go_to_profile",
      };
    }
  }

  // Default
  return {
    title: "Couldn’t load groups",
    body: "Try again.",
    tone: "danger",
    cta: "retry",
  };
}