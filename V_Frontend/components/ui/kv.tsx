import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { UI } from "../../src/theme/ui";

export function KV(props: { label: string; value: string; right?: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{props.label}</Text>
      <View style={styles.right}>
        {props.right ? props.right : <Text style={styles.value}>{props.value}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: UI.spacing.gapSm },
  label: { color: UI.colors.textDim, fontWeight: "800" },
  right: { maxWidth: "70%", alignItems: "flex-end" },
  value: { color: UI.colors.text, fontWeight: "800", textAlign: "right" },
});
