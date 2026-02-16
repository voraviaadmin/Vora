// src/modules/ai/openai-score.ts
import { z } from "zod";
import { AiScoringSchema, type AiScoring } from "../scoring";

type ScoreSource = "menu" | "scan";

type CommonArgs = {
  source: ScoreSource;
  cuisine?: string | null;
  mealType?: string | null;
  userPreferences?: unknown;
  model?: string; // optional override
};

export type AiVisionScoreResult = {
  itemName: string;
  scoringJson: AiScoring;
};




/**
 * Public canonical entrypoint.
 * Routers should ONLY import and call this.
 */


export async function openAiScoreOneItem(
  args: CommonArgs & {
    mode: "text";
    itemName: string;
    ingredients?: string | null;
  }
): Promise<AiScoring>;

export async function openAiScoreOneItem(
  args: CommonArgs & {
    mode: "vision";
    imageBuffer: Buffer;
    mime: string;
    detectedText?: string | null;
  }
): Promise<AiVisionScoreResult>;



export async function openAiScoreOneItem(
  args:
    | (CommonArgs & { mode: "text"; itemName: string; ingredients?: string | null })
    | (CommonArgs & { mode: "vision"; imageBuffer: Buffer; mime: string; detectedText?: string | null })
): Promise<AiScoring | AiVisionScoreResult> {
  if (args.mode === "vision") {
    return scoreVisionOne(args);
  }
  return scoreTextOne(args);
}

/*export async function openAiScoreOneItem(
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
    
      | (CommonArgs & { mode: "text"; itemName: string; ingredients?: string | null })
      | (CommonArgs & { mode: "vision"; imageBuffer: Buffer; mime: string; detectedText?: string | null })
  ): Promise<AiScoring | AiVisionScoreResult> {
    if (args.mode === "vision") {
      return scoreVisionOne(args); // will return AiVisionScoreResult
    }
    return scoreTextOne(args); // returns AiScoring
  }*/

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

export async function openAiScorePlateV2(args: CommonArgs & {
  imageBuffer: Buffer;
  mime: string;
  detectedText?: string | null;
}): Promise<PlateScoreJsonV2> {
  const apiKey = requireOpenAIKey();
  const model = args.model ?? process.env.OPENAI_VISION_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

  const b64 = args.imageBuffer.toString("base64");

  const prompt = buildPlateVisionPrompt({
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
    maxOutputTokens: 1600, // plate needs more room
  });

  // ✅ strongly recommended: validate shape with zod
  const PlateSchema = z.object({
    items: z.array(z.object({
      itemName: z.string(),
      description: z.string().nullable(),
      portion: z.object({ grams: z.number().nullable(), serving: z.string() }),
      confidence: z.number(),
      scoring: z.object({
        score: z.number(),
        label: z.enum(["Good", "Ok", "Not Preferred"]),
        why: z.string(),
        reasons: z.array(z.string()),
        flags: z.array(z.string()),
        nutritionNotes: z.string().nullable(),
        estimates: z.object({
          calories: z.number().nullable(),
          protein_g: z.number().nullable(),
          carbs_g: z.number().nullable(),
          fat_g: z.number().nullable(),
          fiber_g: z.number().nullable(),
          sugar_g: z.number().nullable(),
          sodium_mg: z.number().nullable(),
        }),
        features: z.object({
          cuisineMatch: z.enum(["high", "medium", "low"]),
          goalAlignment: z.enum(["high", "medium", "low"]),
          healthRisk: z.enum(["low", "medium", "high"]),
          satiety: z.enum(["low", "medium", "high"]),
        }),
      }),
    })),
    totalMealNutrition: z.object({
      calories: z.number().nullable(),
      protein_g: z.number().nullable(),
      carbs_g: z.number().nullable(),
      fat_g: z.number().nullable(),
      fiber_g: z.number().nullable(),
      sugar_g: z.number().nullable(),
      sodium_mg: z.number().nullable(),
    }),
    overall: z.object({
      score: z.number(),
      label: z.enum(["Good", "Ok", "Not Preferred"]),
      why: z.string(),
      flags: z.array(z.string()),
    }),
  });

  return PlateSchema.parse(json) as PlateScoreJsonV2;
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
): Promise<AiVisionScoreResult> {
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


  const VisionWrapperSchema = z.object({
    itemName: z.string().min(1).max(50),

    scoringJson: AiScoringSchema,
  });
  

  // ✅ Enforce: Vision returns wrapper { itemName, scoringJson }, and scoringJson is canonical
  const validated = VisionWrapperSchema.parse(json);

  // Normalize itemName a bit (keep it short, no punctuation-heavy sentences)
  const itemName = String(validated.itemName)
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.?!,:;]+$/g, "")
    .slice(0, 50);


   /* let s = validated.scoringJson.score;

    // If model returns 0–10, upscale (8 => 80)
    if (typeof s === "number" && s >= 0 && s <= 10) {
      s = Math.round(s * 10);
    }
    
    // Clamp to 0–100
    s = Math.max(0, Math.min(100, Math.round(s)));
    
    const scoringJson = { ...validated.scoringJson, score: s };*/


  return { itemName, scoringJson: validated.scoringJson };
}


