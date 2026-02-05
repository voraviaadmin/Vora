import { apiGet, apiPost } from "./client";

export type MeResponse = {
  userId: string;
  memberId: string;
  mode: string;
  activeMemberId: string;
  allowedMemberIds: string[];
  [key: string]: unknown;
};

export function getMe() {
  return apiGet<MeResponse>("/v1/me");
}

export function setActiveMember(body: { memberId: string }) {
  return apiPost<MeResponse>("/v1/me/active-member", body);
}
