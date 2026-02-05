// lib/api.ts
// Thin re-export layer to enforce centralization.
// Do NOT implement API base logic here.

export { apiJson, apiGet, apiPost, ApiError } from "../src/api/client";
export { getApiBaseUrl, getStubAuthHeaders } from "../src/api/base";
