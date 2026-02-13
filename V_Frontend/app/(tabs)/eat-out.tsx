import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View, ScrollView, TextInput, Pressable } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";

import { UI } from "../../src/theme/ui";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { useModeGate } from "../../src/hooks/use-mode-gate";

import { syncEatOutSnapshotStatus, syncEatOutGetSnapshot, type MenuSnapshot } from "../../src/api/meal-scoring";
import { getLocalMenuDraft } from "../../src/storage/local-logs";
import * as Location from "expo-location";
import { syncEatOutRestaurantsNearby } from "../../src/api/meal-scoring";
import { apiJson } from "../../src/api/client";



type EatOutTab = "restaurants";

type Restaurant = {
  placeRefId: string;
  name: string;
  addressShort?: string | null;
  rating?: number | null;
  priceLevel?: number | null;
  primaryType?: string | null;
};


export default function EatOutTabScreen() {
  const router = useRouter();
  const { mode } = useModeGate();
  const isSync = mode === "sync";

  const [tab] = useState<EatOutTab>("restaurants");

  const [selectedCuisines, setSelectedCuisines] = useState<string[]>([]);
  const [seededFromProfile, setSeededFromProfile] = useState(false);

  
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [searching, setSearching] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(true);


  const [statusMap, setStatusMap] = useState<Record<string, { hasSnapshot: boolean; updatedAt?: string | null; expiresAt?: string | null }>>({});
  const [loadingStatus, setLoadingStatus] = useState(false);

  const [viewing, setViewing] = useState<{ placeRefId: string; name: string } | null>(null);
  const [snapshot, setSnapshot] = useState<MenuSnapshot | null>(null);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [localMenuMap, setLocalMenuMap] = useState<Record<string, boolean>>({});
  const [cuisineInput, setCuisineInput] = useState("");
  const [expandedPlaceRefId, setExpandedPlaceRefId] = useState<string | null>(null);


  type CuisineCatalogItem = { id: string; label: string; aliases: string[] };
  type CuisinesApiResponse = { items?: Array<{ id?: unknown; label?: unknown; aliasesJson?: string }> };

const [cuisineCatalog, setCuisineCatalog] = useState<CuisineCatalogItem[]>([]);
const [catalogLoaded, setCatalogLoaded] = useState(false);
const [cuisineSuggestions, setCuisineSuggestions] = useState<CuisineCatalogItem[]>([]);





  /*const filtered = useMemo(() => {
    // session-only filter; user can choose only Korean, etc.
    if (!selectedCuisines.length) return [];
    return restaurants.filter((r) => selectedCuisines.includes(r.cuisine));
  }, [restaurants, selectedCuisines]);*/

  const visible = useMemo(() => restaurants, [restaurants]);


  const copy = useMemo(() => {
    return {
      title: "Eat Out",
      sub: isSync
        ? "Sync mode: personalized restaurant + menu suggestions (profile + goals)."
        : "Privacy mode: restaurants can be browsed, but menu scoring requires Sync.",
      hint: "Profile preferences seed this list — changes here won’t update Profile.",
    };
  }, [isSync]);
  
  function normalizeCuisine(s: string) {
    return s.trim().replace(/\s+/g, " ");
  }
  
  
  function removeCuisine(name: string) {
    setSelectedCuisines((prev) => prev.filter((c) => c !== name));
  }
  

  async function seedCuisinesFromProfileOnce() {
    if (!isSync) return;
    if (seededFromProfile) return;
  
    try {
      const resp = await apiJson<{ preferences?: { cuisines?: string[] } }>(
        "/v1/profile/preferences",
        { method: "GET" },
        { feature: "eatout.seed", operation: "profile.preferences.get" }
      );
  
      const fromProfile = resp?.preferences?.cuisines ?? [];
      setSelectedCuisines(fromProfile);
      setSeededFromProfile(true);
    } catch {
      // zero-patience: don't block screen; user can still type/add cuisines manually
      setSeededFromProfile(true);
    }
  }
  
  useFocusEffect(
    useCallback(() => {
      seedCuisinesFromProfileOnce();
    }, [isSync, seededFromProfile])
  );
  


  async function runSearch() {
    if (!isSync) {
      Alert.alert("Enable Sync", "Restaurant discovery uses backend services. Enable Sync in Profile.");
      return;
    }

  
    if (!selectedCuisines.length) {
      Alert.alert("Select cuisines", "Pick at least one cuisine to search nearby.");
      return;
    }
  
    setSearching(true);
    try {
 
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== "granted") {
        Alert.alert("Location needed", "Enable location to find nearby restaurants.");
        return;
      }
  
      const loc = await Location.getCurrentPositionAsync({});
      const lat = loc.coords.latitude;
      const lng = loc.coords.longitude;
  
      const resp = await syncEatOutRestaurantsNearby(
        { lat, lng, cuisines: selectedCuisines },
        { mode }
      ); 
      setRestaurants(resp.data.results);
      setFiltersOpen(false);

      /*const resp = isSync
      ? await syncEatOutRestaurantsNearby({ lat, lng, cuisines: selectedCuisines }, { mode })
      : await privacyEatOutRestaurantsNearby({ lat, lng, cuisines: selectedCuisines }, { mode });
  
      setRestaurants(resp.data.results);
      setFiltersOpen(false);*/

    } catch (e: any) {
      Alert.alert("Search failed", e?.message ?? "Try again.");
    } finally {
      setSearching(false);
    }
  }
  

  useEffect(() => {
    // Load snapshot status for visible restaurants (Sync only)
    async function load() {
      if (!isSync) return;
      const ids = visible.map((r) => r.placeRefId);
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
  }, [isSync, mode, visible.map((r) => r.placeRefId).join(",")]);


  useEffect(() => {
  let mounted = true;
  (async () => {
    if (!isSync) return;

    try {
      const [catalogRes, prefsRes] = await Promise.all([
        apiJson<CuisinesApiResponse>(`/v1/meta/cuisines`, { method: "GET" }),
        apiJson<{ cuisines?: unknown[] }>(`/v1/profile/preferences`, { method: "GET" }),
      ]);

      if (!mounted) return;

      const catalog: CuisineCatalogItem[] = (catalogRes.items ?? []).map((r: any) => ({
        id: String(r.id),
        label: String(r.label),
        aliases: (() => {
          try { return JSON.parse(r.aliasesJson ?? "[]"); } catch { return []; }
        })(),
      }));

      setCuisineCatalog(catalog);
      setCatalogLoaded(true);

      const seeded = Array.isArray(prefsRes?.cuisines) ? prefsRes.cuisines.map(String) : [];
      setSelectedCuisines(seeded);
    } catch {
      if (!mounted) return;
      setCatalogLoaded(true);
    }
  })();

  return () => { mounted = false; };
}, [isSync]);


useEffect(() => {
  const q = cuisineInput.trim().toLowerCase();
  if (!q) { setCuisineSuggestions([]); return; }
  if (!catalogLoaded) { setCuisineSuggestions([]); return; }

  const matches = cuisineCatalog.filter((c) => {
    const label = c.label.toLowerCase();
    const aliasHit = c.aliases.some((a) => a.toLowerCase().includes(q));
    return label.includes(q) || aliasHit;
  });

  setCuisineSuggestions(matches.slice(0, 8));
}, [cuisineInput, cuisineCatalog, catalogLoaded]);



function canonicalizeCuisine(input: string) {
  const raw = input.trim();
  if (!raw) return "";

  const q = raw.toLowerCase();
  const exact = cuisineCatalog.find(c => c.label.toLowerCase() === q);
  if (exact) return exact.label;

  // alias exact
  const aliasExact = cuisineCatalog.find(c => c.aliases.some(a => a.toLowerCase() === q));
  if (aliasExact) return aliasExact.label;

  // fuzzy: "korea" should match "Korean"
  const starts = cuisineCatalog.find(c => c.label.toLowerCase().startsWith(q));
  if (starts) return starts.label;

  const aliasStarts = cuisineCatalog.find(c => c.aliases.some(a => a.toLowerCase().includes(q)));
  if (aliasStarts) return aliasStarts.label;

  // fallback: allow custom cuisine
  return raw;
}

function addCuisine(label: string) {
  const canon = canonicalizeCuisine(label);
  if (!canon) return;

  setSelectedCuisines((prev) => {
    if (prev.some(p => p.toLowerCase() === canon.toLowerCase())) return prev;
    return [...prev, canon];
  });
  setCuisineInput("");
  setCuisineSuggestions([]);
}




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
    //router.push(`/scan/menu-scan?returnTo=eatout&placeRefId=${encodeURIComponent(placeRefId)}&restaurantName=${encodeURIComponent(name)}`);
    router.push({
      pathname: "/scan/menu-scan",
      params: {
        returnTo: "/(tabs)/eat-out",
        placeRefId: placeRefId,
        restaurantName: name,
      },
    });
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

  useFocusEffect(
    React.useCallback(() => {
      let cancelled = false;
  
      (async () => {
        const next: Record<string, boolean> = {};
        for (const r of restaurants) {
          const draft = await getLocalMenuDraft(r.placeRefId);
          next[r.placeRefId] = !!draft?.items?.length;
        }
        if (!cancelled) setLocalMenuMap(next);
      })();
  
      return () => {
        cancelled = true;
      };
    }, [restaurants])
  );
  










  function onComingSoon() {
    Alert.alert("Menu (Coming Soon)", "Phase 2: connect to Google Menu / Toast / Uber and score automatically.");
  }

  const apricot = UI.colors.primary.apricot ?? UI.colors.primary.teal;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: UI.colors.bg }} contentContainerStyle={{ padding: UI.spacing.lg, paddingBottom: 90 }}>
      <Text style={styles.title}>{copy.title}</Text>
      <Text style={styles.sub}>{copy.sub}</Text>

      <Card style={styles.card}>
  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
    <Text style={styles.cardTitle}>Cuisines</Text>
    <Text
      onPress={() => setFiltersOpen((v) => !v)}
      style={{ color: UI.colors.textDim, fontWeight: "800" }}
    >
      {filtersOpen ? "Hide" : "Show"}
    </Text>
  </View>

  {filtersOpen ? (
    <>
      <Text style={styles.cardSub}>{copy.hint}</Text>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: UI.spacing.sm, marginTop: UI.spacing.sm }}>
  {selectedCuisines.map((c) => (
    <Pressable
      key={c}
      onPress={() => removeCuisine(c)}
      style={styles.chip}
    >
      <Text style={styles.chipText}>{c}  ×</Text>
    </Pressable>
  ))}
