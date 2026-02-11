// src/modules/ai/openai-score.ts
import { AiScoringSchema, type AiScoring } from "../scoring";

type ScoreSource = "menu" | "scan";

type CommonArgs = {
  source: ScoreSource;
  cuisine?: string | null;
  mealType?: string | null;
  userPreferences?: unknown;
  model?: string; // optional override
};

/**
 * Public canonical entrypoint.
 * Routers should ONLY import and call this.
 */
export async function openAiScoreOneItem(
  args:
    | (CommonArgs & {
        mode: "text";
        itemName: string;
        ingredients?: string | null;
      })
    | (CommonArgs & {
        mode: "vision";
        imageBuffer: Buffer;
        mime: string;
        detectedText?: string | null; // OCR text if available
      })
): Promise<AiScoring> {
  if (args.mode === "vision") {
    return scoreVisionOne(args);
  }
  return scoreTextOne(args);
}

/**
 * Batch helper for menu scoring (text list -> scoring per item).
 * Keeps routers clean and avoids duplicating loops.
 */
export async function openAiScoreManyText(args: CommonArgs & { items: Array<{ name: string; ingredients?: string | null }> }): Promise<Array<{ name: string; scoringJson: AiScoring }>> {
  const out: Array<{ name: string; scoringJson: AiScoring }> = [];
  for (const it of args.items ?? []) {
    const name = String(it?.name ?? "").trim();
    if (!name) continue;

    const scoringJson = await openAiScoreOneItem({
      source: args.source,
      mode: "text",
      itemName: name,
      ingredients: it.ingredients ?? null,
      cuisine: args.cuisine ?? null,
      mealType: args.mealType ?? null,
      userPreferences: args.userPreferences,
      model: args.model,
    });

    out.push({ name, scoringJson });
  }
  return out;
}

/* -----------------------------------------
 * Internal specialized scorers (do not import
 * directly from routers)
 * ----------------------------------------- */

async function scoreTextOne(args: CommonArgs & { mode: "text"; itemName: string; ingredients?: string | null }): Promise<AiScoring> {
  const apiKey = requireOpenAIKey();
  const model = args.model ?? process.env.OPENAI_TEXT_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

  const prompt = buildTextPrompt({
    source: args.source,
    itemName: args.itemName,
    ingredients: args.ingredients ?? null,
    cuisine: args.cuisine ?? null,
    mealType: args.mealType ?? null,
    userPreferences: args.userPreferences ?? null,
  });

  const json = await callOpenAIJson({ apiKey, model, prompt, maxOutputTokens: 900 });

  // ✅ Enforce canonical contract
  return AiScoringSchema.parse(json);
}

async function scoreVisionOne(
  args: CommonArgs & { mode: "vision"; imageBuffer: Buffer; mime: string; detectedText?: string | null }
): Promise<AiScoring> {
  const apiKey = requireOpenAIKey();
  const model = args.model ?? process.env.OPENAI_VISION_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

  const b64 = args.imageBuffer.toString("base64");

  const prompt = buildVisionPrompt({
    source: args.source,
    detectedText: args.detectedText ?? null,
    cuisine: args.cuisine ?? null,
    mealType: args.mealType ?? null,
    userPreferences: args.userPreferences ?? null,
  });

  const json = await callOpenAIVisionJson({
    apiKey,
    model,
    prompt,
    mime: args.mime,
    imageDataUrl: `data:${args.mime};base64,${b64}`,
    maxOutputTokens: 1200,
  });

  // ✅ Enforce canonical contract
  return AiScoringSchema.parse(json);
}

/* -----------------------
 * Prompt builders
 * ----------------------- */

function buildTextPrompt(args: {
  source: ScoreSource;
  itemName: string;
  ingredients: string | null;
  cuisine: string | null;
  mealType: string | null;
  userPreferences: unknown;
}): string {
  return `
Score ONE ${args.source === "menu" ? "restaurant menu item" : "scanned food item"} for a user.

User preferences JSON:
${JSON.stringify(args.userPreferences ?? null)}

Item:
- name: ${args.itemName}
- ingredients: ${args.ingredients ?? "unknown"}
- cuisine: ${args.cuisine ?? "unknown"}
- mealType: ${args.mealType ?? "unknown"}

Return STRICT JSON only with EXACT keys:
{
  "score": number (0-100),
  "label": "Good" | "Ok" | "Not Preferred",
  "why": string (1-2 sentences, plain English),
  "reasons": string[] (2-3 short bullets),
  "flags": string[] (0-8 items),
  "nutritionNotes": string|null,
  "estimates": {
    "calories": number|null,
    "protein_g": number|null,
    "carbs_g": number|null,
    "fat_g": number|null,
    "sugar_g": number|null,
    "sodium_mg": number|null
  },
  "features": {
    "cuisineMatch": "high"|"medium"|"low",
    "goalAlignment": "high"|"medium"|"low",
    "healthRisk": "low"|"medium"|"high",
    "satiety": "low"|"medium"|"high"
  }
}

Rules:
- Output JSON ONLY (no markdown, no extra text)
- If ingredients unknown, keep estimates mostly null and avoid overconfident flags
- Keep "why" short and user-friendly
- reasons must be short
`.trim();
}

