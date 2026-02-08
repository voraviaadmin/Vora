import express from "express";
import multer from "multer";
import Tesseract from "tesseract.js";
const { createWorker, PSM } = Tesseract;
import sharp from "sharp";
import { requireSyncMode, apiOk, apiErr } from "../../middleware/resolveContext";
import { getSyncPreferences } from "../restaurants/preferences";
import { scoreFoodScanSync } from "../restaurants/scoring";

// IMPORTANT: memory storage (privacy-first, no disk writes)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Number(process.env.SCAN_OCR_MAX_BYTES ?? 6_000_000), // env-tunable
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




/**
 * POST /v1/scan/ocr
 * multipart/form-data: file=<file> (also accepts image=<file>)
 * Returns: { text: string }
 *
 * Privacy-first:
 * - does not store the image
 * - processes in memory and discards buffer
 */
scanRouter.post("/ocr", upload.fields([{ name: "file", maxCount: 1 }, { name: "image", maxCount: 1 }]), async (req, res) => {
  try {
    
    const files = req.files as any;
    const f = files?.file?.[0] ?? files?.image?.[0];

    if (!f?.buffer) {

      return res.status(400).json({
        meta: meta(req),
        error: "MISSING_IMAGE",
      });
    
    
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
    

// Preprocess to improve label OCR (rotation + contrast + crisp text)
const prepped = await sharp(f.buffer)
  .rotate() // honors EXIF if present; also normalizes orientation in many cases
  .resize({ width: 1800, withoutEnlargement: true }) // helps small text
  .grayscale()
  .normalise()
  .sharpen()
  .threshold(160) // tweak 140–180 if needed
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
    const cleaned = text
    .replace(/[^\S\r\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  
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

    // ✅ General-only analysis. No profile, no goal-based ranking, no personalized labeling.
    const lower = ocrText.toLowerCase();
    let score = 70;

    // Light heuristics placeholder (privacy-safe)
    if (lower.includes("added sugar") || lower.includes("sugar")) score -= 6;
    if (lower.includes("fiber")) score += 3;
    if (lower.includes("protein")) score += 3;
    if (lower.includes("sodium")) score -= 3;

    score = Math.max(0, Math.min(100, score));

    // ✅ HARD RULE: analyze is ALWAYS general
    const kind = "general" as const;

    // Confidence here should reflect OCR + heuristic reliability (not profile fit)
    const confidence = 0.45;

    return res.json({
      meta: meta(req),
      data: {
        nutrition: { estimated: true },
        score: {
          value: score,
          label: score >= 80 ? "Great" : score >= 65 ? "Good" : "Needs work",
          kind,
          reasons: [{ type: "general", text: "General estimate based only on label text (no profile used)." }],
        },
        ai: {
          confidence,
          explanation: [
            "This is a general assessment based only on the label text.",
            "Enable Sync Mode for personalized scoring based on your goals.",
          ],
          fallbackUsed: false,
        },
        nextActions:
          mode === "sync"
            ? [{ type: "sync_score", label: "Get personalized score", endpoint: "/v1/sync/scan/score" }]
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




syncScanRouter.post("/score", requireSyncMode(), async (req, res) => {
  try {
    const ocrText = String(req.body?.input?.ocrText ?? req.body?.ocrText ?? "").trim();
    if (!ocrText) {
      const r = apiErr(req, "MISSING_OCR_TEXT", "No label text detected.", "Scan again with better lighting or paste the label text.", 400, true);
      return res.status(r.status).json(r.body);
    }

    // Phase 1 stub personalized scoring (replace with OpenAI provider adapter next)
    // IMPORTANT: this endpoint is where "personalized" is allowed.
    const lower = ocrText.toLowerCase();
    let score = 75;
    if (lower.includes("added sugar") || lower.includes("sugar")) score -= 6;
    if (lower.includes("fiber")) score += 3;
    if (lower.includes("protein")) score += 3;
    if (lower.includes("sodium")) score -= 3;
    score = Math.max(0, Math.min(100, score));

    return res.json(
      apiOk(req, {
        nutrition: { estimated: true },
        score: {
          value: score,
          label: score >= 80 ? "Great" : score >= 65 ? "Good" : "Needs work",
          kind: "personalized",
          reasons: [
            { type: "info", text: "Personalized scoring stub (AI provider wiring next)." },
          ],
        },
        ai: {
          confidence: 0.7,
          explanation: [
            "This is personalized scoring (Sync Mode).",
            "Next phase will use AI nutrition inference + your goals.",
          ],
          fallbackUsed: false,
        },
      })
    );
  } catch (e: any) {
    const r = apiErr(req, "SYNC_SCORE_FAILED", "We couldn’t score this scan.", "Try again or paste the label text.", 500, true);
    return res.status(r.status).json(r.body);
  }
});


/**
 * POST /v1/sync/scan/score
 * Unified scoring contract v1 (Sync-only, OpenAI authoritative)
 * Body: { context: "food_scan" | "menu_scan" | "eatout_menu", input: { text?: string, menuItems?: [...] } }
 *
 * NOTE: Backend must enrich with profile + goals. Frontend should not hardcode profile fields.
 */
syncScanRouter.post("/score-v1", requireSyncMode(), async (req, res) => {
  try {
    const context = String(req.body?.context ?? "").trim();
    const input = req.body?.input ?? {};

    if (!context) {
      const r = apiErr(req, "MISSING_CONTEXT", "Missing context.", "Try again.", 400, true);
      return res.status(r.status).json(r.body);
    }

    // Food scan (typed)
    const text = String(input?.text ?? "").trim();

    if (context === "food_scan") {
      if (!text) {
        const r = apiErr(req, "MISSING_TEXT", "No food text provided.", "Type what you ate and try again.", 400, true);
        return res.status(r.status).json(r.body);
      }

      const apiKey = String(process.env.OPENAI_API_KEY ?? "").trim();
      if (!apiKey) {
        const r = apiErr(req, "MISSING_OPENAI_KEY", "Scoring not configured.", "Try later.", 500, false);
        return res.status(r.status).json(r.body);
      }
      
      const prefs = getSyncPreferences(req);
      
      const result = await scoreFoodScanSync({
        apiKey,
        modelText: String(process.env.OPENAI_TEXT_MODEL ?? "gpt-4o-mini"),
        modelVision: String(process.env.OPENAI_VISION_MODEL ?? "gpt-4o-mini"),
        text,
        preferences: prefs,
      });
      
      return res.json(apiOk(req, result));
      
      


    }

    // Unknown context
    const r = apiErr(req, "UNSUPPORTED_CONTEXT", "Unsupported scoring context.", "Try again.", 400, true);
    return res.status(r.status).json(r.body);
  } catch (e: any) {
    const r = apiErr(req, "SCORE_V1_FAILED", "Could not score.", "Try again.", 500, false);
    return res.status(r.status).json(r.body);
  }
});
