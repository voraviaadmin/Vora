import fs from "node:fs";
import path from "node:path";
import { Db } from "./connection";
import { getMigrationsDir } from "./paths";

type MigrationFile = {
  name: string;
  fullPath: string;
};

function ensureSchemaVersionTable(db: Db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `);
}

function getCurrentVersion(db: Db): string | null {
  ensureSchemaVersionTable(db);
  const row = db.prepare("SELECT version FROM schema_version WHERE id = 1").get() as
    | { version: string }
    | undefined;
  return row?.version ?? null;
}

function listMigrationFiles(dir: string): MigrationFile[] {
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort();

  return files.map((name) => ({
    name,
    fullPath: path.join(dir, name),
  }));
}

export function runMigrations(db: Db) {
  const migrationsDir = getMigrationsDir();
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found: ${migrationsDir}`);
  }

  const migrationFiles = listMigrationFiles(migrationsDir);
  if (migrationFiles.length === 0) {
    throw new Error(`No migrations found in: ${migrationsDir}`);
  }

  const current = getCurrentVersion(db);

  // Run forward-only: if current is null, we run all.
  // If current is set, we run anything after that (by filename ordering).
  const startIndex =
    current === null ? 0 : Math.max(0, migrationFiles.findIndex((m) => m.name === current) + 1);

  const toRun = migrationFiles.slice(startIndex);

  const tx = db.transaction(() => {
    for (const m of toRun) {
      const sql = fs.readFileSync(m.fullPath, "utf8");
      db.exec(sql);
      // Each migration should set schema_version to itself,
      // but we also enforce it here in case someone forgets.
      db.prepare("INSERT OR REPLACE INTO schema_version(id, version) VALUES (1, ?)").run(m.name);
    }
  });

  tx();
}
