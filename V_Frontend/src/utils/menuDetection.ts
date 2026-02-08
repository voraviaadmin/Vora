// V_Frontend/utils/menuDetection.ts
import { Platform } from "react-native";
import { isSupported, extractTextFromImage } from "expo-text-extractor";

export type TextBox = {
  text: string;
  // We keep bbox optional so callers don't depend on platform-specific geometry.
  bbox?: { x: number; y: number; width: number; height: number } | null;
};

// Your menu-scan screen only uses `.text`, so we can safely return "text-only boxes".
// This keeps Phase 1 stable and avoids hardcoding a specific OCR geometry model.
export async function detectMenuTextBoxes(uri: string): Promise<TextBox[]> {
  // expo-text-extractor does on-device OCR:
  // - Android: Google ML Kit
  // - iOS: Apple Vision
  // If unsupported, return empty array (manual fallback stays).
  try {
    if (!isSupported) return [];

    const lines = await extractTextFromImage(uri); // returns string[] :contentReference[oaicite:2]{index=2}
    const cleaned = (lines ?? [])
      .map((s) => (typeof s === "string" ? s.trim() : ""))
      .filter(Boolean);

    return cleaned.map((text) => ({ text, bbox: null }));
  } catch {
    // Never block the user: fall back to manual input.
    return [];
  }
}
