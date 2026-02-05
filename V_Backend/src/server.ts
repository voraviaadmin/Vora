import fs from "node:fs";
import path from "node:path";
import { createApp } from "./app";
import { loadEnv } from "./config/env";
import { getDbFilePath } from "./db/paths";
import { openDb } from "./db/connection";
import { runMigrations } from "./db/migrate";
import { bootstrapMe } from "./modules/me/bootstrap";


function ensureDbDir(dbFilePath: string) {
  const dir = path.dirname(dbFilePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function main() {
  const env = loadEnv();
  const dbFilePath = getDbFilePath(env);

  ensureDbDir(dbFilePath);

  const db = openDb(dbFilePath);
  runMigrations(db);
  bootstrapMe(db);
  const app = createApp(db);

  /*app.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`V_Backend listening on http://localhost:${env.PORT}`);
    // eslint-disable-next-line no-console
    console.log(`DB_ENV=${env.DB_ENV} DB=${dbFilePath}`);
  });*/

  app.listen(env.PORT, "0.0.0.0", () => {
    console.log(`V_Backend listening on port ${env.PORT}`);
  });


}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