async function scoreVisionPlateV2(
  args: CommonArgs & { mode: "vision"; imageBuffer: Buffer; mime: string; detectedText?: string | null }
): Promise<PlateScoreJsonV2> {
  const apiKey = requireOpenAIKey();
  const model = args.model ?? process.env.OPENAI_VISION_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

  const b64 = args.imageBuffer.toString("base64");

  const prompt = buildPlateVisionPrompt({
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
    maxOutputTokens: 1800,
  });

  return PlateScoreJsonV2Schema.parse(json);
}


/* -----------------------
 * Prompt builders
 * ----------------------- */

export type PlateScoreJsonV2 = {
  items: Array<{
    itemName: string;                 // concise, 2–6 words
    description: string | null;       // optional, short
    portion: { grams: number | null; serving: string };
    confidence: number;              // 0..1

    scoring: {
      score: number;                 // 0..100
      label: "Good" | "Ok" | "Not Preferred";
      why: string;
      reasons: string[];
      flags: string[];
      nutritionNotes: string | null;
      estimates: {
        calories: number | null;
        protein_g: number | null;
        carbs_g: number | null;
        fat_g: number | null;
        fiber_g: number | null;      // NEW (optional but recommended)
        sugar_g: number | null;
        sodium_mg: number | null;
      };
      features: {
        cuisineMatch: "high" | "medium" | "low";
        goalAlignment: "high" | "medium" | "low";
        healthRisk: "low" | "medium" | "high";
        satiety: "low" | "medium" | "high";
      };
    };
  }>;

  totalMealNutrition: {
    calories: number | null;
    protein_g: number | null;
    carbs_g: number | null;
    fat_g: number | null;
    fiber_g: number | null;
    sugar_g: number | null;
    sodium_mg: number | null;
  };

  overall: {
    score: number; // 0..100 (weighted by calories or grams)
    label: "Good" | "Ok" | "Not Preferred";
    why: string;   // 1-2 sentences
    flags: string[];
  };
};


