import React from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";
import { UI } from "../../src/theme/ui";

type BadgeVariant = "default" | "muted" | "ai";

export function Badge(props: { label: string; variant?: BadgeVariant; style?: ViewStyle; lock?: boolean }) {
  const variant = props.variant ?? "default";
  const label = props.lock ? `${props.label}  🔒` : props.label;

  return (
    <View style={[
      styles.base,
      variant === "ai" ? styles.ai : variant === "muted" ? styles.muted : styles.default,
      props.style,
    ]}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: UI.radius.pill,
    borderWidth: UI.border.thin,
  },
  default: {
    backgroundColor: UI.colors.pill.okBg,
    borderColor: UI.colors.pill.okBorder,
  },
  muted: {
    backgroundColor: UI.colors.btnBg,
    borderColor: UI.colors.outline,
  },
  ai: {
    backgroundColor: UI.colors.ai.pillBg,
    borderColor: UI.colors.ai.pillBorder,
  },
  text: {
    color: UI.colors.text,
    fontWeight: "800",
    fontSize: UI.type.small,
  },
});