</View>

      <View style={{ marginTop: UI.spacing.md }}>
        <Text style={styles.cardTitle}>Add a cuisine</Text>
        <View style={{ flexDirection: "row", gap: UI.spacing.sm, marginTop: UI.spacing.xs }}>
          <TextInput
            value={cuisineInput}
            onChangeText={setCuisineInput}
            placeholder="e.g., American, Thai, Italian"
            placeholderTextColor={UI.colors.textMuted}
            style={styles.input}
            returnKeyType="done"
            onSubmitEditing={() => addCuisine(cuisineInput)}
          />
          <Button title="Add" onPress={() => addCuisine(cuisineInput)} disabled={!normalizeCuisine(cuisineInput)} />
        </View>
        
      </View>


      <View style={{ flexDirection: "row", gap: UI.spacing.md, marginTop: UI.spacing.md }}>
        <Button
          title="Clear all"
          variant="ghost"
          onPress={() => setSelectedCuisines([])}
          style={{ flex: 1, borderWidth: 1, borderColor: UI.colors.outline }}
        />
        <Button
          title={searching ? "Searching…" : "Search nearby"}
          onPress={runSearch}
          disabled={searching || !selectedCuisines.length}
          style={{ flex: 1 }}
        />
      </View>
    </>
  ) : (
    <View style={{ marginTop: 8 }}>
      <Text style={{ color: UI.colors.textDim }}>
        {selectedCuisines.length ? selectedCuisines.join(" · ") : "No cuisines selected"}
      </Text>
      <Button
        title={searching ? "Searching…" : "Search nearby"}
        onPress={runSearch}
        disabled={searching || !selectedCuisines.length}
        style={{ marginTop: UI.spacing.md }}
      />
    </View>
  )}
