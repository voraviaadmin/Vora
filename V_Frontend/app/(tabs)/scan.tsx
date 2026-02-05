// app/(tabs)/scan.tsx
import React, { useMemo, useState } from "react";
import { Alert, StyleSheet, Text, TextInput, View } from "react-native";
import { Link, useRouter } from "expo-router";

import { UI } from "../../src/theme/ui";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { useModeGate } from "../../src/hooks/use-mode-gate";

import { scanAnalyzeGeneral, syncScanScore } from "../../src/api/meal-scoring";

export default function ScanTabScreen() {
  const router = useRouter();
  const { mode } = useModeGate();

  const [text, setText] = useState("");
  const [general, setGeneral] = useState<any>(null);
  const [personalized, setPersonalized] = useState<any>(null);
  const [loading, setLoading] = useState<null | "general" | "personalized">(null);

  const subtitle = useMemo(() => {
    if (mode !== "sync") return "Privacy mode: fast, on-device, generic score.";
    return "Sync mode: personalized scoring + cloud features.";
  }, [mode]);

  async function onGeneral() {
    const t = text.trim();
    if (!t) {
      Alert.alert("Add text", "Paste label text first (ingredients / nutrition line items).");
      return;
    }
    setLoading("general");
    setPersonalized(null);
    try {
      const resp = await scanAnalyzeGeneral(t, { mode });
      setGeneral(resp);
    } catch (e: any) {
      Alert.alert("Couldn’t analyze", e?.message ?? "Try again.");
    } finally {
      setLoading(null);
    }
  }

  async function onPersonalized() {
    if (mode !== "sync") {
      Alert.alert("Enable Sync", "Personalized scoring uses your goals. Enable Sync in Profile.", [
        { text: "Not now", style: "cancel" },
        { text: "Go to Profile", onPress: () => router.push("/(tabs)/profile") },
      ]);
      return;
    }
    const t = text.trim();
    if (!t) {
      Alert.alert("Add text", "Paste label text first.");
      return;
    }
    setLoading("personalized");
    try {
      const resp = await syncScanScore(t, { mode });
      setPersonalized(resp);
    } catch (e: any) {
      Alert.alert("Couldn’t score", e?.message ?? "Try again.");
    } finally {
      setLoading(null);
    }
  }

  function onBarcode() {
    if (mode !== "sync") {
      Alert.alert(
        "Barcode needs Sync",
        "Barcode lookup may use cloud services. Enable Sync to use Barcode scan.",
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

  const renderScore = (resp: any) => {
    const d = resp?.data;
    if (!d?.score) return null;
    return (
      <View style={{ gap: 6 }}>
        <Text style={styles.scoreLine}>
          {d.score.kind === "personalized" ? "Personalized" : "General"}:{" "}
          <Text style={{ fontWeight: "900" }}>{d.score.value}</Text> ({d.score.label})
        </Text>
        <Text style={styles.scoreSub}>
          Confidence: {Math.round((d.ai?.confidence ?? 0) * 100)}%
        </Text>
        {Array.isArray(d.ai?.explanation) ? (
          <Text style={styles.scoreSub}>{d.ai.explanation[0]}</Text>
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Scan</Text>
      <Text style={styles.sub}>{subtitle}</Text>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Quick text score</Text>
        <Text style={styles.cardSub}>
          Paste label text for an instant result. General is always available; personalized requires Sync.
        </Text>

        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Paste ingredients / nutrition text…"
          placeholderTextColor={UI.colors.textMuted}
          style={styles.input}
          multiline
        />

        <View style={styles.row}>
          <Button
            title={loading === "general" ? "Analyzing…" : "General score"}
            onPress={onGeneral}
            disabled={!!loading}
            style={{ borderColor: peach, borderWidth: 1, flex: 1 }}
          />
          <Button
            title={loading === "personalized" ? "Scoring…" : "Personalized"}
            onPress={onPersonalized}
            disabled={!!loading}
            variant="ghost"
            style={{ borderWidth: UI.border.thin, borderColor: UI.colors.outline, flex: 1 }}
          />
        </View>

        {general ? (
          <Card style={{ padding: UI.spacing.md }}>
            <Text style={styles.miniTitle}>General result</Text>
            {renderScore(general)}
          </Card>
        ) : null}

        {personalized ? (
          <Card style={{ padding: UI.spacing.md }}>
            <Text style={styles.miniTitle}>Personalized result</Text>
            {renderScore(personalized)}
          </Card>
        ) : null}
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Picture scan</Text>
        <Text style={styles.cardSub}>Snap food or a menu. Edit the text instantly.</Text>

        <View style={styles.row}>
          <Link href={"/scan/food-scan"} asChild>
            <Button title="Food" style={{ borderColor: peach, borderWidth: 1 }} />
          </Link>
          <Link href={"/scan/menu-scan"} asChild>
            <Button
              title="Menu"
              variant="ghost"
              style={{ borderWidth: UI.border.thin, borderColor: UI.colors.outline }}
            />
          </Link>
        </View>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Barcode scan</Text>
        <Text style={styles.cardSub}>Fast lookup when Sync is enabled.</Text>
        <Button title="Scan barcode" onPress={onBarcode} style={{ borderColor: peach, borderWidth: 1 }} />
      </Card>
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
  title: { fontSize: 22, fontWeight: "800", color: UI.colors.text },
  sub: { color: UI.colors.textDim, marginTop: -6 },
  card: { padding: UI.spacing.lg, gap: UI.spacing.md },
  cardTitle: { fontSize: 16, fontWeight: "800", color: UI.colors.text },
  miniTitle: { fontSize: 13, fontWeight: "900", color: UI.colors.text },
  cardSub: { color: UI.colors.textDim },
  row: { flexDirection: "row", gap: UI.spacing.md },
  input: {
    backgroundColor: UI.colors.surface,
    borderColor: UI.colors.outline,
    borderWidth: 1,
    borderRadius: UI.radius.md,
    paddingHorizontal: UI.spacing.btnX,
    paddingVertical: 10,
    color: UI.colors.text,
    minHeight: 84,
  },
  scoreLine: { color: UI.colors.text },
  scoreSub: { color: UI.colors.textDim, fontSize: 12 },
});
