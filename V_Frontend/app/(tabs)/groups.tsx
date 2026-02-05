import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";

import { UI } from "../../src/theme/ui";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";

import { useGroups } from "../../src/hooks/useGroups";
import { useMe } from "../../src/hooks/useMe";
import { useSetActiveMember } from "../../src/hooks/useSetActiveMember";
import { presentError } from "../../src/utils/present-error";
import { useModeGate } from "../../src/hooks/use-mode-gate";

export default function GroupsScreen() {
  const { mode} = useModeGate(); // assuming you expose setMode; if not, see note below

  
  const { data, isLoading, isError, error, refetch, isFetching } = useGroups();
  const groups = useMemo(() => data ?? [], [data]);

  const me = useMe();
  const activeMemberId = me.data?.activeMemberId;

  const setActive = useSetActiveMember();

  // expand/collapse per groupId
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const mint = UI.colors.primary.cyan; // mint (by palette lock)

  const toggle = (groupId: string) => setOpen((s) => ({ ...s, [groupId]: !s[groupId] }));




   // ✅ EARLY RETURN — MUST BE BEFORE JSX
   if (mode === "privacy") {
    return (
      <View style={[styles.page, { flex: 1 }]}>
        <Card style={styles.infoCard}>
          <Text style={styles.infoTitle}>
            Groups are available in Sync Mode
          </Text>

          <Text style={styles.infoText}>
            Privacy Mode keeps everything local. Switch to Sync in Profile to view or manage groups.
          </Text>

          <View style={{ marginTop: UI.spacing.gapSm }}>
            <Button
              title="Go to Profile"
              onPress={() => router.push("/profile")}
              tone="accent"
              accentColor={mint}
            />
          </View>
        </Card>
      </View>
    );
  }

  // ⬇️ ONLY Sync mode reaches here ⬇️

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.muted}>Loading groups…</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <Card style={styles.errorCard}>
        <Text style={styles.errorTitle}>Couldn’t load groups</Text>
        <Button title="Retry" onPress={() => refetch()} />
      </Card>
    );
  }

 

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Groups</Text>

        <Pressable
  onPress={() => (mode === "sync" ? refetch() : null)}
  disabled={mode !== "sync"}
  style={({ pressed }) => [styles.linkBtn, pressed && { opacity: 0.75 }, mode !== "sync" && { opacity: 0.4 }]}
>
          <Text style={[styles.linkText, { color: mint }]}>{isFetching ? "Refreshing…" : "Refresh"}</Text>
        </Pressable>
      </View>

      <Card style={styles.summaryCard}>
        <View style={styles.activeRow}>
          <Text style={styles.muted}>Active member</Text>
          <Text style={styles.activeId}>{activeMemberId ?? "—"}</Text>
        </View>
      </Card>


    { groups.length === 0 ? (
        <Text style={styles.muted}>No groups yet.</Text>
      ) : (
        <View style={{ gap: UI.spacing.gapSm }}>
          {groups.map((g) => {
            const isOpen = !!open[g.groupId];
            const members = g.members ?? [];

            return (
              <Card key={g.groupId} style={[styles.groupCard, { borderLeftColor: mint }]}>
                <Pressable onPress={() => toggle(g.groupId)} style={({ pressed }) => [styles.groupTop, pressed && { opacity: 0.88 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.groupName}>{g.name}</Text>
                    <Text style={styles.groupMeta}>
                      {g.groupType ?? "Group"} • {members.length} member{members.length === 1 ? "" : "s"}
                    </Text>
                    <Text style={styles.groupId}>{g.groupId}</Text>
                  </View>

                  <Text style={styles.chev}>{isOpen ? "▾" : "▸"}</Text>
                </Pressable>

                {isOpen ? (
                  <View style={styles.membersWrap}>
                    {members.length === 0 ? (
                      <Text style={styles.muted}>No members returned.</Text>
                    ) : (
                      members.map((m) => {
                        const left = !!m.leftAt;
                        const role = m.role ?? "";
                        const name = m.displayName ?? "Me";
                        const isActive = !!activeMemberId && m.memberId === activeMemberId;

                        const disabled = left || isActive || setActive.isPending;

                        return (
                          <View key={m.memberId} style={styles.memberRow}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.memberName}>
                                {name}
                                {role ? `  •  ${role}` : ""}
                                {left ? "  •  LEFT" : ""}
                                {isActive ? "  •  ACTIVE" : ""}
                              </Text>
                              <Text style={styles.memberId}>{m.memberId}</Text>
                            </View>

                            <Button
                              title={isActive ? "Active" : "Set Active"}
                              onPress={() => setActive.mutate(m.memberId)}
                              tone="accent"
                              accentColor={mint}
                              disabled={disabled}
                              style={isActive ? styles.activeBtn : undefined}
                            />
                          </View>
                        );
                      })
                    )}

                      {setActive.isError ? (
                        <Text style={styles.errorInline}>
                          Couldn’t set active member. Please try again.
                        </Text>
                      ) : null}
                  </View>
                ) : null}
              </Card>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: UI.colors.bg },
  container: { padding: UI.spacing.page, gap: UI.spacing.sectionGapSm },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontSize: 24, fontWeight: "900", color: UI.colors.text },
  linkBtn: { paddingHorizontal: 10, paddingVertical: 8 },
  linkText: { fontWeight: "900" },

  summaryCard: { padding: UI.spacing.cardPad },
  activeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  activeId: { fontSize: 12, color: UI.colors.text, fontWeight: "900" },
  muted: { color: UI.colors.textDim, fontWeight: "700" },

  center: { paddingVertical: 24, alignItems: "center", gap: 8 },

  errorCard: { padding: UI.spacing.cardPad },
  errorTitle: { fontSize: 16, fontWeight: "900", color: UI.colors.text },
  errorText: { marginTop: 6, color: UI.colors.textDim },
  errorInline: { marginTop: 8, color: UI.colors.textDim, fontWeight: "800" },

  groupCard: {
    padding: 0,
    borderLeftWidth: 3,
  },
  groupTop: { flexDirection: "row", gap: 10, padding: UI.spacing.cardPad, alignItems: "center" },
  groupName: { fontSize: 16, fontWeight: "900", color: UI.colors.text },
  groupMeta: { marginTop: 4, color: UI.colors.textDim, fontWeight: "700" },
  groupId: { marginTop: 4, fontSize: 11, color: UI.colors.textMuted },
  chev: { fontSize: 18, fontWeight: "900", color: UI.colors.textDim },

  membersWrap: {
    borderTopWidth: 1,
    borderTopColor: UI.colors.outline,
    padding: UI.spacing.cardPad,
    gap: UI.spacing.gapSm,
  },
  memberRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  memberName: { fontSize: 14, fontWeight: "800", color: UI.colors.text },
  memberId: { marginTop: 3, fontSize: 11, color: UI.colors.textMuted },

  activeBtn: {
    // Keep "Active" state slightly calmer than the accent.
    backgroundColor: UI.colors.btnBg,
    borderColor: UI.colors.outline,
  },

  infoCard: { padding: UI.spacing.cardPad },
  infoTitle: { fontSize: 16, fontWeight: "900", color: UI.colors.text },
  infoText: { marginTop: 6, color: UI.colors.textDim, fontWeight: "700" },



});
