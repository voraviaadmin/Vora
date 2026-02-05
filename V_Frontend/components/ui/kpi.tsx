import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { UI } from "../../src/theme/ui";

export function Kpi(props: {
  label: string;
  value: string | number | null;
  wide?: boolean;
  footer?: React.ReactNode;
}) {
  return (
    <View style={[styles.box, props.wide ? styles.wide : styles.normal]}>
      <Text style={styles.label}>{props.label}</Text>
      <Text style={styles.value}>{props.value ?? "—"}</Text>

      {props.footer ? <View style={styles.footer}>{props.footer}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: UI.colors.cardBg,
    borderRadius: UI.radius.inner,
    padding: UI.spacing.cardPadding,
    borderWidth: UI.border.thin,
    borderColor: UI.colors.cardBorder,
  },
  normal: { flex: 1 },
  wide: { flex: 1 },

  label: {
    color: UI.colors.textDim,
    fontWeight: "700",
    marginBottom: UI.spacing.textGapSm,
  },
  value: {
    color: UI.colors.text,
    fontSize: UI.type.kpiValue,
    fontWeight: "900",
  },
  footer: {
    marginTop: UI.spacing.sectionGapSm,
  },
});
