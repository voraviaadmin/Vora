import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { UI } from "../../src/theme/ui";

export type TrendDaily = { day: string; count: number; avgScore: number | null };

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function TrendChart(props: { daily: TrendDaily[] }) {
  const daily = props.daily ?? [];

  const max = useMemo(() => {
    const vals = daily.map((d) => d.avgScore ?? 0);
    return Math.max(1, ...vals);
  }, [daily]);

  if (!daily.length) {
    return <Text style={styles.muted}>No data yet.</Text>;
  }

  return (
    <View style={styles.chartBox}>
      <View style={styles.barsWrap}>
        {daily.map((d) => {
          const v = d.avgScore ?? 0;
          const pct = clamp(v / max, 0, 1);
          const h = UI.trend.barMinH + pct * (UI.trend.barMaxH - UI.trend.barMinH);

          return (
            <View key={d.day} style={styles.barCol}>
              <View style={[styles.bar, { height: h }]} />
              <Text style={styles.barLabel}>{d.day.slice(5)}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  muted: { color: UI.colors.textMuted, marginTop: UI.spacing.gapSm },

  chartBox: {
    marginTop: UI.spacing.gapSm,
    paddingVertical: 8,
    paddingHorizontal: 6,
    backgroundColor: UI.colors.chartBg,
    borderRadius: UI.radius.inner,
    borderWidth: UI.border.thin,
    borderColor: UI.colors.chartBorder,
  },

  barsWrap: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: UI.spacing.gapXs,
  },

  barCol: { alignItems: "center", width: UI.trend.barColW },

  bar: {
    width: UI.trend.barW,
    borderRadius: UI.trend.barW / 2,
    backgroundColor: UI.colors.chartBar,
    marginBottom: 6,
  },

  barLabel: { color: "rgba(255,255,255,0.55)", fontSize: UI.type.small },
});
