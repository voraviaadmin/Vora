import React from "react";
import { Platform, StyleSheet, View, ViewProps } from "react-native";
import { UI } from "../../src/theme/ui";

export function Card({ style, ...props }: ViewProps) {
  return (
    <View {...props} style={[styles.card, style]}>
      <View pointerEvents="none" style={styles.innerHighlight} />
      {props.children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: UI.colors.cardBg,
    borderColor: UI.colors.cardBorder,
    borderWidth: UI.border.thin,
    borderRadius: UI.radius.card,
    padding: UI.spacing.cardPad,
    marginTop: UI.spacing.sectionGap,

    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: UI.shadow.card.opacity,
        shadowRadius: UI.shadow.card.blur,
        shadowOffset: { width: 0, height: UI.shadow.card.y },
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  innerHighlight: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: UI.radius.card - 1,
    borderWidth: 1,
    borderColor: UI.colors.innerHighlight,
    opacity: 0.35,
  },
});
