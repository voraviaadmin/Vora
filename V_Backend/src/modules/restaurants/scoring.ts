import { hasOpenAIKey } from "../../config/openai";
import { openAiScoreText, openAiScoreVision } from "./openai-score"; // adjust if file name differs

export async function scoreFoodScanSync(args: {
  apiKey: string;
  modelText: string;
  modelVision: string;
  text?: string;
  imageBuffer?: Buffer;
  mime?: string;
  preferences: any;
}) {
  if (!hasOpenAIKey()) {
    throw new Error("OPENAI_NOT_CONFIGURED");
  }

  const { apiKey, modelText, modelVision, text, imageBuffer, mime, preferences } = args;

  let parsed: any;

  // CAMERA FLOW
  if (imageBuffer) {
    if (!mime) throw new Error("MISSING_MIME");

    parsed = await openAiScoreVision({
      apiKey,
      model: modelVision,
      imageBuffer,
      mime,
      preferences,
    });
  }
  // TEXT FLOW
  else {
    const t = String(text ?? "").trim();
    if (!t) throw new Error("MISSING_TEXT");

    parsed = await openAiScoreText({
      apiKey,
      model: modelText,
      items: [{ name: t }],
      preferences,
    });
  }

  const first = Array.isArray(parsed?.items) ? parsed.items[0] : null;

  const score = Math.max(0, Math.min(100, Number(first?.score ?? 0)));
  const reason = String(first?.reason ?? "").trim();

  return {
    scoring: {
      score,
      label: score >= 80 ? "Great" : score >= 65 ? "Good" : "Needs work",
      reasons: reason
        ? [reason]
        : [
            "Accounting for your health profile and goals.",
            "Based on typical nutrition impact for this food.",
            "Consistency improves accuracy over time.",
          ],
    },
  };
}
