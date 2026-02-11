import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { UI } from "../../src/theme/ui";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { useModeGate } from "../../src/hooks/use-mode-gate";
import {
  createMealLog,
  syncEatOutGetSnapshot,
  type MenuSnapshot,
  type MenuSnapshotItem,
} from "../../src/api/meal-scoring";
import { getLocalMenuDraft } from "../../src/storage/local-logs";
import { normalizeReasons } from "../../src/utils/score-explain";

type MealType = "breakfast" | "lunch" | "dinner" | "snack";

function defaultMealType(): MealType {
  const h = new Date().getHours();
  if (h >= 5 && h < 11) return "breakfast";
  if (h >= 11 && h < 16) return "lunch";
  if (h >= 16 && h < 21) return "dinner";
  return "snack";
}

function labelMealType(mt: MealType) {
  switch (mt) {
    case "breakfast":
      return "Breakfast";
    case "lunch":
      return "Lunch";
    case "dinner":
      return "Dinner";
    case "snack":
      return "Snack";
  }
}

export default function MenuViewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    placeRefId?: string;
    restaurantName?: string;
    mealType?: string;
  }>();

  const placeRefId = String(params.placeRefId ?? "").trim();
  const restaurantName = String(params.restaurantName ?? "").trim();

  const incomingMealType = String(params.mealType ?? "").trim().toLowerCase();
  const initialMealType: MealType = (["breakfast", "lunch", "dinner", "snack"].includes(incomingMealType)
    ? (incomingMealType as MealType)
    : defaultMealType());

  const { mode } = useModeGate();
  const isSync = mode === "sync";

  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<MenuSnapshot | null>(null);

  // Dish logging UI state
  const [selected, setSelected] = useState<MenuSnapshotItem | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [mealType, setMealType] = useState<MealType>(initialMealType);
  const [saving, setSaving] = useState(false);
  const [loggedMeta, setLoggedMeta] = useState<Record<string, number>>({});
  type SortMode = "best_first" | "worst_first";
  const [sortMode, setSortMode] = useState<SortMode>("best_first");



  const peach = UI.colors.primary.apricot;

  useEffect(() => {
    async function load() {
      if (!placeRefId) {
        Alert.alert("Missing restaurant", "Please open from a restaurant.");
        router.back();
        return;
      }

      // Privacy mode: show local draft view (no scoring)
      if (!isSync) {
        const draft = await getLocalMenuDraft(placeRefId);
        if (!draft?.items?.length) {
          Alert.alert("No saved menu", "Scan and select items first.");
          router.back();
          return;
        }

        setSnapshot({
          placeRefId,
          updatedAt: draft.updatedAt,
          expiresAt: draft.expiresAt,
          menuSource: "privacy_local",
          menuFingerprint: "local",
          confidence: 0,
          items: draft.items.map((name, idx) => ({
            itemId: `local-${idx}`,
            name,
            scoreValue: null,
            scoreLabel: null,
            reasons: [],
            flags: [],
          })),
        } as any);

        setLoading(false);
        return;
      }



      console.log("saving snapshot for", placeRefId);

      setLoading(true);
      try {
        const resp = await syncEatOutGetSnapshot(placeRefId, { mode });
        setSnapshot(resp.data.snapshot);
      } catch {
        Alert.alert("No saved menu", "Scan the menu first to create a saved menu you can view later.");
        router.back();
      } finally {
        setLoading(false);
      }
    }
    console.log("menu-view loading snapshot for", placeRefId);

    load();
  }, [isSync, placeRefId, mode, router]);

  function onRescan() {
    router.push({
      pathname: "/scan/menu-scan",
      params: {
        returnTo: "/(tabs)/eat-out",
        placeRefId,
        restaurantName,
        mealType,
      },
    });
  }

  function openDish(it: MenuSnapshotItem) {
    setSelected(it);
    setSheetOpen(true);
  }

  async function onLogDish() {
    if (!selected) return;

    if (!isSync) {
      Alert.alert(
        "Enable Sync",
        "Logging dishes from menus requires Sync (profile-aware scoring + cloud storage).",
        [
          { text: "Not now", style: "cancel" },
          { text: "Go to Profile", onPress: () => router.push("/(tabs)/profile") },
        ]
      );
      return;
    }

    // Deterministic, auditable summary; keep it simple.
    const summary = restaurantName ? `${selected.name} - ${restaurantName}` : selected.name;

      // Only include placeRefId when it’s a real restaurant record.
      // "scan" is a synthetic key used for menu snapshots and will violate logs FK constraints.
      const logPlaceRefId = placeRefId && placeRefId !== "scan" ? placeRefId : null;

    setSaving(true);
    try {


      const scoringJson = (selected as any)?.scoringJson ?? null;
const score = selected?.scoreValue ?? null;

if (isSync && !scoringJson) {
  Alert.alert(
    "Missing score details",
    "This item was not saved with full AI scoring details. Please re-score the menu items, then log again."
          );
          setSaving(false);
          return;
        }


        const sj = (selected as any)?.scoringJson ?? null;
if (!sj) {
  Alert.alert(
    "Missing score details",
    "This item was not saved with full AI scoring details. Please re-score the menu items, then log again."
  );
  return;
}


        const resp: any = createMealLog(
          {
            summary,
            capturedAt: new Date().toISOString(),
            mealType,
            placeRefId: logPlaceRefId,
        
            // ✅ canonical payload — must flow end-to-end unchanged
            scoringJson: sj,
        
            // Optional helpful metadata (safe, not source of truth)
            source: "eatout_menu",
            itemId: (selected as any)?.itemId ?? null,
            itemName: selected.name,
          } as any,
          { mode }
        );


      // createMealLog returns {ok:false,...} when blocked; but in sync it should be API response
      if (resp?.ok === false) {
        throw new Error("MODE_BLOCKED");
      }

      setLoggedMeta((prev) => ({
        ...prev,
        [selected.itemId]: Date.now(),
      }));

      setSheetOpen(false);
      setSelected(null);

      Alert.alert("Logged", `Saved to ${labelMealType(mealType)}.`);
    } catch (e: any) {
      const msg = e?.message === "MODE_BLOCKED"
        ? "Sync is required to log dishes."
        : (e?.message ?? "Couldn’t log this dish. Try again.");
      Alert.alert("Couldn’t log", msg);
    } finally {
      setSaving(false);
    }
  }

  const title = useMemo(() => {
    const base = isSync ? "View menu (Scored)" : "View menu (Local)";
    return restaurantName ? `${base} · ${restaurantName}` : base;
  }, [isSync, restaurantName]);

  function normName(s: string) {
    return String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: UI.colors.bg }}
      contentContainerStyle={{ padding: UI.spacing.lg, paddingBottom: 110 }}
    >
      <Text style={styles.title}>{title}</Text>

      <Card style={styles.card}>
        {loading ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <ActivityIndicator />
            <Text style={{ color: UI.colors.textDim }}>Loading saved menu…</Text>
          </View>
        ) : snapshot ? (
          <>
            <Text style={styles.meta}>
              Saved {new Date(snapshot.updatedAt).toLocaleString()} · Expires{" "}
              {new Date(snapshot.expiresAt).toLocaleDateString()}
            </Text>

            <Text style={styles.hint}>
              Tap a dish to view details and log it to {labelMealType(mealType)}.
            </Text>

              <View style={styles.sortRow}>
                <Text style={styles.sortLabel}>Sort</Text>
                <Pressable
                  onPress={() => setSortMode((m) => (m === "best_first" ? "worst_first" : "best_first"))}
                  style={styles.sortPill}
                  accessibilityRole="button"
                  accessibilityLabel="Toggle sort order"
                >
                  <Text style={styles.sortPillText}>
                    {sortMode === "best_first" ? "Good → Needs work" : "Needs work → Good"}
                  </Text>
                </Pressable>
              </View>


              {snapshot.items
                .slice()
                .sort((a, b) => {
                  const sa = typeof a.scoreValue === "number" ? a.scoreValue : null;
                  const sb = typeof b.scoreValue === "number" ? b.scoreValue : null;

                  // Unscored items always last
                  if (sa == null && sb == null) return 0;
                  if (sa == null) return 1;
                  if (sb == null) return -1;

                  // Sort by score
                  if (sortMode === "best_first") return sb - sa;   // higher score first
                  return sa - sb;                                  // lower score first
                })
                .slice(0, 50)
                .map((it, idx) => {
              const key = `${it.itemId ?? "noid"}-${normName(it.name)}-${idx}`;
              const logged = !!loggedMeta[it.itemId];
              const hasScore = it.scoreValue != null;

              return (
                <Pressable
                  key={key}
                  onPress={() => openDish(it)}
                  style={styles.row}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${it.name}`}
                >
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={styles.itemName}>
                      {it.name}
                    </Text>

                    {hasScore ? (
                      <Text style={styles.itemMeta}>
                        {it.scoreLabel ? it.scoreLabel : "Scored"} · {it.scoreValue}
                      </Text>
                    ) : (
                      <Text style={[styles.itemMeta, { opacity: 0.7 }]}>
                        {isSync ? "Score pending" : "No scoring in Privacy mode"}
                      </Text>
                    )}

                    {!!it.reasons?.[0] ? (
                      <Text style={styles.itemWhy} numberOfLines={1}>
                        {normalizeReasons(it.reasons, { context: "menu", max: 1 })[0]}
                      </Text>
                    ) : null}
                  </View>

                  {logged ? (
                    <View style={styles.loggedPill}>
                      <Text style={styles.loggedText}>Logged ✓</Text>
                    </View>
                  ) : (
                    <Text style={styles.chev}>›</Text>
                  )}
                </Pressable>
              );
            })}

            <View style={{ flexDirection: "row", gap: UI.spacing.md, marginTop: UI.spacing.lg }}>
              <Button
                title="Rescan"
                onPress={onRescan}
                style={{ borderWidth: 1, borderColor: peach, flex: 1 }}
              />
              <Button
                title="Close"
                onPress={() => router.back()}
                variant="ghost"
                style={{ borderWidth: 1, borderColor: UI.colors.outline, flex: 1 }}
              />
            </View>
          </>
        ) : null}
      </Card>

      {/* Dish detail + logging sheet */}
      <Modal transparent visible={sheetOpen} animationType="fade" onRequestClose={() => setSheetOpen(false)}>
        <Pressable
          style={styles.backdrop}
          onPress={() => { setSheetOpen(false); setSelected(null); }}
        >
          <Pressable style={styles.sheet} onPress={() => { /* swallow */ }}>
            <Text style={styles.sheetTitle}>{selected?.name ?? "Dish"}</Text>

            {selected?.reasons?.[0] ? (
              <Text style={styles.sheetWhy}>{selected.reasons[0]}</Text>
            ) : (
              <Text style={styles.sheetWhy}>
                {isSync ? "Tap Log to save this dish to your meal history." : "Enable Sync to log dishes from menus."}
              </Text>
            )}

            {selected?.flags?.length ? (
              <View style={styles.flagRow}>
                {selected.flags.slice(0, 6).map((f) => (
                  <View key={f} style={styles.flagPill}>
                    <Text style={styles.flagText}>{f}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={{ height: UI.spacing.md }} />

            <Text style={styles.sheetLabel}>Log to</Text>
            <View style={styles.pillRow}>
              {(["breakfast", "lunch", "dinner", "snack"] as MealType[]).map((mt) => {
                const selectedMt = mealType === mt;
                return (
                  <Pressable
                    key={mt}
                    onPress={() => setMealType(mt)}
                    style={[
                      styles.pill,
                      selectedMt && {
                        borderColor: UI.colors.primary.pink,
                        backgroundColor: UI.colors.surface,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`Select ${labelMealType(mt)}`}
                  >
                    <Text style={[styles.pillText, selectedMt && { color: UI.colors.text }]}>
                      {labelMealType(mt)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={{ height: UI.spacing.lg }} />

            <Button
              title={saving ? "Logging…" : `Log to ${labelMealType(mealType)}`}
              onPress={onLogDish}
              disabled={saving}
              style={{ borderWidth: 1, borderColor: UI.colors.primary.pink }}
            />

            <View style={{ height: UI.spacing.sm }} />

            <Button
              title="Close"
              variant="ghost"
              onPress={() => { setSheetOpen(false); setSelected(null); }}
              style={{ borderWidth: 1, borderColor: UI.colors.outline }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: "900", color: UI.colors.text },

  card: {
    marginTop: UI.spacing.lg,
    padding: UI.spacing.lg,
    borderRadius: UI.radius.lg,
    backgroundColor: UI.colors.surface,
    borderWidth: 1,
    borderColor: UI.colors.outline,
    gap: 10,
  },

  meta: { color: UI.colors.textDim },
  hint: { color: UI.colors.textDim, marginTop: 2, marginBottom: 4 },

  row: {
    marginTop: 10,
    paddingTop: 12,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: UI.colors.outline,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  itemName: { color: UI.colors.text, fontWeight: "900" },
  itemMeta: { color: UI.colors.textDim, marginTop: 2, fontSize: 12 },
  itemWhy: { color: UI.colors.textDim, marginTop: 2, fontSize: 12 },

  loggedPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: UI.colors.outline,
    backgroundColor: UI.colors.bg,
  },
  loggedText: { color: UI.colors.textDim, fontWeight: "800", fontSize: 12 },

  chev: { color: UI.colors.textDim, fontSize: 22, fontWeight: "900", paddingHorizontal: 6 },

  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: UI.colors.bg,
    borderTopLeftRadius: UI.radius.lg,
    borderTopRightRadius: UI.radius.lg,
    padding: UI.spacing.lg,
    borderWidth: 1,
    borderColor: UI.colors.outline,
  },
  sheetTitle: { fontSize: 18, fontWeight: "900", color: UI.colors.text },
  sheetWhy: { color: UI.colors.textDim, marginTop: 6 },

  sheetLabel: { color: UI.colors.textDim, fontWeight: "900", marginBottom: 8 },

  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: UI.spacing.sm },
  pill: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: UI.border.thin,
    borderColor: UI.colors.outline,
    backgroundColor: UI.colors.bg,
  },
  pillText: { color: UI.colors.textDim, fontWeight: "800", fontSize: 13 },

  flagRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  flagPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: UI.colors.outline,
    backgroundColor: UI.colors.surface,
  },
  flagText: { color: UI.colors.textDim, fontWeight: "800", fontSize: 12 },
  sortRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sortLabel: { color: UI.colors.textDim, fontWeight: "900" },
  sortPill: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: UI.colors.outline,
    backgroundColor: UI.colors.bg,
  },
  sortPillText: { color: UI.colors.textDim, fontWeight: "800", fontSize: 12 },
  
});
