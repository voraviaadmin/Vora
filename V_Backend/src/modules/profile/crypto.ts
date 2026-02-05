import crypto from "crypto";

let CACHED_KEY: Buffer | null = null;

function getKey(): Buffer {
  if (CACHED_KEY) return CACHED_KEY;

  const secret = process.env.PROFILE_SECRET;
  if (!secret) throw new Error("PROFILE_SECRET_MISSING");

  // Expect 64 hex chars (32 bytes)
  if (!/^[0-9a-fA-F]{64}$/.test(secret)) {
    throw new Error("PROFILE_SECRET_INVALID_HEX_32_BYTES");
  }

  CACHED_KEY = Buffer.from(secret, "hex");
  return CACHED_KEY;
}

export function encryptProfile(data: unknown) {
  const KEY = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);

  const plaintext = Buffer.from(JSON.stringify(data), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  // payload = iv(12) + tag(16) + ciphertext
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

export function decryptProfile(payload: string) {
  const KEY = getKey();
  const buf = Buffer.from(payload, "base64");

  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);

  const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, iv);
  decipher.setAuthTag(tag);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8"));
}
