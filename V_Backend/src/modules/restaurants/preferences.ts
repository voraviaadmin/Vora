import { getDbFromReq } from "../../db/connection";
import { decryptProfile } from "../profile/crypto";

export function getSyncPreferences(req: any) {
  const db = getDbFromReq(req);
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  const userId = String(req?.ctx?.userId ?? req?.header?.("x-user-id") ?? "").trim();
  if (!userId) throw new Error("UNAUTHENTICATED");

  const row = db
    .prepare("SELECT encryptedJson FROM user_profile_preferences_secure WHERE userId=?")
    .get(userId) as { encryptedJson?: string } | undefined;

  if (!row?.encryptedJson) return null;
  return decryptProfile(row.encryptedJson);
}
