import { Mode } from "../state/mode"; // adjust import if your Mode type lives elsewhere

export function privacyNotice(featureName: string) {
  return {
    title: `${featureName} is available in Sync Mode`,
    body: "Privacy Mode keeps everything local. Switch to Sync in Profile to enable cloud and AI features.",
  };
}

export function backendStatusLabel(mode: Mode) {
  if (mode === "privacy") {
    return { label: "Disabled (Privacy Mode)", tone: "neutral" as const };
  }
  return { label: "Online", tone: "good" as const };
}