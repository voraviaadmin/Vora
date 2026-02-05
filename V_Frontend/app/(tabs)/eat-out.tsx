import React, { useEffect, useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View, ScrollView } from "react-native";
import { useRouter } from "expo-router";

import { UI } from "../../src/theme/ui";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { useModeGate } from "../../src/hooks/use-mode-gate";

import { syncEatOutSnapshotStatus, syncEatOutGetSnapshot, type MenuSnapshot } from "../../src/api/meal-scoring";

type EatOutTab = "restaurants";

type Restaurant = {
  placeRefId: string;
  name: string;
  cuisine: string;
  miles: number;
  rating?: number;
};

const DEFAULT_RESTAURANTS: Restaurant[] = [
  { placeRefId: "test-place-1", name: "Monk’s Kitchen", cuisine: "Indian", miles: 1.2, rating: 4.4 },
  { placeRefId: "test-place-2", name: "Seoul Garden", cuisine: "Korean", miles: 3.1, rating: 4.6 },
  { placeRefId: "test-place-3", name: "El Toro", cuisine: "Mexican", miles: 2.8, rating: 4.5 },
];

const CUISINES = ["Indian", "Thai", "Mexican", "Chinese", "Japanese", "Mediterranean", "American", "Korean"];

export default function EatOutTabScreen() {
  const router = useRouter();
  const { mode } = useModeGate();
  const isSync = mode === "sync";

  const [tab] = useState<EatOutTab>("restaurants");
  const [selectedCuisines, setSelectedCuisines] = useState<string[]>(["Indian", "Thai", "Mexican"]); // session-only default
  const [restaurants] = useState<Restaurant[]>(DEFAULT_RESTAURANTS);

  const [statusMap, setStatusMap] = useState<Record<string, { hasSnapshot: boolean; updatedAt?: string | null; expiresAt?: string | null }>>({});
  const [loadingStatus, setLoadingStatus] = useState(false);

  const [viewing, setViewing] = useState<{ placeRefId: string; name: string } | null>(null);
  const [snapshot, setSnapshot] = useState<MenuSnapshot | null>(null);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);

  const filtered = useMemo(() => {
    // session-only filter; user can choose only Korean, etc.
    if (!selectedCuisines.length) return [];
    return restaurants.filter((r) => selectedCuisines.includes(r.cuisine));
  }, [restaurants, selectedCuisines]);

  const copy = useMemo(() => {
    return {
      title: "Eat Out",
      sub: isSync
        ? "Sync mode: personalized restaurant + menu suggestions (profile + goals)."
        : "Privacy mode: restaurants can be browsed, but menu scoring requires Sync.",
      hint: "Profile preferences seed this list — changes here won’t update Profile.",
    };
  }, [isSync]);

  useEffect(() => {
    // Load snapshot status for visible restaurants (Sync only)
    async function load() {
      if (!isSync) return;
      const ids = filtered.map((r) => r.placeRefId);
      if (!ids.length) return;

      setLoadingStatus(true);
      try {
        const resp = await syncEatOutSnapshotStatus(ids, { mode });
        const next: typeof statusMap = {};
        for (const s of resp.data.status) {
          next[s.placeRefId] = { hasSnapshot: s.hasSnapshot, updatedAt: s.updatedAt, expiresAt: s.expiresAt };
        }
        setStatusMap(next);
      } catch {
        // keep silent; UX shouldn’t break
      } finally {
        setLoadingStatus(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSync, mode, filtered.map((r) => r.placeRefId).join(",")]);

  function toggleCuisine(c: string) {
    setSnapshot(null);
    setViewing(null);
    setSelectedCuisines((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  function goScan(placeRefId: string, name: string) {
    if (!isSync) {
      Alert.alert("Enable Sync", "Menu scoring uses your goals. Enable Sync in Profile.");
      return;
    }
    // Pass restaurant context so Menu Scan can save snapshot for View.
    router.push(`/scan/menu-scan?returnTo=eatout&placeRefId=${encodeURIComponent(placeRefId)}&restaurantName=${encodeURIComponent(name)}`);
  }

  async function onView(placeRefId: string, name: string) {
    if (!isSync) {
      Alert.alert("Enable Sync", "Viewing scored menus requires Sync.");
      return;
    }
    setViewing({ placeRefId, name });
    setSnapshot(null);
    setLoadingSnapshot(true);

    try {
      const resp = await syncEatOutGetSnapshot(placeRefId, { mode });
      setSnapshot(resp.data.snapshot);
    } catch (e: any) {
      Alert.alert("No saved menu", "Scan the menu first to create a scored menu you can view later.");
      setViewing(null);
    } finally {
      setLoadingSnapshot(false);
    }
  }

  function onComingSoon() {
    Alert.alert("Menu (Coming Soon)", "Phase 2: connect to Google Menu / Toast / Uber and score automatically.");
  }

  const apricot = UI.colors.primary.apricot ?? UI.colors.primary.teal;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: UI.colors.bg }} contentContainerStyle={{ padding: UI.spacing.lg, paddingBottom: 90 }}>
      <Text style={styles.title}>{copy.title}</Text>
      <Text style={styles.sub}>{copy.sub}</Text>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Cuisines (this search only)</Text>
        <Text style={styles.cardSub}>{copy.hint}</Text>

        <View style={styles.chips}>
          {CUISINES.map((c) => {
            const active = selectedCuisines.includes(c);
            return (
              <Text
                key={c}
                onPress={() => toggleCuisine(c)}
                style={[
                  styles.chip,
                  {
                    borderColor: active ? apricot : UI.colors.outline,
                    color: active ? UI.colors.text : UI.colors.textDim,
                    backgroundColor: active ? UI.colors.surface : "transparent",
                  },
                ]}
              >
                {c}
              </Text>
            );
          })}
        </View>

        {!selectedCuisines.length ? (
          <Text style={{ marginTop: 10, color: UI.colors.textDim }}>Select at least one cuisine to search.</Text>
        ) : null}
      </Card>

      <Card style={styles.card}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={styles.cardTitle}>Restaurants (≤ 5 miles)</Text>
          {loadingStatus ? <Text style={{ color: UI.colors.textDim, fontSize: 12 }}>Checking saved menus…</Text> : null}
        </View>

        {!filtered.length ? (
          <Text style={{ marginTop: 10, color: UI.colors.textDim }}>No matches for selected cuisines.</Text>
        ) : null}

        {filtered.map((r) => {
          const st = statusMap[r.placeRefId];
          const hasSnapshot = !!st?.hasSnapshot;

          return (
            <View key={r.placeRefId} style={styles.restRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.restName}>{r.name}</Text>
                <Text style={styles.restMeta}>
                  {r.cuisine} · {r.miles.toFixed(1)} mi{typeof r.rating === "number" ? ` · ★ ${r.rating.toFixed(1)}` : ""}
                </Text>
              </View>

              <View style={styles.restBtns}>
                
                <Button
                  title={hasSnapshot ? "Rescan" : "Scan menu"}
                  onPress={() =>
                    router.push(
                      `/scan/menu-scan?placeRefId=${r.placeRefId}&restaurantName=${encodeURIComponent(
                        r.name
                      )}`
                    )
                  }
                />

                {hasSnapshot && (
                  <Button
                    title="View menu (Scored)"
                    variant="ghost"
                    onPress={() =>
                      router.push(
                        `/eatout/menu-view?placeRefId=${r.placeRefId}&restaurantName=${encodeURIComponent(
                          r.name
                        )}`
                      )
                    }
                  />
                )}

                <Button title="Menu (Coming Soon)" disabled />

              </View>

              {hasSnapshot && st?.expiresAt ? (
                <Text style={{ marginTop: 6, color: UI.colors.textDim, fontSize: 12 }}>
                  Saved menu expires: {new Date(st.expiresAt).toLocaleDateString()}
                </Text>
              ) : null}
            </View>
          );
        })}
      </Card>

      {viewing ? (
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>View menu (Scored) · {viewing.name}</Text>
          {loadingSnapshot ? (
            <Text style={{ color: UI.colors.textDim, marginTop: 8 }}>Loading saved menu…</Text>
          ) : snapshot ? (
            <View style={{ marginTop: 10 }}>
              <Text style={{ color: UI.colors.textDim, fontSize: 12 }}>
                Saved {new Date(snapshot.updatedAt).toLocaleString()} · Expires {new Date(snapshot.expiresAt).toLocaleDateString()}
              </Text>

              {snapshot.items.slice(0, 14).map((it, idx) => (
                <View key={it.itemId ?? String(idx)} style={styles.snapItem}>
                  <Text style={{ color: UI.colors.text, fontWeight: "900" }}>
                    {idx + 1}. {it.name}
                  </Text>
                  <Text style={{ color: UI.colors.textDim, marginTop: 4 }}>
                    Score: {it.scoreValue ?? "—"} {it.scoreLabel ? `(${it.scoreLabel})` : ""}
                  </Text>
                  {Array.isArray(it.reasons) && it.reasons.length ? (
                    <Text style={{ color: UI.colors.textDim, marginTop: 4 }}>{it.reasons[0]}</Text>
                  ) : null}
                </View>
              ))}

              <View style={{ flexDirection: "row", gap: UI.spacing.md, marginTop: UI.spacing.md }}>
                <Button
                  title="Rescan"
                  onPress={() => goScan(snapshot.placeRefId, viewing.name)}
                  style={{ borderColor: apricot, borderWidth: 1, flex: 1 }}
                />
                <Button
                  title="Close"
                  onPress={() => {
                    setViewing(null);
                    setSnapshot(null);
                  }}
                  variant="ghost"
                  style={{ borderWidth: 1, borderColor: UI.colors.outline, flex: 1 }}
                />
              </View>
            </View>
          ) : (
            <Text style={{ color: UI.colors.textDim, marginTop: 8 }}>No saved menu found.</Text>
          )}
        </Card>
      ) : null}

      <Text style={styles.footer}>You’re in control — switch modes anytime from Profile.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: "900", color: UI.colors.text },
  sub: { marginTop: 6, color: UI.colors.textDim },
  card: {
    marginTop: UI.spacing.lg,
    padding: UI.spacing.lg,
    borderRadius: UI.radius.lg,
    backgroundColor: UI.colors.surface,
    borderWidth: 1,
    borderColor: UI.colors.outline,
  },
  cardTitle: { color: UI.colors.text, fontWeight: "900", fontSize: 16 },
  cardSub: { color: UI.colors.textDim, marginTop: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    fontWeight: "800",
  },
  restRow: {
    marginTop: UI.spacing.md,
    paddingTop: UI.spacing.md,
    borderTopWidth: 1,
    borderTopColor: UI.colors.outline,
  },
  restName: { color: UI.colors.text, fontWeight: "900" },
  restMeta: { color: UI.colors.textDim, marginTop: 4 },
  restBtns: { marginTop: 10, gap: 8 },
  snapItem: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: UI.colors.outline,
  },
  footer: { marginTop: UI.spacing.lg, color: UI.colors.textDim, textAlign: "center" },
});