const PlateScoreJsonV2Schema = z.object({
  items: z.array(z.object({
    itemName: z.string().min(1),
    description: z.string().nullable(),
    portion: z.object({
      grams: z.number().nullable(),
      serving: z.string().min(1),
    }),
    confidence: z.number().min(0).max(1),
    scoring: z.object({
      score: z.number().min(0).max(100),
      label: z.enum(["Good", "Ok", "Not Preferred"]),
      why: z.string(),
      reasons: z.array(z.string()),
      flags: z.array(z.string()),
      nutritionNotes: z.string().nullable(),
      estimates: z.object({
        calories: z.number().nullable(),
        protein_g: z.number().nullable(),
        carbs_g: z.number().nullable(),
        fat_g: z.number().nullable(),
        fiber_g: z.number().nullable(),
        sugar_g: z.number().nullable(),
        sodium_mg: z.number().nullable(),
      }),
      features: z.object({
        cuisineMatch: z.enum(["high", "medium", "low"]),
        goalAlignment: z.enum(["high", "medium", "low"]),
        healthRisk: z.enum(["low", "medium", "high"]),
        satiety: z.enum(["low", "medium", "high"]),
      }),
    }),
  })),
  totalMealNutrition: z.object({
    calories: z.number().nullable(),
    protein_g: z.number().nullable(),
    carbs_g: z.number().nullable(),
    fat_g: z.number().nullable(),
    fiber_g: z.number().nullable(),
    sugar_g: z.number().nullable(),
    sodium_mg: z.number().nullable(),
  }),
  overall: z.object({
    score: z.number().min(0).max(100),
    label: z.enum(["Good", "Ok", "Not Preferred"]),
    why: z.string(),
    flags: z.array(z.string()),
  }),
});


export async function openAiScoreFullPlate(
  args: CommonArgs & {
    mode: "vision_plate";
    imageBuffer: Buffer;
    mime: string;
    detectedText?: string | null;
  }
): Promise<PlateScoreJsonV2> {
  const apiKey = requireOpenAIKey();
  const model = args.model ?? process.env.OPENAI_VISION_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

  const b64 = args.imageBuffer.toString("base64");

  const prompt = buildPlateVisionPrompt({
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
    maxOutputTokens: 2000,
  });

  // Enforce strict contract
  return PlateScoreJsonV2Schema.parse(json) as PlateScoreJsonV2;
}


export async function openAiScorePlateVision(
  args: CommonArgs & {
    imageBuffer: Buffer;
    mime: string;
    detectedText?: string | null;
  }
): Promise<PlateScoreJsonV2> {
  const apiKey = requireOpenAIKey();
  const model = args.model ?? process.env.OPENAI_VISION_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

  const b64 = args.imageBuffer.toString("base64");

  const prompt = buildPlateVisionPrompt({
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
    maxOutputTokens: 2000,
  });

  // TODO: strongly recommended: validate with zod schema for PlateScoreJsonV2
  return json as PlateScoreJsonV2;
}


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

Return JSON only in this exact format:

{
  "itemName": "<2-4 word food name>",
  "scoringJson": {
    "score": number (0-100),
    "label":"Good" | "Ok" | "Not Preferred",
    "why": "1–2 sentence explanation",
    "reasons": ["short bullet", "..."],
    "flags": string[] (0-8 items),
    "nutritionNotes": string|null,
    "estimates": {
      "calories": number | null,
      "protein_g": number | null,
      "carbs_g": number | null,
      "fat_g": number | null,
      "sugar_g": number | null,
      "sodium_mg": number | null
    },
    "features": {
      "cuisineMatch": "high|medium|low",
      "goalAlignment": "high|medium|low",
      "healthRisk": "low|medium|high",
      "satiety": "low|medium|high"
    }
  }
}

Rules:
- itemName must be concise (2–4 words).
- Do NOT include explanations in itemName.
- scoringJson must strictly follow schema.
- Return JSON only.
`.trim();
}


function buildPlateVisionPrompt(args: {
  detectedText: string | null;
  cuisine: string | null;
  mealType: string | null;
  userPreferences: unknown;
}): string {
  return `
You are a certified clinical nutritionist and global food recognition expert.

Analyze the entire meal image and return FULL PLATE intelligence.

User preferences JSON:
${JSON.stringify(args.userPreferences ?? null)}

Context:
- cuisine: ${args.cuisine ?? "unknown"}
- mealType: ${args.mealType ?? "unknown"}
- detectedText (OCR if provided): ${args.detectedText ?? "none"}

