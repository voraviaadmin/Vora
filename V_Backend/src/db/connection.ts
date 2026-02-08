import Database from "better-sqlite3";

export type Db = Database.Database;

export function openDb(dbFilePath: string): Db {
  const db = new Database(dbFilePath);

  // Hard requirements
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");

  return db;
}


// Request-scoped DB accessor
export function getDbFromReq(req: any) {
  return req?.app?.locals?.db ?? null;
}
