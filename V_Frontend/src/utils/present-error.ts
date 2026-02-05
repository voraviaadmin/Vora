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
        title: "Groups are available in Sync Mode",
        body: "Privacy Mode keeps everything local. Switch to Sync in Profile to view or manage groups.",
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