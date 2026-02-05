import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  //Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { apiJson } from "../../lib/api";
import { UI } from "../../src/theme/ui";

import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { ScorePill } from "../../components/ui/pill";
import { SectionTitle } from "../../components/ui/section";
import { ErrorBanner } from "../../components/ui/error-banner";
import { Kpi } from "../../components/ui/kpi";
import { TrendChart } from "../../components/ui/trend-chart";
import { ModalCard } from "../../components/ui/modal-card";
import { KV } from "../../components/ui/kv";
import { Bullets } from "../../components/ui/bullets";
import { Badge } from "../../components/ui/badge";
import { LogRowItem } from "../../components/ui/log-row-item";
import { ScoreDelta } from "../../components/ui/score-delta";
import { ScoreFactors } from "../../components/ui/score-factors";
import { AIPill } from "../../components/ui/ai-pill";
import { ScoringPanel } from "../../components/ui/scoring-panel";
import { getLocalLogs } from "../../src/storage/local-logs"; // adjust relative path
import { useModeGate } from "../../src/hooks/use-mode-gate";





type LogRow = {
  logId: string;
  actorUserId: string;
  subjectMemberId: string;
  groupId: string | null;
  placeRefId: string | null;
  mealType: string | null;
  score: number | null;
  summary: string | null;
  capturedAt: string | null;
  createdAt: string;
  updatedAt: string;
  scoring?: { score: number; reasons: string[]; signals: any; mealType?: string | null; nowIso?: string } | null;
};

type TrendDaily = { day: string; count: number; avgScore: number | null };

type Trend = {
  windowDays: number;
  avgScore: number | null;
  countScored: number;
  bestScore: number | null;
  worstScore: number | null;
  streakDaysWithLogs: number;
  streakDaysWithGoodScore: number;
  daily: TrendDaily[];
};


type ScorePreview = {
  scoring: {
    score: number;
    reasons: string[];
    signals: any;
  };
};



