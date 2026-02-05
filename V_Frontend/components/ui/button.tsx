import React from "react";
import { Pressable, StyleProp, StyleSheet, Text, ViewStyle } from "react-native";
import { UI } from "../../src/theme/ui";

type Props = {
  title: string;
  onPress?: () => void;
  variant?: "default" | "danger" | "ghost";
  /** Accent styling: border and text use accentColor when set */
  tone?: "default" | "accent";
  accentColor?: string;
  disabled?: boolean;
  /** Allows passing arrays like: style={[styles.x, { borderColor: ... }]} */
  style?: StyleProp<ViewStyle>;
};

export function Button({ title, onPress, variant = "default", tone = "default", accentColor, disabled, style }: Props) {
  const isAccent = tone === "accent" && accentColor != null;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.base,
        variant === "ghost" && styles.ghost,
        variant === "danger" && styles.danger,
        isAccent && { backgroundColor: UI.colors.btnBg, borderColor: accentColor },
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text
        style={[
          styles.text,
          variant === "ghost" && styles.textGhost,
          variant === "danger" && styles.textDanger,
          isAccent && { color: accentColor },
          disabled && styles.textDisabled,
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: UI.spacing.btnY,
    paddingHorizontal: UI.spacing.btnX,
    borderRadius: UI.radius.btn,
    backgroundColor: UI.colors.btnBg,
    borderWidth: UI.border.thin,
    borderColor: UI.colors.btnBorder,
    alignItems: "center",
    justifyContent: "center",
    minHeight: UI.sizes.buttonH,
  },
  ghost: {
    backgroundColor: "transparent",
    borderColor: "transparent",
  },
  danger: {
    backgroundColor: UI.colors.errorBg,
    borderColor: UI.colors.errorBorder,
  },
  disabled: {
    opacity: 0.55,
  },
  text: {
    color: UI.colors.text,
    fontWeight: "700",
  },
  // Ghost buttons sit on dark surfaces, so they need *light* text.
  textGhost: {
    color: UI.colors.textDim,
  },
  textDanger: {
    color: UI.colors.text,
  },
  textDisabled: {
    color: UI.colors.textMuted,
  },
});
