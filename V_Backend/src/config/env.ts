import { z } from "zod";
import fs from "node:fs";
import path from "node:path";

function loadDotEnvFileIfPresent(filename = ".env") {
  try {
    const p = path.resolve(process.cwd(), filename);
    if (!fs.existsSync(p)) return;

    const raw = fs.readFileSync(p, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const idx = trimmed.indexOf("=");
      if (idx === -1) continue;

      const key = trimmed.slice(0, idx).trim();
      let val = trimmed.slice(idx + 1).trim();

      // strip surrounding quotes
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }

      // don't overwrite real env (keeps deploy-safe behavior)
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch (e) {
    console.warn("[env] failed to load .env:", e);
  }
}


const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  PORT: z.coerce.number().int().min(1).max(65535).default(8787),

  // Our DB environment separation (dev/stage/smoke/prod)
  DB_ENV: z.enum(["dev", "stage", "smoke", "prod"]).default("dev"),

  // Where SQLite db files live relative to V_Backend
  DB_DIR: z.string().default("./db"),

  // auth mode: stub for now
  AUTH_MODE: z.enum(["stub"]).default("stub"),


    // 🔐 Profile encryption key (required for Sync mode)
    PROFILE_SECRET: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/)
    .optional(),
});

export type AppEnv = z.infer<typeof EnvSchema>;

export function loadEnv(processEnv: NodeJS.ProcessEnv = process.env): AppEnv {
  loadDotEnvFileIfPresent(".env"); // ✅ loads V_Backend/.env
  const parsed = EnvSchema.safeParse(processEnv);
  //console.log("[loadEnv] parsed:", parsed);
  if (!parsed.success) {
    // Fail fast: no hidden fallbacks
    // eslint-disable-next-line no-console
    //console.error("Invalid environment variables:", parsed.error.flatten());
    throw new Error("Invalid environment variables");
  }

  if (
    parsed.success &&
    parsed.data.NODE_ENV === "production" &&
    !parsed.data.PROFILE_SECRET
  ) {
    throw new Error("PROFILE_SECRET_MISSING");
  }
  


  return parsed.data;
}