function formatIso(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function InsightFromSignals({ signals }: { signals: any }) {
  if (!signals) return <Text style={{ color: UI.colors.textMuted }}>—</Text>;

  const items: string[] = [];

  if (signals.snackStreakN) items.push("You’ve logged multiple snacks in a row. Consider a full meal to reset the pattern.");
  if (signals.lateSnackInWindow) items.push("Late-night snacks were detected recently. Try shifting snacks earlier if possible.");

  if (signals.skippedMealsLikely) {
    const missed = Object.entries(signals.skippedMealsLikely)
      .filter(([, v]) => !!v)
      .map(([k]) => k);
    if (missed.length) items.push(`Missing recent logs for: ${missed.join(", ")}.`);
  }

  if (signals.uniqueMealTypesWindow != null && signals.uniqueMealTypesWindow <= 1) {
    items.push("Low meal variety recently. Adding breakfast/lunch/dinner logs can improve stability.");
  }

  if (!items.length) items.push("No major patterns detected. Keep logging consistently.");

  return <Bullets items={items} />;
}


export default function LogsTab() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [trend, setTrend] = useState<Trend | null>(null);

  const [days, setDays] = useState<3 | 7 | 14>(7);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<LogRow | null>(null);
  const [scorePreview, setScorePreview] = useState<ScorePreview | null>(null);
const [scorePreviewLoading, setScorePreviewLoading] = useState(false);
const todayAvg = trend?.daily?.[trend.daily.length - 1]?.avgScore ?? null;
const ydayAvg = trend?.daily?.[trend.daily.length - 2]?.avgScore ?? null;


// IMPORTANT:
// Logs screen is source-aware.
// - privacy → local-logs
// - sync → backend

const { mode, ready } = useModeGate();

const loadAll = useCallback(
  async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    if (!silent) setLoading(true);
    setError(null);

    try {
      // ✅ PRIVACY: local logs only (no backend)
      if (mode === "privacy") {
        const all = await getLocalLogs();

        // Map LocalLog -> whatever your LogRow expects.
        // If your UI only needs summary/capturedAt/score, this is enough.
        const rows = all
          .slice()
          .sort((a, b) => (b.capturedAt || "").localeCompare(a.capturedAt || ""))
          .map((l) => ({
            id: l.id,
            capturedAt: l.capturedAt,
            summary: l.summary,
            score: l.scoring?.score ?? 0,
            scoring: l.scoring,
          })) as any;

        setLogs(rows);

        // Optional: if your Trend UI supports null, keep it null in privacy for now:
        setTrend(null);

        return;
      }

      // ✅ SYNC: existing behavior
      const logsRes = await apiJson<{ logs: LogRow[] }>(`/v1/logs?limit=100`);
      setLogs(logsRes.logs ?? []);

      const mc = await apiJson<{ trend: Trend }>(
        `/v1/profile/meal-context?days=${days}&limit=0`
      );
      setTrend(mc.trend ?? null);
    } catch (e: any) {
      setError(e?.message ?? "Network request failed");
    } finally {
      if (!silent) setLoading(false);
    }
  },
  [days, mode]
);

  async function openLog(l: LogRow) {
    setSelected(l);
    setScorePreview(null);
  
    // Sync mode stored explanation → no need to fetch fallback
    if (l.scoring) return;
  
    setScorePreviewLoading(true);
    try {
      const sp = await apiJson<ScorePreview>("/v1/profile/score-preview");
      setScorePreview(sp);
    } finally {
      setScorePreviewLoading(false);
    }
  }
  


  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll({ silent: true });
    setRefreshing(false);
  }, [loadAll]);

  const sortedLogs = useMemo(() => {
    return [...logs].sort((a, b) => {
      const ta = new Date(a.capturedAt ?? a.createdAt).getTime();
      const tb = new Date(b.capturedAt ?? b.createdAt).getTime();
      return tb - ta;
    });
  }, [logs]);

  const daysPicker = (
    <View style={{ flexDirection: "row", gap: UI.spacing.gapSm }}>
      {[3, 7, 14].map((d) => {
        const active = days === d;
        return (
          <Pressable
            key={d}
            onPress={() => setDays(d as 3 | 7 | 14)}
            style={[styles.dayBtn, active ? styles.dayBtnActive : null]}
          >
            <Text style={[styles.dayText, active ? styles.dayTextActive : null]}>{d}d</Text>
          </Pressable>
        );
      })}
    </View>
  );
  
  const explanation = selected?.scoring ?? scorePreview?.scoring ?? null;
  const explanationSource: "per-log" | "fallback" | "none" =
    selected?.scoring ? "per-log" : scorePreview?.scoring ? "fallback" : "none";
  


  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.h1}>Logs</Text>
      <Text style={styles.sub}>Scores update as you log. Trend windows are configurable.</Text>

      {error ? <ErrorBanner message={error} onRetry={() => loadAll()} /> : null}

      <Card>
        <SectionTitle title="Trend" subtitle="Rolling average and streaks" right={daysPicker} />

        {loading && !trend ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator />
            <Text style={styles.loadingText}>Loading trend…</Text>
          </View>
        ) : trend ? (
          <>
            <View style={styles.kpiRow}>
              
            <View style={{ flex: 1 }}>
              
            <Kpi
              label="Avg"
              value={trend.avgScore}
              footer={
                <>
                  <ScoreDelta today={todayAvg} yesterday={ydayAvg} />
                  <AIPill confidence={null} />
                </>
              }
            />



            </View>

              <Kpi label="Best" value={trend.bestScore} />
              <Kpi label="Worst" value={trend.worstScore} />
            </View>

            <View style={styles.kpiRow}>
              <Kpi
                wide
                label="Streak"
                value={`${trend.streakDaysWithLogs} day${trend.streakDaysWithLogs === 1 ? "" : "s"} logging`}
              />
              <Kpi
                wide
                label="Good streak"
                value={`${trend.streakDaysWithGoodScore} day${trend.streakDaysWithGoodScore === 1 ? "" : "s"} ≥ threshold`}
              />
            </View>

            <TrendChart daily={trend.daily ?? []} />

          </>
        ) : (
          <Text style={styles.muted}>No trend available.</Text>
        )}
      </Card>

      <Card>
        <SectionTitle title="Recent logs" subtitle="Tap a log for details" />

        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator />
            <Text style={styles.loadingText}>Loading logs…</Text>
          </View>
        ) : sortedLogs.length === 0 ? (
          <Text style={styles.muted}>No logs yet.</Text>
        ) : (
          <View style={{ marginTop: UI.spacing.gapSm }}>
            
            {sortedLogs.map((l) => (
              <LogRowItem
              key={l.logId ?? `${l.createdAt}-${l.summary ?? "log"}`}
                item={{
                  title: l.summary?.trim() ? l.summary.trim() : "Log",
                  subtitle: `${formatIso(l.capturedAt)} • ${l.mealType ?? "—"}`,
                  score: l.score ?? null,
                  explained: !!l.scoring,
                }}
                onPress={() => openLog(l)}
              />
            ))}




          </View>
        )}
      </Card>

