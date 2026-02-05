import { apiGet } from "./client";

export type GroupMember = {
  memberId: string;
  displayName?: string;
  role?: string;
  leftAt?: string | null;
};

export type Group = {
  groupId: string;
  name: string;
  groupType?: string;
  members: GroupMember[];
};

function normalizeGroups(payload: any): Group[] {
  const list = Array.isArray(payload) ? payload : payload?.groups;
  if (!Array.isArray(list)) return [];

  return list.map((g: any) => ({
    groupId: g.groupId ?? g.id,
    name: g.name ?? "",
    groupType: g.groupType,
    members: Array.isArray(g.members) ? g.members : [],
  }));
}

export async function listGroups(): Promise<Group[]> {
  const raw = await apiGet<any>("/v1/groups");
  return normalizeGroups(raw);
}
