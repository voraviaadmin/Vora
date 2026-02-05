import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { UI } from "../../src/theme/ui";
import { Bullets } from "./bullets";

export function ScoreFactors(props: { scoring: { reasons: string[]; signals: any } | null }) {
  if (!props.scoring) return <Text style={styles.muted}>—</Text>;

  const signals = props.scoring.signals || {};
  const pills: string[] = [];

  if (signals.snackStreakN) pills.push("Snack streak");
  if (signals.lateSnackInWindow) pills.push("Late-night");
  if (signals.skippedMealsLikely) pills.push("Skipped meals");
  if (signals.uniqueMealTypesWindow != null && signals.uniqueMealTypesWindow <= 1) pills.push("Low variety");

  return (
    <View>
      {pills.length ? (
        <View style={styles.pills}>
          {pills.map((p) => (
            <View key={p} style={styles.pill}>
              <Text style={styles.pillText}>{p}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <Bullets items={props.scoring.reasons ?? []} />
    </View>
  );
}

const styles = StyleSheet.create({
  muted: { color: UI.colors.textMuted, marginTop: UI.spacing.gapSm },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: UI.spacing.gapSm, marginBottom: 6 },
  pill: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: UI.radius.pill,
    borderWidth: UI.border.thin,
    borderColor: UI.colors.outline,
    backgroundColor: UI.colors.cardBg,
  },
  pillText: { color: UI.colors.textDim, fontWeight: "900", fontSize: UI.type.small },
});
