import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Card } from "../ui/card";
import { UI } from "../../src/theme/ui";

type Props = {
  backendOk: boolean;
  meJson?: string | null;
  errorText?: string | null;

  // ✅ add
  backendLabel?: string;
  backendColor?: string;
};



/**
 * Dev-only status card. Put behind `__DEV__` on Home.
 * Safe to delete for production.
 */
export function DevStatusCard({ backendOk, meJson, errorText, backendLabel, backendColor }: Props) {
  const backendText = backendLabel ?? (backendOk ? "Connected" : "Offline");
  const backendTextColor =
    backendColor ?? (backendOk ? UI.colors.primary.teal : UI.colors.status.danger);

  return (
    <Card>
      <Text style={styles.title}>Developer status</Text>

      <View style={styles.row}>
        <Text style={styles.label}>Frontend boot</Text>
        <Text style={styles.value}>OK</Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Backend</Text>
        <Text style={[styles.value, { color: backendTextColor }]}>{backendText}</Text>
      </View>

      {!!errorText && <Text style={styles.error}>Error: {errorText}</Text>}
      {!!meJson && <Text style={styles.mono}>{meJson}</Text>}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 13, fontWeight: "700", color: UI.colors.text },
  row: { flexDirection: "row", justifyContent: "space-between", marginTop: UI.spacing.gapXs },
  label: { fontSize: 12, color: UI.colors.textMuted },
  value: { fontSize: 12, fontWeight: "600", color: UI.colors.text },
  error: { marginTop: UI.spacing.gapSm, fontSize: 12, color: UI.colors.status.danger },
  mono: { marginTop: UI.spacing.gapSm, fontSize: 11, color: UI.colors.textMuted },
});
