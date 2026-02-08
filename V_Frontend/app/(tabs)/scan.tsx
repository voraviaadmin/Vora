// app/(tabs)/scan.tsx
import React, { useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import { UI } from "../../src/theme/ui";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { useModeGate } from "../../src/hooks/use-mode-gate";

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

export default function ScanTabScreen() {
  const router = useRouter();
  const { mode } = useModeGate();
  const isSync = mode === "sync";

  const [mealType, setMealType] = useState<MealType>(() => defaultMealType());
  const [chooserOpen, setChooserOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const subtitle = useMemo(() => {
    if (!isSync) return "Privacy Mode: on-device scanning. Nothing leaves your phone.";
    return "Sync Mode: personalized scoring using your profile & goals.";
  }, [isSync]);

  function goFood(start: "camera" | "text") {
    setChooserOpen(false);
    setMoreOpen(false);
    router.push({
      pathname: "/scan/food-scan",
      params: {
        mealType,
        start,
      },
    });
  }

  function goMenu() {
    setChooserOpen(false);
    setMoreOpen(false);
    router.push({
      pathname: "/scan/menu-scan",
      params: {
        // Synthetic "restaurant" so scan-menu can work standalone
        placeRefId: "scan",
        restaurantName: "Scanned menu",
        returnTo: "/(tabs)/scan",
        mealType,
      },
    });
  }
  

  function onBarcode() {
    if (!isSync) {
      Alert.alert(
        "Barcode needs Sync",
        "Barcode lookup may use cloud services. Enable Sync in Profile.",
        [
          { text: "Not now", style: "cancel" },
          { text: "Go to Profile", onPress: () => router.push("/(tabs)/profile") },
        ]
      );
      return;
    }
    Alert.alert("Coming soon", "Barcode scan UI will be added next.");
  }

  const peach = UI.colors.primary.pink;

  return (
    <View style={styles.container}>
      <View style={{ gap: 6 }}>
        <Text style={styles.title}>Scan</Text>
        <Text style={styles.sub}>{subtitle}</Text>
      </View>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Log to</Text>
        <Text style={styles.cardSub}>
          Pick a meal time once. Scans and menu selections will log to it.
        </Text>

        <View style={styles.pillRow}>
          {(["breakfast", "lunch", "dinner", "snack"] as MealType[]).map((mt) => {
            const selected = mealType === mt;
            return (
              <Pressable
                key={mt}
                onPress={() => setMealType(mt)}
                style={[
                  styles.pill,
                  selected && {
                    borderColor: peach,
                    backgroundColor: UI.colors.surface,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Select ${labelMealType(mt)}`}
              >
                <Text style={[styles.pillText, selected && { color: UI.colors.text }]}>
                  {labelMealType(mt)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={{ height: 6 }} />

        <Button
          title="Scan"
          onPress={() => setChooserOpen(true)}
          style={{ borderColor: peach, borderWidth: 1 }}
        />

        <View style={{ height: UI.spacing.sm }} />

        <Button
          title="Type instead"
          variant="ghost"
          onPress={() => goFood("text")}
          style={{ borderWidth: UI.border.thin, borderColor: UI.colors.outline }}
        />
      </Card>

      {/* Intent chooser: progressive disclosure */}
      <Modal transparent visible={chooserOpen} animationType="fade" onRequestClose={() => setChooserOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => { setChooserOpen(false); setMoreOpen(false); }}>
          <Pressable style={styles.sheet} onPress={() => { /* swallow */ }}>
            <Text style={styles.sheetTitle}>What do you want to scan?</Text>
            <Text style={styles.sheetSub}>
              {isSync ? "Personalized scoring using your profile." : "On-device processing in Privacy Mode."}
            </Text>

            <View style={{ height: UI.spacing.md }} />

            <Button title="Food" onPress={() => goFood("camera")} style={{ borderColor: peach, borderWidth: 1 }} />
            <View style={{ height: UI.spacing.sm }} />
            <Button
              title="Menu"
              variant="ghost"
              onPress={goMenu}
              style={{ borderWidth: UI.border.thin, borderColor: UI.colors.outline }}
            />

            {isSync ? (
              <>
                <View style={{ height: UI.spacing.sm }} />
                <Button
                  title="Barcode"
                  variant="ghost"
                  onPress={onBarcode}
                  style={{ borderWidth: UI.border.thin, borderColor: UI.colors.outline }}
                />
              </>
            ) : null}

            <View style={{ height: UI.spacing.md }} />

            <Pressable
              onPress={() => setMoreOpen((v) => !v)}
              accessibilityRole="button"
              style={styles.moreRow}
            >
              <Text style={styles.moreText}>{moreOpen ? "Hide options" : "More options"}</Text>
              <Text style={styles.moreChevron}>{moreOpen ? "▴" : "▾"}</Text>
            </Pressable>

            {moreOpen ? (
              <View style={{ marginTop: UI.spacing.md }}>
                <Button
                  title="Paste text"
                  variant="ghost"
                  onPress={() => goFood("text")}
                  style={{ borderWidth: UI.border.thin, borderColor: UI.colors.outline }}
                />
              </View>
            ) : null}

            <View style={{ height: UI.spacing.lg }} />

            <Button
              title="Close"
              variant="ghost"
              onPress={() => { setChooserOpen(false); setMoreOpen(false); }}
              style={{ borderWidth: UI.border.thin, borderColor: UI.colors.outline }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: UI.colors.bg,
    padding: UI.spacing.lg,
    gap: UI.spacing.lg,
  },
  title: { fontSize: 22, fontWeight: "900", color: UI.colors.text },
  sub: { color: UI.colors.textDim, marginTop: -2 },

  card: { padding: UI.spacing.lg, gap: UI.spacing.md },
  cardTitle: { fontSize: 16, fontWeight: "900", color: UI.colors.text },
  cardSub: { color: UI.colors.textDim },

  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: UI.spacing.sm, marginTop: 6 },
  pill: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: UI.border.thin,
    borderColor: UI.colors.outline,
    backgroundColor: UI.colors.bg,
  },
  pillText: { color: UI.colors.textDim, fontWeight: "800", fontSize: 13 },

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
  sheetSub: { color: UI.colors.textDim, marginTop: 4 },

  moreRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  moreText: { color: UI.colors.textDim, fontWeight: "800" },
  moreChevron: { color: UI.colors.textDim, fontWeight: "900" },
});
