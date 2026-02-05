import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { UI } from "../../src/theme/ui";
import { Badge } from "./badge";

type ScoringResult = {
  score: number;
  reasons: string[];
  signals: any;
  ai?: { used: boolean; model?: string; confidence?: number } | null;
};

type Props = {
  scoring: ScoringResult;
  explained: boolean;
  privacyTip?: string;
};

export function ScoringPanel({ scoring, explained, privacyTip }: Props) {
  const aiPct =
    scoring.ai?.confidence != null ? Math.round(scoring.ai.confidence * 100) : null;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>Score</Text>

        <View style={styles.badges}>
          {explained ? (
            <Badge label="Explained" lock />
          ) : (
            <Badge label="Preview" variant="muted" />
          )}

          {scoring.ai?.used ? (
            <Badge
              label={aiPct != null ? `AI ${aiPct}%` : "AI"}
              variant="muted"
            />
          ) : null}
        </View>
      </View>

      <Text style={styles.score}>{scoring.score}</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Why</Text>

        {scoring.reasons?.length ? (
          scoring.reasons.map((r, i) => (
            <Text key={i} style={styles.reason}>
              • {r}
            </Text>
          ))
        ) : (
          <Text style={styles.muted}>No explanation available.</Text>
        )}
      </View>

      {!explained && privacyTip ? (
        <Text style={styles.tip}>{privacyTip}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: UI.spacing.sectionGap,
    backgroundColor: UI.colors.cardBg,
    borderRadius: UI.radius.inner,
    padding: UI.spacing.cardPadding,
    borderWidth: UI.border.thin,
    borderColor: UI.colors.cardBorder,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  badges: {
    flexDirection: "row",
    gap: UI.spacing.gapXs,
  },
  title: {
    color: UI.colors.textDim,
    fontWeight: "800",
  },
  score: {
    marginTop: UI.spacing.gapSm,
    fontSize: UI.type.scoreBig,
    fontWeight: "900",
    color: UI.colors.text,
  },
  section: {
    marginTop: UI.spacing.sectionGapSm,
  },
  sectionTitle: {
    color: UI.colors.textDim,
    fontWeight: "800",
    marginBottom: UI.spacing.textGapSm,
  },
  reason: {
    color: UI.colors.text,
    opacity: UI.opacity.reason,
    lineHeight: UI.type.lineHeightMd,
  },
  muted: {
    color: UI.colors.textMuted,
  },
  tip: {
    marginTop: UI.spacing.gapSm,
    color: UI.colors.textMuted,
  },
});
