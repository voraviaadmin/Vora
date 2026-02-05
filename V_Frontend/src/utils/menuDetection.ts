export type DetectedTextBox = {
    id: string;
    text: string;
    bounds: { x: number; y: number; width: number; height: number };
    confidence: number;
  };
  
  /**
   * Privacy-safe detection.
   * Must run fully on-device.
   * Never uploads image.
   */
  export async function detectMenuTextBoxes(
    imageUri: string
  ): Promise<DetectedTextBox[]> {
    // PLATFORM-SPECIFIC IMPLEMENTATION REQUIRED
    // iOS: Vision / Live Text
    // Android: ML Kit Text Recognition
  
    // Stub so UI works immediately
    return [];
  }
  