// src/modules/restaurants/openai-score.ts

/*export async function openAiScoreVision(args: {
    apiKey: string;
    model: string;
    imageBuffer: Buffer;
    mime: string;
    preferences: any;
  }) {
    // MOVE the exact existing implementation here from restaurants/router.ts
  }
  
  export async function openAiScoreText(args: {
    apiKey: string;
    model: string;
    items: Array<{ name: string; description?: string }>;
    preferences: any;
  }) {
    // MOVE the exact existing implementation here from restaurants/router.ts
  }*/
  

  export async function openAiScoreVision(args: {
  apiKey: string;
  model: string;
  imageBuffer: Buffer;
  mime: string;
  preferences: any;
}) {
  const b64 = args.imageBuffer.toString("base64");

  const resp: Response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: args.model,
      temperature: 0.2,
      max_output_tokens: 1200,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
`You are scoring restaurant menu items for a user.
Use the user's preferences JSON:

${JSON.stringify(args.preferences ?? null)}

Extract menu items from the image and score them.
Return STRICT JSON only:
{
  "items":[{"name":string,"score":number,"confidence":number,"reason":string}],
  "rawLines":[string],
  "overallConfidence":number
}

Rules:
- score 0..100
- confidence 0..1
- reason <= 140 chars
- items <= 40`
            },
            {
              type: "input_image",
              image_url: `data:${args.mime};base64,${b64}`
            },
          ],
        },
      ],
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    console.error("OPENAI_FAIL_SCORE_VISION", resp.status, txt.slice(0, 250));
    throw new Error(`OPENAI_VISION_FAILED:${resp.status}:${txt.slice(0, 250)}`);
  }

  const json = await resp.json();
  const outText =
    json?.output?.[0]?.content?.find((c: any) => c?.type === "output_text")?.text ??
    json?.output_text ??
    "";

  return JSON.parse(outText);
}

export async function openAiScoreText(args: {
  apiKey: string;
  model: string;
  items: { name: string }[];
  preferences: any;
}) {
  const resp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: args.model,
      temperature: 0.2,
      max_output_tokens: 900,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
`Score these selected menu items for the user.

Preferences JSON:
${JSON.stringify(args.preferences ?? null)}

Selected items:
${JSON.stringify(args.items)}

Return STRICT JSON only:
{
  "items":[{"name":string,"score":number,"confidence":number,"reason":string}],
  "overallConfidence":number
}

Rules:
- items must match provided names (no hallucinations)
- score 0..100
- confidence 0..1
- reason <= 140 chars`
            },
          ],
        },
      ],
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    console.error("OPENAI_FAIL_SCORE_TEXT", resp.status, txt.slice(0, 250));
    throw new Error(`OPENAI_TEXT_FAILED:${resp.status}:${txt.slice(0, 250)}`);
  }

  const json = await resp.json();
  const outText =
    json?.output?.[0]?.content?.find((c: any) => c?.type === "output_text")?.text ??
    json?.output_text ??
    "";

  return JSON.parse(outText);
}


