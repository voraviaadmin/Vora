import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { UI } from "../../src/theme/ui";
import { ScorePill } from "./pill";
import { Badge } from "./badge";

export type LogRowVM = {
  title: string;
  subtitle: string;
  score: number | null;
  explained: boolean;
};

export function LogRowItem(props: { item: LogRowVM; onPress: () => void }) {
  const { item } = props;
  return (
    <Pressable onPress={props.onPress} style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.sub}>{item.subtitle}</Text>
      </View>

      <View style={styles.right}>
        {item.explained ? <Badge label="Explained" /> : null}
        <ScorePill value={item.score} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: UI.spacing.gap,
  },
  title: { color: UI.colors.text, fontWeight: "900", fontSize: UI.type.rowTitle },
  sub: { color: UI.colors.textMuted, marginTop: 4 },
  right: { alignItems: "flex-end", gap: UI.spacing.gapXs },
});
