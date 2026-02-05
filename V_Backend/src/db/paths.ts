import path from "node:path";
import { AppEnv } from "../config/env";

export function getDbFilePath(env: AppEnv): string {
  const filename = `${env.DB_ENV}.db`; // dev.db, stage.db, smoke.db, prod.db
  // DB_DIR is relative to V_Backend root, but process CWD may vary
  // so resolve it from current process working directory.
  return path.resolve(process.cwd(), env.DB_DIR, filename);
}

export function getMigrationsDir(): string {
  return path.resolve(process.cwd(), "migrations");
}