<ModalCard
        visible={!!selected}
        title="Log details"
        onClose={() => {
          setSelected(null);
          setScorePreview(null);
        }}
        footer={<Button title="Close" onPress={() => { setSelected(null); setScorePreview(null); }} />}
      >
        <KV label="Score" value="" right={<ScorePill value={selected?.score} />} />
        <KV label="Meal" value={selected?.mealType ?? "—"} />
        <KV label="Captured" value={formatIso(selected?.capturedAt)} />
        <KV label="Created" value={formatIso(selected?.createdAt)} />


        {explanation ? (
            <ScoringPanel
              scoring={{
                score: explanation.score,
                reasons: explanation.reasons,
                signals: explanation.signals,
              }}
              explained={explanationSource === "per-log"}
              privacyTip={
                explanationSource === "fallback"
                  ? "Turn on Sync to store encrypted, per-log explanations across devices."
                  : undefined
              }
            />
          ) : scorePreviewLoading ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: UI.spacing.gap }}>
              <ActivityIndicator />
              <Text style={{ color: UI.colors.textDim }}>Loading explanation…</Text>
            </View>
          ) : null}




</ModalCard>


      <View style={{ height: UI.spacing.sectionGap * 2 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: UI.colors.bg },
  container: { padding: UI.spacing.page },

  h1: { color: UI.colors.text, fontSize: UI.type.h1, fontWeight: "800", marginBottom: 6 },
  sub: { color: UI.colors.textDim, marginBottom: UI.spacing.sectionGap },

  muted: { color: UI.colors.textMuted, marginTop: UI.spacing.gapSm },

  loadingRow: { flexDirection: "row", alignItems: "center", gap: UI.spacing.gap, marginTop: UI.spacing.gapSm },
  loadingText: { color: UI.colors.textDim },

  kpiRow: { flexDirection: "row", gap: UI.spacing.gap, marginTop: UI.spacing.sectionGap },


 
  dayBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: UI.radius.pill,
    borderWidth: UI.border.thin,
    borderColor: UI.colors.outline,
    backgroundColor: UI.colors.cardBg,
  },
  dayBtnActive: { borderColor: UI.colors.outlineStrong, backgroundColor: UI.colors.btnBg },
  dayText: { color: "rgba(255,255,255,0.8)", fontWeight: "700" },
  dayTextActive: { color: UI.colors.text },

 /* modalBackdrop: {
    flex: 1,
    backgroundColor: UI.colors.modalBackdrop,
    padding: UI.spacing.page,
    justifyContent: "center",
  }, */
  modalCard: {
    backgroundColor: UI.colors.modalCard,
    borderRadius: UI.radius.card,
    padding: UI.spacing.cardPad,
    borderWidth: UI.border.thin,
    borderColor: UI.colors.modalBorder,
  },
  
  /*modalTitle: { color: UI.colors.text, fontSize: UI.type.cardTitle, fontWeight: "900", marginBottom: 10 },
  modalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: UI.spacing.gapSm },
  modalLabel: { color: UI.colors.textDim, fontWeight: "800" },
  modalValue: { color: UI.colors.text, fontWeight: "800", maxWidth: "70%", textAlign: "right" },
  modalSectionTitle: { color: UI.colors.text, fontWeight: "900", marginBottom: 6 },
  modalBody: { color: "rgba(255,255,255,0.85)", lineHeight: 20 },*/


});
