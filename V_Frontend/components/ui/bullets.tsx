import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { UI } from "../../src/theme/ui";

export function Bullets(props: { items: string[] }) {
  if (!props.items?.length) return <Text style={styles.muted}>—</Text>;

  return (
    <View style={{ marginTop: UI.spacing.gapSm }}>
      {props.items.map((t, i) => (
        <View key={`${i}-${t}`} style={styles.row}>
          <Text style={styles.dot}>•</Text>
          <Text style={styles.text}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  muted: { color: UI.colors.textMuted, marginTop: UI.spacing.gapSm },
  row: { flexDirection: "row", gap: 8, marginTop: 6 },
  dot: { color: UI.colors.textDim, fontWeight: "900" },
  text: { color: "rgba(255,255,255,0.85)", flex: 1, lineHeight: 20 },
});