function buildVisionPrompt(args: {
  source: ScoreSource;
  detectedText: string | null;
  cuisine: string | null;
  mealType: string | null;
  userPreferences: unknown;
}): string {
  return `
You will score ONE food item from an image for a user.

User preferences JSON:
${JSON.stringify(args.userPreferences ?? null)}

Context:
- source: ${args.source}
- cuisine: ${args.cuisine ?? "unknown"}
- mealType: ${args.mealType ?? "unknown"}
- detectedText (OCR if provided): ${args.detectedText ?? "none"}

Task:
- Identify the most likely single food item shown (or described by detectedText).
- Score it for the user's health goal and preferences.

Return STRICT JSON only with EXACT keys:
{
  "score": number (0-100),
  "label": "Good" | "Ok" | "Not Preferred",
  "why": string (1-2 sentences, plain English),
  "reasons": string[] (2-3 short bullets),
  "flags": string[] (0-8 items),
  "nutritionNotes": string|null,
  "estimates": {
    "calories": number|null,
    "protein_g": number|null,
    "carbs_g": number|null,
    "fat_g": number|null,
    "sugar_g": number|null,
    "sodium_mg": number|null
  },
  "features": {
    "cuisineMatch": "high"|"medium"|"low",
    "goalAlignment": "high"|"medium"|"low",
    "healthRisk": "low"|"medium"|"high",
    "satiety": "low"|"medium"|"high"
  }
}

Rules:
- Output JSON ONLY (no markdown, no extra text)
- If uncertain about what the item is, prefer label "Ok", lower score, and keep estimates null
- Do not invent ingredients
`.trim();
}

/* -----------------------
 * OpenAI callers
 * ----------------------- */

async function callOpenAIJson(args: { apiKey: string; model: string; prompt: string; maxOutputTokens: number }): Promise<unknown> {
  const resp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: args.model,
      temperature: 0, // deterministic
      max_output_tokens: args.maxOutputTokens,
      text: { format: { type: "json_object" } },
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: "Output ONLY valid JSON. No markdown. No extra text." }],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: args.prompt }],
        },
      ],
    }),
  });

  return parseResponsesJson(resp, "OPENAI_FAIL_SCORE_TEXT");
}

async function callOpenAIVisionJson(args: {
  apiKey: string;
  model: string;
  prompt: string;
  mime: string;
  imageDataUrl: string;
  maxOutputTokens: number;
}): Promise<unknown> {
  const resp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: args.model,
      temperature: 0, // deterministic
      max_output_tokens: args.maxOutputTokens,
      text: { format: { type: "json_object" } },
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: "Output ONLY valid JSON. No markdown. No extra text." }],
        },
        {
          role: "user",
          content: [
            { type: "input_text", text: args.prompt },
            { type: "input_image", image_url: args.imageDataUrl },
          ],
        },
      ],
    }),
  });

  return parseResponsesJson(resp, "OPENAI_FAIL_SCORE_VISION");
}

async function parseResponsesJson(resp: Response, tag: string): Promise<unknown> {
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    console.error(tag, resp.status, txt.slice(0, 250));
    throw new Error(`${tag}:${resp.status}:${txt.slice(0, 250)}`);
  }

  const json = await resp.json();

  // Prefer structured output in Responses API
  const outText =
    json?.output?.[0]?.content?.find((c: any) => c?.type === "output_text")?.text ??
    json?.output_text ??
    "";

  if (!outText || typeof outText !== "string") {
    throw new Error("OPENAI_RETURNED_EMPTY_OUTPUT");
  }

  try {
    return JSON.parse(outText);
  } catch {
    // In case model returns already-parsed object somehow (rare), try fallback
    if (typeof (json as any) === "object" && json) return json;
    throw new Error("OPENAI_RETURNED_NON_JSON");
  }
}

function requireOpenAIKey(): string {
  const k = process.env.OPENAI_API_KEY;
  if (!k) throw new Error("OPENAI_API_KEY_MISSING");
  return k;
}
