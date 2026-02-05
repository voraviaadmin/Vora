import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { UI } from "../../src/theme/ui";
import { Button } from "./button";

export function ErrorBanner(props: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.box}>
      <Text style={styles.text}>{props.message}</Text>
      {props.onRetry ? <Button title="Retry" onPress={props.onRetry} style={{ alignSelf: "flex-start" }} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    marginTop: UI.spacing.sectionGap,
    padding: 12,
    borderRadius: UI.radius.btn,
    borderWidth: UI.border.thin,
    borderColor: UI.colors.errorBorder,
    backgroundColor: UI.colors.errorBg,
  },
  text: {
    color: UI.colors.text,
    fontWeight: "800",
    marginBottom: 10,
  },
});
