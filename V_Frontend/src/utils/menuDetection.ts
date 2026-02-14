// V_Frontend/utils/menuDetection.ts
import { Platform } from "react-native";

export type TextBox = {
  text: string;
  bbox?: { x: number; y: number; width: number; height: number } | null;
};

/**
 * Phase 1: OCR disabled (privacy-safe).
 * This prevents build failures from missing/brittle OCR deps.
 * Later we will plug in:
 * - iOS: Apple Vision (on-device)
 * - Android: ML Kit (on-device)
 *
 * Returning [] ensures menu-scan falls back to manual selection/input.
 */
export async function detectMenuTextBoxes(_uri: string): Promise<TextBox[]> {
  // Optional debug:
  // console.log(`[menuDetection] OCR disabled on ${Platform.OS}`);
  return [];
}
