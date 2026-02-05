import React from "react";
import { StyleSheet, View } from "react-native";
import { UI } from "../../src/theme/ui";
import { Badge } from "./badge";

export function AIPill(props: { confidence?: number | null }) {
  const c = props.confidence;
  if (c == null) return null;

  const pct = Math.round(c * 100);

  return (
    <View style={styles.wrap}>
      <Badge label={`AI ${pct}%`} lock variant="ai" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: UI.spacing.gapXs,
    alignSelf: "flex-start",
  },
});
