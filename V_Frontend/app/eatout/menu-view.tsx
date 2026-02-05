import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { UI } from "../../src/theme/ui";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { useModeGate } from "../../src/hooks/use-mode-gate";
import { syncEatOutGetSnapshot, type MenuSnapshot } from "../../src/api/meal-scoring";

export default function MenuViewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ placeRefId?: string; restaurantName?: string }>();
  const placeRefId = String(params.placeRefId ?? "").trim();
  const restaurantName = String(params.restaurantName ?? "").trim();

  const { mode } = useModeGate();
  const isSync = mode === "sync";

  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<MenuSnapshot | null>(null);

  useEffect(() => {
    async function load() {
      if (!isSync) {
        Alert.alert("Enable Sync", "Viewing scored menus requires Sync.");
        router.back();
        return;
      }
      if (!placeRefId) {
        Alert.alert("Missing restaurant", "Please open from a restaurant.");
        router.back();
        return;
      }

      setLoading(true);
      try {
        const resp = await syncEatOutGetSnapshot(placeRefId, { mode });
        setSnapshot(resp.data.snapshot);
      } catch {
        Alert.alert("No saved menu", "Scan the menu first to create a scored menu you can view later.");
        router.back();
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [isSync, placeRefId, mode, router]);

  function onRescan() {
    router.push(
      `/scan/menu-scan?returnTo=eatout&placeRefId=${encodeURIComponent(placeRefId)}&restaurantName=${encodeURIComponent(
        restaurantName
      )}`
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: UI.colors.bg }} contentContainerStyle={{ padding: UI.spacing.lg, paddingBottom: 90 }}>
      <Text style={styles.title}>View menu (Scored){restaurantName ? ` · ${restaurantName}` : ""}</Text>

      <Card style={styles.card}>
        {loading ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <ActivityIndicator />
            <Text style={{ color: UI.colors.textDim }}>Loading saved menu…</Text>
          </View>
        ) : snapshot ? (
          <>
            <Text style={styles.meta}>
              Saved {new Date(snapshot.updatedAt).toLocaleString()} · Expires {new Date(snapshot.expiresAt).toLocaleDateString()}
            </Text>

            {snapshot.items.slice(0, 20).map((it, idx) => (
              <View key={it.itemId ?? String(idx)} style={styles.itemRow}>
                <Text style={styles.itemName}>
                  {idx + 1}. {it.name}
                </Text>
                <Text style={styles.itemMeta}>
                  Score: {it.scoreValue ?? "—"} {it.scoreLabel ? `(${it.scoreLabel})` : ""}
                </Text>
                {it.reasons?.[0] ? <Text style={styles.itemWhy}>{it.reasons[0]}</Text> : null}
              </View>
            ))}

            <View style={{ flexDirection: "row", gap: UI.spacing.md, marginTop: UI.spacing.lg }}>
              <Button title="Rescan" onPress={onRescan} style={{ borderWidth: 1, borderColor: UI.colors.primary.apricot, flex: 1 }} />
              <Button title="Close" onPress={() => router.back()} variant="ghost" style={{ borderWidth: 1, borderColor: UI.colors.outline, flex: 1 }} />
            </View>
          </>
        ) : null}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: "900", color: UI.colors.text },
  card: { marginTop: UI.spacing.lg, padding: UI.spacing.lg, borderRadius: UI.radius.lg, backgroundColor: UI.colors.surface, borderWidth: 1, borderColor: UI.colors.outline },
  meta: { color: UI.colors.textDim, marginBottom: 10 },
  itemRow: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: UI.colors.outline },
  itemName: { color: UI.colors.text, fontWeight: "900" },
  itemMeta: { color: UI.colors.textDim, marginTop: 4 },
  itemWhy: { color: UI.colors.textDim, marginTop: 4 },
});
