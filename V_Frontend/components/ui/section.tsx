import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { UI } from "../../src/theme/ui";

export function SectionTitle(props: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{props.title}</Text>
        {props.subtitle ? <Text style={styles.sub}>{props.subtitle}</Text> : null}
      </View>
      {props.right ? <View>{props.right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: UI.spacing.gap },
  title: { color: UI.colors.text, fontSize: UI.type.cardTitle, fontWeight: "800" },
  sub: { color: UI.colors.textDim, marginTop: 2 },
});
