import { apiGet, apiPost } from "./client";

export type AiPersonality = "straight" | "encouraging" | "coach";
export type EatingStyle = "home" | "eatout" | "balanced";

export type MePreferences = {
  aiPersonality?: AiPersonality;
  eatingStyle?: EatingStyle;
  cuisines?: string[];
};

export type MeProfile = {
  preferences?: MePreferences;
  // keep open for future profile fields
  [key: string]: unknown;
};

export type MeResponse = {
  userId: string;

  memberId: string | null;
  activeMemberId: string | null;

  mode: string;
  allowedMemberIds: string[];

  preferences?: MePreferences;
  profile?: MeProfile;

  [key: string]: unknown;
};


export function getMe() {
  return apiGet<MeResponse>("/v1/me");
}

export function setActiveMember(body: { memberId: string }) {
  return apiPost<MeResponse>("/v1/me/active-member", body);
}
