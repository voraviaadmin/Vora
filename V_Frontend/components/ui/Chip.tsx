import React from "react";
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { UI } from "../../src/theme/ui";

type ChipVariant = "neutral" | "good" | "ok" | "bad";
type Props = {
  label: string;
  onPress?: () => void;
  variant?: ChipVariant;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

function palette(variant: ChipVariant, selected: boolean) {
  if (selected) {
    return {
      bg: UI.colors.homeCards.focusBg,
      border: UI.colors.homeCards.focusBorder,
      text: UI.colors.text,
    };
  }
  if (variant === "good") return { bg: UI.colors.pill.goodBg, border: UI.colors.pill.goodBorder, text: UI.colors.text };
  if (variant === "ok") return { bg: UI.colors.pill.okBg, border: UI.colors.pill.okBorder, text: UI.colors.text };
  if (variant === "bad") return { bg: UI.colors.pill.badBg, border: UI.colors.pill.badBorder, text: UI.colors.text };
  return { bg: UI.colors.pill.neutralBg, border: UI.colors.pill.neutralBorder, text: UI.colors.text };
}

export function Chip({ label, onPress, variant = "neutral", selected = false, style, testID }: Props) {
  const p = palette(variant, selected);

  if (!onPress) {
    return (
      <View testID={testID} style={[styles.base, { backgroundColor: p.bg, borderColor: p.border }, style]}>
        <Text style={[styles.text, { color: p.text }]}>{label}</Text>
      </View>
    );
  }

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: p.bg, borderColor: p.border },
        pressed && styles.pressed,
        style,
      ]}
    >
      <Text style={[styles.text, { color: p.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: UI.sizes.chipH,
    paddingHorizontal: UI.spacing.pillX,
    borderRadius: UI.radius.pill,
    borderWidth: UI.border.thin,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.94, transform: [{ scale: 0.99 }] },
  text: {
    fontSize: UI.type.label,
    fontWeight: "600",
  },
});
