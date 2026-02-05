import React, { useMemo } from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";
import { UI } from "../../src/theme/ui";

type Props = {
  value: number | string | null | undefined;
  style?: ViewStyle;
};

export function ScorePill({ value, style }: Props) {
  const num = typeof value === "number" ? value : null;

  const pillStyle = useMemo(() => {
    if (num == null) return styles.neutral;
    if (num >= UI.scoring.goodMin) return styles.good;
    if (num >= UI.scoring.okMin) return styles.ok;
    return styles.bad;
  }, [num]);

  return (
    <View style={[styles.base, pillStyle, style]}>
      <Text style={styles.text}>{value == null ? "—" : String(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    minWidth: 44,
    paddingVertical: UI.spacing.pillY,
    paddingHorizontal: UI.spacing.pillX,
    borderRadius: UI.radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: UI.border.thin,
  },
  text: {
    color: UI.colors.text,
    fontWeight: "900",
  },
  good: { backgroundColor: UI.colors.pill.goodBg, borderColor: UI.colors.pill.goodBorder },
  ok: { backgroundColor: UI.colors.pill.okBg, borderColor: UI.colors.pill.okBorder },
  bad: { backgroundColor: UI.colors.pill.badBg, borderColor: UI.colors.pill.badBorder },
  neutral: { backgroundColor: UI.colors.pill.neutralBg, borderColor: UI.colors.pill.neutralBorder },
});
