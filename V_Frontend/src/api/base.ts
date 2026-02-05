import { Platform } from "react-native";

/**
 * Physical device MUST use EXPO_PUBLIC_API_BASE_URL (LAN IP).
 * Simulators can use fallbacks.
 */
export function getApiBaseUrl(): string {
  const env = process.env.EXPO_PUBLIC_API_BASE_URL;

  if (env && env.trim().length > 0) {
    return env.trim();
  }

  if (__DEV__) {
    // fallback for simulator only
    return Platform.OS === "android"
      ? "http://10.0.2.2:8787"
      : "http://localhost:8787";
  }

  throw new Error("API base URL not configured");
}

/**
 * Stub auth headers (dev only).
 * Backend expects x-user-id.
 */
export function getStubAuthHeaders(): Record<string, string> {
  const userId =
    process.env.EXPO_PUBLIC_STUB_USER_ID || process.env.EXPO_PUBLIC_DEV_USER_ID;

  if (!userId || userId.trim().length === 0) return {};
  return { "x-user-id": userId.trim() };
}
