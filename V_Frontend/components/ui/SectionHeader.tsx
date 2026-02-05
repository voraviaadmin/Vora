import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { UI } from "../../src/theme/ui";

type Props = {
  title: string;
  subtitle?: string | null;
  right?: React.ReactNode;
};

export function SectionHeader({ title, subtitle, right }: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <Text style={styles.title}>{title}</Text>
        {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
      {!!right && <View style={styles.right}>{right}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: UI.spacing.gap,
  },
  left: { flex: 1 },
  right: { alignItems: "flex-end", justifyContent: "flex-end" },
  title: {
    fontSize: UI.type.sectionTitle,
    fontWeight: "700",
    color: UI.colors.text,
  },
  subtitle: {
    marginTop: UI.spacing.textGapSm,
    fontSize: UI.type.caption,
    fontWeight: "400",
    color: UI.colors.textMuted,
  },
});