Requirements (must follow):
1) Identify ALL visible food items (include small bowls/sides/condiments).
2) Estimate portion per item in grams AND serving words.
3) Provide nutrition estimates per item:
   calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg.
4) Score EACH item using the same scoring rubric you use today (0-100, Good/Ok/Not Preferred).
5) Provide total meal nutrition as the sum of item estimates (sum only fields that are not null).
6) Provide an overall meal score (weighted by item calories when available; otherwise grams; otherwise equal weight).
7) Handle uncertainty:
   - include confidence (0..1) per item
   - if uncertain, set nutrition fields to null and lower confidence
   - do NOT hallucinate brand names

Return STRICT JSON only with EXACT keys and structure:

{
  "items": [
    {
      "itemName": "",
      "description": null,
      "portion": { "grams": null, "serving": "" },
      "confidence": 0.0,
      "scoring": {
        "score": 0,
        "label": "Good",
        "why": "",
        "reasons": [],
        "flags": [],
        "nutritionNotes": null,
        "estimates": {
          "calories": null,
          "protein_g": null,
          "carbs_g": null,
          "fat_g": null,
          "fiber_g": null,
          "sugar_g": null,
          "sodium_mg": null
        },
        "features": {
          "cuisineMatch": "low",
          "goalAlignment": "low",
          "healthRisk": "low",
          "satiety": "low"
        }
      }
    }
  ],
  "totalMealNutrition": {
    "calories": null,
    "protein_g": null,
    "carbs_g": null,
    "fat_g": null,
    "fiber_g": null,
    "sugar_g": null,
    "sodium_mg": null
  },
  "overall": {
    "score": 0,
    "label": "Good",
    "why": "",
    "flags": []
  }
}

Rules:
- Output JSON ONLY. No markdown. No extra keys.
- Every item must have portion.serving filled even if grams is null.
- Keep reasons 2–3 short bullets per item.
- flags max 8 per item; overall.flags max 8.
`.trim();
}



function buildVisionPreflightPrompt(): string {
  return `
Decide if the image shows a SINGLE main food item or a FULL PLATE with MULTIPLE items.

Return JSON only:
{
  "kind": "single" | "plate" | "uncertain",
  "reason": "short",
  "itemHint": string|null
}

Rules:
- "single" = one dominant item (e.g., burger, bowl, sandwich) with maybe minor garnish.
- "plate" = multiple distinct items/sides (e.g., rice + curry + roti + salad).
- If not sure, return "uncertain".
- itemHint is a 2-4 word guess only when kind="single".
`.trim();
}


export async function openAiVisionPreflight(args: {
  imageBuffer: Buffer;
  mime: string;
  model?: string;
}): Promise<{ kind: "single" | "plate" | "uncertain"; reason?: string; itemHint?: string | null }> {
  const apiKey = requireOpenAIKey();
  const model = args.model ?? process.env.OPENAI_VISION_PREFLIGHT_MODEL ?? process.env.OPENAI_VISION_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

  const b64 = args.imageBuffer.toString("base64");
  const prompt = `
Decide if the image shows a SINGLE main food item or a FULL PLATE with MULTIPLE items.

Return JSON only:
{ "kind":"single"|"plate"|"uncertain", "reason":"short", "itemHint":string|null }

Rules:
- "single" = one dominant item (burger, bowl, sandwich) with maybe garnish.
- "plate" = multiple distinct items/sides (rice + curry + roti + salad).
- If not sure, "uncertain".
- itemHint only when kind="single" (2-4 words).
`.trim();

  const json = await callOpenAIVisionJson({
    apiKey,
    model,
    prompt,
    mime: args.mime,
    imageDataUrl: `data:${args.mime};base64,${b64}`,
    maxOutputTokens: 180,
  });

  const PreflightSchema = z.object({
    kind: z.enum(["single", "plate", "uncertain"]),
    reason: z.string().optional(),
    itemHint: z.string().nullable().optional(),
  });

  return PreflightSchema.parse(json);
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
