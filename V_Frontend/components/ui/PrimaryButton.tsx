import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { UI } from "../../src/theme/ui";

type Props = {
  title: string;
  subtitle?: string | null;
  onPress?: () => void;
  disabled?: boolean;
  testID?: string;
};

export function PrimaryButton({ title, subtitle, onPress, disabled, testID }: Props) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <View style={styles.textWrap}>
        <Text style={styles.title}>{title}</Text>
        {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: UI.sizes.buttonH,
    borderRadius: UI.radius.btn,
    paddingHorizontal: UI.spacing.page,
    paddingVertical: UI.spacing.btnY,
    justifyContent: "center",
    backgroundColor: UI.colors.primary.teal,
  },
  pressed: {
    opacity: 0.94,
    transform: [{ scale: 0.99 }],
  },
  disabled: {
    backgroundColor: UI.colors.primary.tealMuted,
    opacity: 0.7,
  },
  textWrap: {
    gap: 2,
  },
  title: {
    color: UI.colors.surface,
    fontSize: UI.type.label,
    fontWeight: "600",
  },
  subtitle: {
    color: "rgba(255,255,255,0.85)",
    fontSize: UI.type.caption,
    fontWeight: "400",
  },
});