</Card>


      <Card style={styles.card}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={styles.cardTitle}>Restaurants (≤ 5 miles)</Text>
          {loadingStatus ? <Text style={{ color: UI.colors.textDim, fontSize: 12 }}>Checking saved menus…</Text> : null}
        </View>

        {!visible.length ? (
          <Text style={{ marginTop: 10, color: UI.colors.textDim }}>No matches for selected cuisines.</Text>
        ) : null}

        {visible.map((r) => {
          const st = statusMap[r.placeRefId];
          const hasSnapshot = !!st?.hasSnapshot;
          const hasLocal = !!localMenuMap[r.placeRefId];
          const isExpanded = expandedPlaceRefId === r.placeRefId;



          return (
            <View key={r.placeRefId} style={styles.restRow}>
            <Pressable
              onPress={() => setExpandedPlaceRefId((cur) => (cur === r.placeRefId ? null : r.placeRefId))}
              style={{ flex: 1 }}
            >
              <Text style={styles.restName}>{r.name}</Text>
        
              <Text style={styles.restMeta}>
                {(r.primaryType ?? "restaurant").replace(/_/g, " ")}
                {typeof r.rating === "number" ? ` · ★ ${r.rating.toFixed(1)}` : ""}
                {r.addressShort ? ` · ${r.addressShort}` : ""}
              </Text>
            </Pressable>

            {isExpanded && (
                  <View style={styles.restBtns}>
                  <Button
                    title={hasSnapshot ? "Rescan menu" : "Scan menu"}
                    onPress={() =>
                      router.push({
                        pathname: "/scan/menu-scan",
                        params: {
                          placeRefId: r.placeRefId,
                          restaurantName: r.name,
                          returnTo: "/(tabs)/eat-out",
                        },
                      })
                    }
                  />

                    {(hasSnapshot || hasLocal) && (
                      <Button
                        title={hasSnapshot ? "View menu (Scored)" : "View menu"}
                        
                        onPress={() =>
                          router.push({
                            pathname: "/eatout/menu-view",
                            params: { placeRefId: r.placeRefId, restaurantName: r.name },
                          })
                        }
                      />
                    )}

                    <Button title="Menu (Coming Soon)" disabled />

                  </View>
            )}

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
  input: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: UI.radius.md,
    borderWidth: 1,
    borderColor: UI.colors.outline,
    backgroundColor: UI.colors.surface2,
    color: UI.colors.text,
    fontSize: 16,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 },
  chip: {
    borderWidth: 1,
    borderColor: UI.colors.primary.teal,
    paddingHorizontal: UI.spacing.md,
    paddingVertical: UI.spacing.sm,
    borderRadius: 999,
  },
  chipText: { color: UI.colors.text, fontWeight: "600", fontSize: 14 },
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
