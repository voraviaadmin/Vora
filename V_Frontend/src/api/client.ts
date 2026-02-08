// src/api/client.ts
import { getApiBaseUrl, getStubAuthHeaders } from "./base";
import { getModeSnapshot, subscribeMode } from "../state/mode";

export class PrivacyNetworkBlockedError extends Error {
  code = "NETWORK_BLOCKED_PRIVACY_MODE" as const;
  constructor(path?: string) {
    super(path ? `NETWORK_BLOCKED_PRIVACY_MODE: ${path}` : "NETWORK_BLOCKED_PRIVACY_MODE");
    this.name = "PrivacyNetworkBlockedError";
  }
}

class ModeNotReadyError extends Error {
  code = "MODE_NOT_READY" as const;
  constructor() {
    super("MODE_NOT_READY");
    this.name = "ModeNotReadyError";
  }
}

async function waitForModeReady(timeoutMs = 2000) {
  const snap = getModeSnapshot();
  if (snap.status === "ready") return snap;

  return await new Promise<typeof snap>((resolve, reject) => {
    const unsub = subscribeMode((next) => {
      if (next.status === "ready") {
        clearTimeout(t);
        unsub();
        resolve(next);
      }
    });

    const t = setTimeout(() => {
      unsub();
      reject(new ModeNotReadyError());
    }, timeoutMs);
  });
}

// ✅ Allowlist should be method + path
function isAllowedInPrivacyMode(method: string, path: string): boolean {
  const p = normalizePath(path);
  const m = (method || "GET").toUpperCase();

  if (m === "GET" && p === "/v1/me") return true;
  if (m === "POST" && p === "/v1/profile/enable-sync") return true;
  if (m === "POST" && p === "/v1/profile/disable-sync") return true;

  return false;
}

type ApiErrorDetails = {
  status: number;
  message: string;
  url: string;
  bodyText?: string;
};

type ApiMeta = {
  feature?: string;     // e.g. "eatout.nearby_search"
  operation?: string;   // e.g. "places.nearby" | "openai.score" | "snapshot.upsert"
};


export class ApiError extends Error implements ApiErrorDetails {
  status: number;
  url: string;
  bodyText?: string;

  constructor(details: ApiErrorDetails) {
    super(details.message);
    this.name = "ApiError";
    this.status = details.status;
    this.url = details.url;
    this.bodyText = details.bodyText;
  }
}

function normalizePath(path: string) {
  if (!path.startsWith("/")) return `/${path}`;
  return path;
}

function isAbsoluteUrl(path: string) {
  return /^https?:\/\//i.test(path);
}


// ✅ Remove arbitrary absolute URL fetches (forces backend-only integrations)
export function buildUrl(path: string) {
  if (isAbsoluteUrl(path)) {
    throw new Error("Absolute URLs are not allowed. Use backend endpoints only.");
  }
  const base = getApiBaseUrl().replace(/\/+$/, "");
  return `${base}${normalizePath(path)}`;
}

function toRecord(headers?: HeadersInit): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;

  if (headers instanceof Headers) {
    headers.forEach((v, k) => (out[k] = v));
  } else if (Array.isArray(headers)) {
    for (const [k, v] of headers) out[k] = String(v);
  } else {
    Object.assign(out, headers as any);
  }
  return out;
}

function hasHeader(h: Record<string, string>, key: string): boolean {
  const target = key.toLowerCase();
  return Object.keys(h).some((k) => k.toLowerCase() === target);
}

function isLikelyFormData(body: any): boolean {
  try {
    return typeof FormData !== "undefined" && body instanceof FormData;
  } catch {
    return false;
  }
}

function makeRequestId() {
  // lightweight, no dependency
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function mergeHeaders(
  optsHeaders: HeadersInit | undefined,
  opts: RequestInit | undefined,
  snap: { mode: "privacy" | "sync"; lastChangedAt: number },
  path: string,
  meta?: ApiMeta
): Record<string, string> {
  const incoming = toRecord(optsHeaders);

  const merged: Record<string, string> = {
    Accept: "application/json",
    ...getStubAuthHeaders(),

    // ✅ audit + backend enforcement
    "x-vora-mode": snap.mode,
    "x-vora-mode-changed-at": String(snap.lastChangedAt),
    "x-vora-request-id": makeRequestId(),
    // ✅ cost attribution
    "x-vora-feature": meta?.feature || `api:${normalizePath(path)}`,
    ...(meta?.operation ? { "x-vora-operation": meta.operation } : {}),


    ...incoming,
  };

  const body = opts?.body;
  const hasBody = body !== undefined && body !== null;

  if (hasBody && !hasHeader(merged, "Content-Type") && !isLikelyFormData(body)) {
    merged["Content-Type"] = "application/json";
  }

  return merged;
}

async function handleJson<T>(res: Response, url: string, path: string): Promise<T> {
  const contentType = res.headers.get("content-type") || "";
  const bodyText = await res.text().catch(() => "");

  if (!res.ok) {
    let message = `API failed (${res.status}) for ${path}`;
    try {
      const maybe = bodyText ? JSON.parse(bodyText) : null;
      message = maybe?.message ?? maybe?.error ?? message;
    } catch {
      if (bodyText && bodyText.length < 220) message = bodyText;
    }
    throw new ApiError({ status: res.status, url, bodyText, message });
  }

  if (!bodyText) return undefined as unknown as T;
  if (contentType.includes("application/json")) return JSON.parse(bodyText) as T;
  return bodyText as any as T;
}

/** Canonical API helper (JSON in/out) */
export async function apiJson<T>(path: string, opts: RequestInit = {}, meta?: ApiMeta): Promise<T> {
  const snap = await waitForModeReady();
  const method = (opts.method ?? "GET").toUpperCase();

  if (snap.mode === "privacy" && !isAllowedInPrivacyMode(method, path)) {
    throw new PrivacyNetworkBlockedError(normalizePath(path));
  }

  const url = buildUrl(path);
  const headers = mergeHeaders(opts.headers, opts, snap, path, meta);

  const controller = new AbortController();
  const timeoutMs = 15000;
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    if (__DEV__) {
      console.log("[apiJson] request", {
        path: normalizePath(path),
        method,
        mode: snap.mode,
      });
    }

    const res = await fetch(url, {
      ...opts,
      headers,
      credentials: "include",
      signal: controller.signal,
    });

    if (__DEV__) {
      console.log("[apiJson] response", {
        path: normalizePath(path),
        status: res.status,
        ok: res.ok,
      });
    }

    return await handleJson<T>(res, url, normalizePath(path));
  } finally {
    clearTimeout(t);
  }
}

/** Back-compat helpers used throughout the app */
export async function apiGet<T>(path: string, opts: RequestInit = {}): Promise<T> {
  return apiJson<T>(path, { ...opts, method: "GET" });
}

export async function apiPost<T>(path: string, body: any, opts: RequestInit = {}): Promise<T> {
  return apiJson<T>(path, { ...opts, method: "POST", body: JSON.stringify(body) });
}

export async function apiPostForm<T>(path: string, form: FormData, opts: RequestInit = {}): Promise<T> {
  return apiJson<T>(path, { ...opts, method: "POST", body: form });
}

export async function apiPut<T>(path: string, body: any, opts: RequestInit = {}): Promise<T> {
  return apiJson<T>(path, { ...opts, method: "PUT", body: JSON.stringify(body) });
}

export async function apiDelete<T>(path: string, opts: RequestInit = {}): Promise<T> {
  return apiJson<T>(path, { ...opts, method: "DELETE" });
}