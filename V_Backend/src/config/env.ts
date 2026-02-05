import { z } from "zod";

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
});

export type AppEnv = z.infer<typeof EnvSchema>;

export function loadEnv(processEnv: NodeJS.ProcessEnv = process.env): AppEnv {
  const parsed = EnvSchema.safeParse(processEnv);
  if (!parsed.success) {
    // Fail fast: no hidden fallbacks
    // eslint-disable-next-line no-console
    console.error("Invalid environment variables:", parsed.error.flatten());
    throw new Error("Invalid environment variables");
  }
  return parsed.data;
}
