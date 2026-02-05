import { apiGet, apiPost, apiDelete } from "./client";

export type LogItem = {
  logId: string;
  actorUserId: string;
  subjectMemberId: string;
  groupId: string | null;
  placeRefId: string | null;
  mealType: string | null;
  capturedAt: string;
  score: number | null;
  summary: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LogsResponse = {
  subjectMemberId: string;
  items: LogItem[];
};

export function listLogs(params?: { memberId?: string }) {
  const qs = params?.memberId ? `?memberId=${encodeURIComponent(params.memberId)}` : "";
  return apiGet<LogsResponse>(`/v1/logs${qs}`);
}

export function createLog(body: {
  groupId?: string;
  placeRefId?: string;
  mealType?: string;
  score?: number;
  summary?: string;
}) {
  return apiPost<LogItem>("/v1/logs", body);
}

export function deleteLog(logId: string) {
  return apiDelete<{ ok: true }>(`/v1/logs/${encodeURIComponent(logId)}`);
}
