import express from "express";
import multer from "multer";
import Tesseract from "tesseract.js";
const { createWorker, PSM } = Tesseract;
import sharp from "sharp";
import { requireSyncMode, apiOk, apiErr } from "../../middleware/resolveContext";
import { getSyncPreferences } from "../restaurants/preferences";

// ✅ Canonical scorer
import { openAiScoreOneItem } from "../ai/openai-score";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Number(process.env.SCAN_OCR_MAX_BYTES ?? 6_000_000),
  },
});

export const scanRouter = express.Router();
export const syncScanRouter = express.Router();

function meta(req: any) {
  const mode = req?.ctx?.profileMode ?? "privacy";
  const syncMode = !!req?.ctx?.syncEnabled;
  const requestId = req?.ctx?.requestId ?? req?.id;
  return { mode, syncMode, requestId };
}

scanRouter.post("/ocr", upload.fields([{ name: "file", maxCount: 1 }, { name: "image", maxCount: 1 }]), async (req, res) => {
  try {
    const files = req.files as any;
    const f = files?.file?.[0] ?? files?.image?.[0];

    if (!f?.buffer) {
      return res.status(400).json({ meta: meta(req), error: "MISSING_IMAGE" });
    }

    const mime = (f.mimetype ?? "").toLowerCase();
    const allowed = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
    if (!allowed.has(mime)) {
      return res.status(415).json({
        meta: meta(req),
        error: "UNSUPPORTED_MEDIA_TYPE",
        message: `OCR expects an image. Got: ${mime || "unknown"}`,
      });
    }

    const prepped = await sharp(f.buffer)
      .rotate()
      .resize({ width: 1800, withoutEnlargement: true })
      .grayscale()
      .normalise()
      .sharpen()
      .threshold(160)
      .toBuffer();

    const worker = await createWorker("eng");
    try {
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        preserve_interword_spaces: "1",
        user_defined_dpi: "300",
      });

      const result = await worker.recognize(prepped);
      const text = (result?.data?.text ?? "").toString();
      const cleaned = text.replace(/[^\S\r\n]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

      return res.json({ meta: meta(req), data: { text: cleaned } });
    } finally {
      await worker.terminate();
    }
  } catch (e: any) {
    return res.status(500).json({
      meta: meta(req),
      error: "OCR_FAILED",
      message: e?.message ?? "OCR failed",
    });
  }
});

// Privacy/general analysis endpoint unchanged (your existing /analyze stays as-is)
scanRouter.post("/analyze", async (req, res) => {
  try {
    const mode: "privacy" | "sync" = req?.ctx?.profileMode ?? "privacy";
    const ocrText = String(req.body?.input?.ocrText ?? req.body?.ocrText ?? "").trim();
    if (!ocrText) {
      return res.status(400).json({
        meta: meta(req),
        error: {
          code: "MISSING_OCR_TEXT",
          message: "No label text detected.",
          action: "Scan again with better lighting or paste the label text.",
          retryable: true,
        },
      });
    }

    const lower = ocrText.toLowerCase();
    let score = 70;

    if (lower.includes("added sugar") || lower.includes("sugar")) score -= 6;
    if (lower.includes("fiber")) score += 3;
    if (lower.includes("protein")) score += 3;
    if (lower.includes("sodium")) score -= 3;

    score = Math.max(0, Math.min(100, score));

    return res.json({
      meta: meta(req),
      data: {
        nutrition: { estimated: true },
        score: {
          value: score,
          label: score >= 80 ? "Great" : score >= 65 ? "Good" : "hmm..Not so good",
          kind: "general",
          reasons: [{ type: "general", text: "General estimate based only on label text (no profile used)." }],
        },
        ai: {
          confidence: 0.45,
          explanation: [
            "This is a general assessment based only on the label text.",
            "Enable Sync Mode for personalized scoring based on your goals.",
          ],
          fallbackUsed: false,
        },
        nextActions:
          mode === "sync"
            ? [{ type: "sync_score", label: "Get personalized score", endpoint: "/v1/sync/scan/score-v1" }]
            : [{ type: "enable_sync", label: "Enable Sync for personalized scoring" }],
      },
    });
  } catch (e: any) {
    return res.status(500).json({
      meta: meta(req),
      error: {
        code: "ANALYZE_FAILED",
        message: "We couldn’t analyze this scan.",
        action: "Try again or paste the label text.",
        retryable: true,
      },
    });
  }
});



const syncScanScoreHandler = async (req: any, res: any) => {
  try {
    // Accept BOTH payload shapes so old clients keep working:
    // - v1: { context:"food_scan", input:{ text } }
    // - legacy: { input:{ ocrText } } or { ocrText }
    const context = String(req.body?.context ?? "food_scan").trim();
    const input = req.body?.input ?? {};

    if (context !== "food_scan") {
      const r = apiErr(req, "UNSUPPORTED_CONTEXT", "Unsupported scoring context.", "Try again.", 400, true);
      return res.status(r.status).json(r.body);
    }

    const text =
      String(input?.text ?? "").trim() ||
      String(input?.ocrText ?? "").trim() ||
      String(req.body?.ocrText ?? "").trim();

    if (!text) {
      const r = apiErr(req, "MISSING_TEXT", "No food text provided.", "Type what you ate and try again.", 400, true);
      return res.status(r.status).json(r.body);
    }

    const prefs = getSyncPreferences(req);

    const scoringJson = await openAiScoreOneItem({
      source: "scan",
      mode: "text",
      itemName: text,
      ingredients: null,
      cuisine: null,
      mealType: null,
      userPreferences: prefs,
    });

    return res.json(
      apiOk(req, {
        scoring: {
          score: scoringJson.score,
          label: scoringJson.label,
          reasons: scoringJson.reasons,
          flags: scoringJson.flags,
        },
        scoringJson,
      })
    );
  } catch (e) {
    const r = apiErr(req, "SYNC_SCORE_FAILED", "Could not score.", "Try again.", 500, true);
    return res.status(r.status).json({ ...r.body, debug: { message: (e as Error)?.message ?? "unknown" } });
  }
};



/**
 * ✅ Sync scoring v1 (canonical output)
 * POST /v1/sync/scan/score-v1
 * Body: { context: "food_scan", input: { text: string } }
 */
syncScanRouter.post("/score-v1", requireSyncMode(), syncScanScoreHandler);
syncScanRouter.post("/score", requireSyncMode(), syncScanScoreHandler);
