// app/(tabs)/index.tsx
// DROP-IN REPLACEMENT — Home (Option 4C)
// Goals:
// - Ring stays, but smaller + quieter (no status/description/reset noise)
// - Today Focus becomes a single action-first strip (Alignment + Watchout + Budget + Window)
// - “Best Next Meal” remains the ONE decision block (primary emphasized)
// - Cook option opens a modal with dynamic steps (from executionPlan.cookPlan if present)
// - Insights explains “why” with “So far: X/Y …” (zero-patience default)

import React, { useEffect, useMemo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
  Modal,
  Platform,
  Alert,
} from "react-native";
import { useFocusEffect, router } from "expo-router";

import { UI } from "../../src/theme/ui";
import { useMe } from "../../src/hooks/useMe";
import { useHomeSummary } from "../../src/hooks/use-home-summary";
import type { HomeWindow, HomeSummaryResponse } from "../../src/api/home";
import type { MeResponse } from "../../src/api/me";

import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { PrimaryButton } from "../../components/ui/PrimaryButton";
import { Chip } from "../../components/ui/Chip";
import { Ring } from "../../components/ui/Ring";

// DEV ONLY
import { DevStatusCard } from "../../components/dev/DevStatusCard";
import { useModeGate } from "../../src/hooks/use-mode-gate";
import type { HomeSummary } from "../../src/contracts/home";
import { acceptDailyContract, adjustDailyContract } from "../../src/api/home";

const WINDOW_ORDER: HomeWindow[] = ["daily", "3d", "7d", "14d"];
function nextWindow(w: HomeWindow): HomeWindow {
  const idx = WINDOW_ORDER.indexOf(w);
  return WINDOW_ORDER[(idx + 1) % WINDOW_ORDER.length];
}

// once-per-session flag (module scope)
let homeRingAnimatedOnce = false;

type ConfidenceTier = "high" | "medium" | "low";
type Tone = "straight" | "encouraging" | "coach";
type RiskLevel = "low" | "medium" | "high";

function tierFromConfidence(conf: number | null | undefined): ConfidenceTier {
  const c = typeof conf === "number" ? conf : 0;
  if (c >= 0.75) return "high";
  if (c >= 0.45) return "medium";
  return "low";
}

function safeTone(me: MeResponse | null | undefined): Tone {
  const t =
    me?.preferences?.aiPersonality ??
    me?.profile?.preferences?.aiPersonality ??
    (me as any)?.aiPersonality ??
    "straight";
  return t === "encouraging" || t === "coach" ? t : "straight";
}

function copy(tone: Tone) {
  const base = {
    confidenceHint: {
      high: "Strong pick",
      medium: "Two good paths",
      low: "Let’s narrow it down",
    },
    focus: {
      title: "Today Focus",
      subtitle: "At a glance",
    },
    best: {
      title: "Best Next Meal",
      ctaEatout: "Find nearby",
      ctaCook: "How to cook",
    },
    insight: {
      title: "Insights",
      show: "Show",
      hide: "Hide",
    },
    micro: {
      updated: (min: number) => (min <= 1 ? "Updated just now" : `Updated ${min} min ago`),
    },
    recovery: {
      lowScore: "Keep it simple — one strong choice is enough.",
    },
  };

  if (tone === "encouraging") {
    return {
      ...base,
      recovery: { lowScore: "All good — one solid choice helps today." },
      confidenceHint: { high: "Feeling confident", medium: "Two good options", low: "Let’s explore" },
    };
  }

  if (tone === "coach") {
    return {
      ...base,
      recovery: { lowScore: "Execute one clean choice." },
      confidenceHint: { high: "High confidence", medium: "Medium confidence", low: "Low confidence" },
    };
  }

  return base;
}

function goEatOut(searchKey?: string) {
  router.push({
    pathname: "/(tabs)/eat-out",
    params: searchKey ? { searchKey } : {},
  });
}

function getUserCuisines(me: MeResponse | null | undefined): string[] {
  const cuisines = me?.preferences?.cuisines ?? me?.profile?.preferences?.cuisines ?? [];
  return Array.isArray(cuisines) ? cuisines.filter(Boolean).map(String) : [];
}

function minutesSince(iso?: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const diffMs = Date.now() - t;
  if (diffMs < 0) return 0;
  return Math.floor(diffMs / 60000);
}

type DishOptionView = {
  kind: "eatout" | "home";
  title: string;
  why?: string[];
  searchKey?: string | null;
};

function deriveOptionsFromHome(home: HomeSummaryResponse | null): {
  tier: ConfidenceTier;
  options: DishOptionView[];
  insights?: string[];
} {
  const anyHome = home as any;
  const s = anyHome?.suggestion ?? null;
  const plan = s?.executionPlan ?? null;

  // Preferred path: macro-gap executionPlan with primaryOption / secondaryOption
  if (plan?.primaryOption) {
    const conf = plan?.meta?.confidence;
    const tier = tierFromConfidence(typeof conf === "number" ? conf : (s as any)?.confidence);

    const primary = plan.primaryOption;
    const secondary = plan.secondaryOption ?? null;

    const toView = (opt: any): DishOptionView => ({
      kind: opt?.executionHints?.channel === "home" ? "home" : "eatout",
      title: String(opt?.title ?? "Option"),
      why: opt?.why ? [String(opt.why)].slice(0, 2) : [],
      searchKey: opt?.executionHints?.searchKey ?? null,
    });

    const options: DishOptionView[] = [toView(primary)];
    if (secondary) options.push(toView(secondary));

    const insights = Array.isArray(plan?.microSteps)
      ? plan.microSteps.slice(0, 2).map(String)
      : s?.contextNote
        ? [String(s.contextNote)]
        : undefined;

    return { tier, options: options.slice(0, 2), insights };
  }

  // Legacy fallback
  const tier = tierFromConfidence((s as any)?.confidence);
  const key =
    (s as any)?.route?.searchKey ??
    (Array.isArray((s as any)?.dishIdeas) && (s as any)?.dishIdeas?.[0]?.query) ??
    null;

  const options: DishOptionView[] = [
    { kind: "eatout", title: "Restaurant pick nearby", why: [], searchKey: key },
    { kind: "home", title: "Simple home plate", why: [] },
  ];

  const insights = (s as any)?.contextNote ? [String((s as any).contextNote)] : undefined;
  return { tier, options: options.slice(0, 2), insights };
}

function cap(v: unknown, n: number) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function pickTopWatchout(mgSummary: any): { label: string; valueText: string } | null {
  const sugar: RiskLevel | null =
    mgSummary?.sugarRisk === "high" || mgSummary?.sugarRisk === "medium" || mgSummary?.sugarRisk === "low"
      ? mgSummary.sugarRisk
      : null;
  const sodium: RiskLevel | null =
    mgSummary?.sodiumRisk === "high" || mgSummary?.sodiumRisk === "medium" || mgSummary?.sodiumRisk === "low"
      ? mgSummary.sodiumRisk
      : null;

  const sev = (r: RiskLevel | null) => (r === "high" ? 3 : r === "medium" ? 2 : r === "low" ? 1 : 0);
  const sugarSev = sev(sugar);
  const sodiumSev = sev(sodium);

  if (sugarSev === 0 && sodiumSev === 0) return null;

  if (sugarSev >= sodiumSev) {
    return { label: "Sugar", valueText: `${String(sugar).toUpperCase()}` };
  }
  return { label: "Sodium", valueText: `${String(sodium).toUpperCase()}` };
}

function titleCase(s: string) {
  const t = String(s ?? "");
  if (!t) return "";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function buildFocusStrip(home: HomeSummaryResponse | null): { strip: string; hasAny: boolean } {
  const anyHome = home as any;
  const mgSummary = anyHome?.suggestion?.intent?.context?.macroGap?.summary ?? null;
  const tw = anyHome?.suggestion?.intent?.context?.timeWindow ?? null;

  const parts: string[] = [];

  // Alignment (Protein then Fiber)
  const pg = typeof mgSummary?.proteinGap_g === "number" ? mgSummary.proteinGap_g : null;
  const fg = typeof mgSummary?.fiberGap_g === "number" ? mgSummary.fiberGap_g : null;

  if (pg != null && pg >= 10) parts.push(`Protein +${Math.round(pg)}g`);
  else if (fg != null && fg >= 4) parts.push(`Fiber +${Math.round(fg)}g`);

  // Watchout (top only)
  const top = pickTopWatchout(mgSummary);
  if (top) parts.push(`${top.label}: ${top.valueText}`);

  // Budget
  const calLeft = typeof mgSummary?.caloriesRemaining === "number" ? mgSummary.caloriesRemaining : null;
  if (calLeft != null && Number.isFinite(calLeft)) parts.push(`Cal left: ${Math.round(calLeft)}`);

  // Window
  if (tw) parts.push(`${titleCase(String(tw))}`);

  const strip = parts.join("  |  ");
  return { strip, hasAny: parts.length > 0 };
}

function buildSoFarLine(home: HomeSummaryResponse | null): string | null {
  const anyHome = home as any;
  const mg = anyHome?.suggestion?.intent?.context?.macroGap ?? null;
  const consumed = mg?.consumed ?? null;
  const targets = mg?.targets ?? null;
  if (!consumed || !targets) return null;

  const p = `${Math.round(consumed.protein_g ?? 0)}/${Math.round(targets.protein_g ?? 0)}g`;
  const s = `${Math.round(consumed.sugar_g ?? 0)}/${Math.round(targets.sugar_g_max ?? 0)}g`;
  const na = `${Math.round(consumed.sodium_mg ?? 0)}/${Math.round(targets.sodium_mg_max ?? 0)}mg`;
  const cal = `${Math.round(consumed.calories ?? 0)}/${Math.round(targets.calories ?? 0)}`;

  return `So far: Protein ${p}, Sugar ${s}, Sodium ${na}, Calories ${cal}`;
}

export default function HomeScreen() {
  const { mode } = useModeGate();
  const isPrivacy = mode === "privacy";

  const { data: me, isLoading: meLoading, isError: meIsError } = useMe();
  const backendOk = !!me && !meIsError;

  const [window, setWindow] = useState<HomeWindow>("daily");
  const { data: home, refetch } = useHomeSummary(window, 5);
  const [contractAdjustOpen, setContractAdjustOpen] = useState(false);
  const [contractOpen, setContractOpen] = useState(false);

  useEffect(() => {
    // reset when day changes / new contract id arrives
    if (home?.dailyContract?.id) setContractOpen(false);
  }, [home?.dailyContract?.id]);


  const [localContractStatus, setLocalContractStatus] =
    useState<"draft" | "active" | "completed" | "failed" | "expired" | null>(null);

  useEffect(() => {
    setLocalContractStatus(null); // reset when new contract arrives
  }, [home?.dailyContract?.id]);


  const contractStatus =
    localContractStatus ?? home?.dailyContract?.status ?? "draft";


  const onAcceptContract = async () => {
    if (!home?.dailyContract?.id) return;

    try {
      await acceptDailyContract(); // POST /home/daily-contract/accept
      await refetch(); // CRITICAL
      console.log("After accept", home?.dailyContract);
    } catch (e) {
      console.warn("Accept failed", e);
    }
  };


  const onAdjustContract = async () => {
    setContractAdjustOpen(true);
    // when user hits Save: await adjustDailyContract(...); refetch();
  };






  useFocusEffect(
    React.useCallback(() => {
      if (!isPrivacy) refetch?.();
    }, [refetch, isPrivacy, window])
  );

  // animate ring only once per app session
  const [animateRing, setAnimateRing] = useState(() => !homeRingAnimatedOnce);
  useEffect(() => {
    if (!homeRingAnimatedOnce) {
      homeRingAnimatedOnce = true;
      setAnimateRing(true);
    } else {
      setAnimateRing(false);
    }
  }, []);

  const tone = useMemo(() => safeTone(me), [me]);
  const C = useMemo(() => copy(tone), [tone]);

  const hero = home?.heroScore;
  const modeLabel = home?.header?.modeLabel ?? "Today";

  const updatedMin = useMemo(() => minutesSince(home?.meta?.generatedAt), [home?.meta?.generatedAt]);

  const recentCount = home?.recentLogs?.items?.length ?? 0;
  const hasLogs = recentCount > 0;
  const scoreValue = hero?.value ?? 0;
  const isLowScoreDay = hasLogs && scoreValue > 0 && scoreValue < 55;

  const derived = useMemo(() => deriveOptionsFromHome(home), [home]);
  const confidenceTier = derived.tier;

  // Low confidence cuisine chips (inline, only when low)
  const cuisineChips = useMemo(() => Array.from(new Set(getUserCuisines(me))).slice(0, 6), [me]);
  const [selectedCuisine, setSelectedCuisine] = useState<string | null>(null);
  useEffect(() => {
    setSelectedCuisine(null);
  }, [confidenceTier]);

  // Focus strip
  const focusStrip = useMemo(() => buildFocusStrip(home), [home]);

  // Insights (collapsed by default)
  const [insightOpen, setInsightOpen] = useState(false);
  const soFarLine = useMemo(() => buildSoFarLine(home), [home]);

  const insightsText = useMemo(() => {
    const lines: string[] = [];
    if (soFarLine) lines.push(soFarLine);

    // Prefer plan microSteps / derived insights
    if (derived.insights?.length) lines.push(...derived.insights);

    // Add pick line if we have it (keeps it CEO-level explicit)
    const pick = derived.options?.[0]?.title ? `Pick: "${derived.options[0].title}".` : "";
    if (pick) lines.push(pick);

    return lines.filter(Boolean).slice(0, 2);
  }, [soFarLine, derived.insights, derived.options]);

  // Cook modal
  const [cookOpen, setCookOpen] = useState(false);
  const plan = (home as any)?.suggestion?.executionPlan ?? null;

  const cookSteps = useMemo((): string[] => {
    const prepModules = plan?.cookPlan?.prepModules;
    if (Array.isArray(prepModules) && prepModules.length) {
      return prepModules.slice(0, 10).map((m: any) => {
        const temp = typeof m.temperatureC === "number" ? ` @ ${m.temperatureC}°C` : "";
        const time = typeof m.timeMinutes === "number" ? ` • ${m.timeMinutes} min` : "";
        const step = typeof m.step === "number" ? m.step : null;
        const prefix = step != null ? `${step}. ` : "";
        return `${prefix}${String(m.action ?? "Step")}${temp}${time}`.trim();
      });
    }

    if (Array.isArray(plan?.microSteps) && plan.microSteps.length) {
      return plan.microSteps.slice(0, 10).map((s: unknown, i: number) => `${i + 1}. ${String(s)}`);
    }

    return ["1. Choose lean protein + vegetable base", "2. Keep sauces minimal", "3. Assemble and log after"];
  }, [plan]);

  const cookMeta = useMemo(() => {
    const cp = plan?.cookPlan ?? null;
    const mins = typeof cp?.totalMinutes === "number" ? cp.totalMinutes : 12;
    const ingCount = Array.isArray(cp?.quantities) ? cp.quantities.length : 6;
    return `${mins} min • ≤ ${Math.min(ingCount, 6)} ingredients`;
  }, [plan]);

  const cookIngredients = useMemo(() => {
    const qs = plan?.cookPlan?.quantities;
    if (!Array.isArray(qs) || !qs.length) return [];
    return qs.slice(0, 6).map((q: any) => {
      const g = typeof q.grams === "number" ? `${Math.round(q.grams)}g` : "";
      const name = String(q.ingredient ?? "").trim();
      const notes = q?.notes ? ` — ${String(q.notes)}` : "";
      return `${name}${g ? ` • ${g}` : ""}${notes}`;
    });
  }, [plan]);

  // Option press handler
  const onPressOption = (opt: DishOptionView) => {
    if (opt.kind === "eatout") {
      const key = selectedCuisine ? selectedCuisine : opt.searchKey ?? undefined;
      goEatOut(key ?? undefined);
      return;
    }
    setCookOpen(true);
  };

  // Ring sizing (shrink 25–30%)
  const ringSize = Math.round((UI.sizes?.ringSize ?? 240) * 0.72);
  const ringStroke = Math.max(10, Math.round((UI.sizes?.ringStroke ?? 18) * 0.78));

  const onTrack = home?.heroScore?.onTrack;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      {/* Header (clean, premium) */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.appTitle}>Voravia</Text>
          <Button title="Logout" variant="ghost" onPress={() => { }} style={styles.logoutBtn} />
        </View>

        <View style={styles.headerMetaRow}>
          <Text style={styles.headerMeta}>{modeLabel}</Text>
          <Text style={styles.headerMetaRight}>
            🔥 {home?.header?.streakDays ?? 0} day streak
          </Text>
        </View>
      </View>

      {/* Score (compact, quiet) */}
      <Card style={styles.heroCard}>
        <Pressable
          onPress={() => setWindow((w) => nextWindow(w))}
          accessibilityRole="button"
          accessibilityLabel="Change score window"
          style={styles.heroPressable}
        >
          <View style={styles.heroInner}>
            <View style={styles.heroTopRow}>
              <Text style={styles.heroLabel}>{hero?.label ?? "Daily Score"}</Text>
              {/*{typeof updatedMin === "number" ? (
                <Text style={styles.heroUpdated}>{C.micro.updated(updatedMin)}</Text>
              ) : (
                <Text style={styles.heroUpdated} />
              )}*/}

              {window === "daily" && onTrack ? (
                <View style={styles.onTrackPill}>
                  <Text style={styles.onTrackText}>Day On track: {onTrack.label}</Text>
                </View>
              ) : null}



            </View>

            <View style={styles.ringWrap}>
              <Ring
                value={hero?.value ?? 0}
                label={null} // keep the ring clean; label is in heroTopRow
                statusWord={null}
                description={null}
                animate={animateRing}
                durationMs={UI.motion?.ringMs ?? 600}
                size={ringSize}
                stroke={ringStroke}
              />
            </View>

            <Text style={styles.onTrackText}>{hero?.statusWord ?? "Start"}</Text>
          </View>



        </Pressable>
      </Card>

      {/* Today Focus — single strip (action-first) */}
      <Card style={styles.focusCard}>
        <View style={styles.focusHeader}>
          <Text style={styles.focusTitle}>{C.focus.title}</Text>
          <Text style={styles.focusSubtitle}>{C.focus.subtitle}</Text>
        </View>

        <Pressable
          onPress={() => setInsightOpen(true)}
          style={styles.focusStripPill}
          accessibilityRole="button"
          accessibilityLabel="Open details"
        >
          <Text numberOfLines={1} ellipsizeMode="tail" style={styles.focusStripText}>
            {focusStrip.hasAny ? cap(focusStrip.strip, 140) : "Log once and I’ll shape today’s focus."}
          </Text>
        </Pressable>
      </Card>



      {/* Today Contract — single strip (action-first) */}
      {home?.dailyContract ? (
        <Card style={styles.contractCard}>
          <Pressable
            onPress={() => setContractOpen((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel="Toggle today contract"
            style={{ width: "100%" }}
          >
            <View style={styles.contractHeaderRow}>
              <Text style={styles.contractTitle}>Today’s Contract</Text>

              <View style={styles.contractHeaderRight}>
                <View style={styles.contractStatusPill}>
                  <Text style={styles.contractStatusText}>
                    {home.dailyContract.status === "completed"
                      ? "Done"
                      : home.dailyContract.status === "active"
                        ? "Locked"
                        : "Draft"}
                  </Text>
                </View>

                <Text style={styles.contractChevron}>{contractOpen ? "▾" : "▸"}</Text>
              </View>
            </View>

            {/* Collapsed one-line summary (always shown) */}
            <Text style={styles.contractSummary} numberOfLines={1}>
              <Text style={styles.contractSummaryStrong}>{home.dailyContract.title}</Text>
              {" — "}
              {home.dailyContract.metric?.unit === "g"
                ? `+${Math.round(home.dailyContract.metric?.target ?? 0)}g today`
                : home.dailyContract.statement ?? "Execute one clean decision."}
              {"  •  "}
              {Math.round(home.dailyContract.progress?.current ?? 0)}/
              {Math.round(home.dailyContract.progress?.target ?? 0)}
              {home.dailyContract.metric?.unit ?? ""}
            </Text>
          </Pressable>

          {/* Expanded */}
          {contractOpen ? (
            <View style={{ marginTop: 10 }}>
              <Text style={styles.contractStatement} numberOfLines={1}>
                {home.dailyContract.statement ?? "Execute one clean decision."}
              </Text>

              <Text style={styles.contractProgressText}>
                {Math.round(home.dailyContract.progress?.current ?? 0)} /{" "}
                {Math.round(home.dailyContract.progress?.target ?? 0)}
                {home.dailyContract.metric?.unit ?? ""}
              </Text>

              <View style={styles.contractCtaRow}>


                <View style={styles.contractCtaRow}>
                  {contractStatus === "draft" && (
                    <>
                      <Pressable
                        onPress={onAcceptContract}
                        style={styles.contractAcceptBtn}
                      >
                        <Text style={styles.contractAcceptBtnText}>Accept</Text>
                      </Pressable>

                      <Pressable
                        onPress={onAdjustContract}
                        style={styles.contractAdjustBtn}
                      >
                        <Text style={styles.contractAdjustBtnText}>Adjust</Text>
                      </Pressable>
                    </>
                  )}

                  {contractStatus === "active" && (
                    <View style={styles.contractLockedRow}>
                      <Text style={styles.contractLockedText}>
                        Committed for today
                      </Text>
                    </View>
                  )}

                  {contractStatus === "completed" && (
                    <View style={styles.contractCompletedRow}>
                      <Text style={styles.contractCompletedText}>
                        Completed
                      </Text>
                    </View>
                  )}
                </View>




                <Pressable onPress={onAdjustContract} style={styles.contractAdjustBtn}>
                  <Text style={styles.contractAdjustBtnText}>Adjust</Text>
                </Pressable>


              </View>
            </View>
          ) : null}
        </Card>
      ) : null}







      {/* Best Next Meal — the ONE decision block */}
      <Card style={styles.bestCard}>
        <View style={styles.bestHeader}>
          <Text style={styles.bestTitle}>{C.best.title}</Text>
          <View style={styles.confPill}>
            <Text style={styles.confPillText}>{C.confidenceHint[confidenceTier]}</Text>
          </View>
        </View>

        {isLowScoreDay ? <Text style={styles.recoveryText}>{C.recovery.lowScore}</Text> : null}

        {/* Low confidence: cuisine chips */}
        {confidenceTier === "low" && cuisineChips.length ? (
          <View style={styles.inlineChipsWrap}>
            {cuisineChips.map((c) => {
              const active = selectedCuisine === c;
              return (
                <Chip
                  key={c}
                  label={c}
                  onPress={() => setSelectedCuisine((prev) => (prev === c ? null : c))}
                  style={active ? styles.inlineChipActive : undefined}
                />
              );
            })}
          </View>
        ) : null}

        <View style={styles.optionList}>
          {derived.options.map((opt, idx) => {
            const isPrimary = idx === 0;
            const why = Array.isArray(opt.why) ? opt.why.slice(0, 1) : []; // 1 line max (CEO clean)

            return (
              <View key={`${opt.kind}-${idx}`} style={[styles.optionCard, isPrimary ? styles.optionCardPrimary : null]}>
                <View style={styles.optionTopRow}>
                  <Text style={[styles.optionTitle, isPrimary ? styles.optionTitlePrimary : null]}>
                    {opt.title}
                  </Text>
                  <Text style={styles.optionKind}>{opt.kind === "eatout" ? "Eat out" : "Home"}</Text>
                </View>

                {why.length ? (
                  <Text style={styles.whyText} numberOfLines={2}>
                    • {why[0]}
                  </Text>
                ) : null}

                <View style={styles.optionCtaRow}>
                  {isPrimary ? (
                    <PrimaryButton
                      title={opt.kind === "eatout" ? C.best.ctaEatout : C.best.ctaCook}
                      subtitle={null}
                      onPress={() => onPressOption(opt)}
                    />
                  ) : (
                    <Button
                      title={opt.kind === "eatout" ? C.best.ctaEatout : C.best.ctaCook}
                      onPress={() => onPressOption(opt)}
                      style={styles.secondaryBtn}
                    />
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </Card>

      {/* Insights (collapsed by default) */}
      {hasLogs && insightsText.length ? (
        <Card style={styles.insightCard}>
          <Pressable onPress={() => setInsightOpen((v) => !v)} style={styles.insightHeader}>
            <Text style={styles.insightTitle}>{C.insight.title}</Text>
            <Text style={styles.insightToggle}>{insightOpen ? C.insight.hide : C.insight.show}</Text>
          </Pressable>

          {insightOpen ? (
            <View style={{ marginTop: UI.spacing.gapSm }}>
              {insightsText.map((t, i) => (
                <Text key={`ins-${i}`} style={styles.insightText}>
                  {t}
                </Text>
              ))}
            </View>
          ) : null}
        </Card>
      ) : null}

      {/* Cook Plan Sheet */}
      <Modal
        visible={cookOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setCookOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setCookOpen(false)}>
          <View />
        </Pressable>

        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Cook Plan</Text>
            <Pressable onPress={() => setCookOpen(false)} style={styles.sheetClose}>
              <Text style={styles.sheetCloseText}>Close</Text>
            </Pressable>
          </View>

          <Text style={styles.sheetSubtitle}>{cookMeta}</Text>

          {!!cookIngredients.length ? (
            <View style={{ marginTop: 10, gap: 6 }}>
              {cookIngredients.map((x, i) => (
                <Text key={`ing-${i}`} style={styles.sheetLine}>
                  • {x}
                </Text>
              ))}
            </View>
          ) : null}

          <View style={styles.sheetBody}>
            {cookSteps.slice(0, 10).map((s, idx) => (
              <Text key={idx} style={styles.sheetLine}>
                {s}
              </Text>
            ))}
          </View>

          <View style={styles.sheetActionsRow}>
            <Pressable onPress={() => setCookOpen(false)} style={styles.sheetBtnGhost}>
              <Text style={styles.sheetBtnGhostText}>Close</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                // Later: confirm + log
                setCookOpen(false);
              }}
              style={styles.sheetBtnPrimary}
            >
              <Text style={styles.sheetBtnPrimaryText}>Confirm</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Adjust Contract Sheet */}
      <Modal
        visible={contractAdjustOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setContractAdjustOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setContractAdjustOpen(false)}>
          <View />
        </Pressable>

        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Adjust Contract</Text>
            <Pressable onPress={() => setContractAdjustOpen(false)} style={styles.sheetClose}>
              <Text style={styles.sheetCloseText}>Close</Text>
            </Pressable>
          </View>

          <Text style={styles.sheetSubtitle}>
            Small changes only (keeps the plan stable)
          </Text>

          <View style={{ marginTop: 14, gap: 10 }}>
            <Text style={styles.sheetLine}>• Target: ±20% (coming next)</Text>
            <Text style={styles.sheetLine}>• Lock cuisine (coming next)</Text>
            <Text style={styles.sheetLine}>• Swap protein ↔ fiber (coming next)</Text>
          </View>

          <View style={styles.sheetActionsRow}>
            <Pressable onPress={() => setContractAdjustOpen(false)} style={styles.sheetBtnGhost}>
              <Text style={styles.sheetBtnGhostText}>Cancel</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                // v1: just close
                setContractAdjustOpen(false);
              }}
              style={styles.sheetBtnPrimary}
            >
              <Text style={styles.sheetBtnPrimaryText}>Save</Text>
            </Pressable>
          </View>
        </View>
      </Modal>


      {/* DEV ONLY */}
      {/* {__DEV__ ? (
        <DevStatusCard
          backendOk={isPrivacy ? true : backendOk}
          backendLabel={isPrivacy ? "Disabled (Privacy Mode)" : undefined}
          backendColor={isPrivacy ? UI.colors.textDim : undefined}
          errorText={
            isPrivacy
              ? null
              : meLoading
                ? "Connecting to backend…"
                : backendOk
                  ? null
                  : "Couldn’t reach backend."
          }
          meJson={me ? JSON.stringify(me, null, 2) : null}
        />
      ) : null}*/}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: UI.colors.bg },
  container: {
    paddingHorizontal: UI.spacing.page,
    paddingTop: UI.spacing.page,
    paddingBottom: UI.spacing.page,
  },

  header: { paddingTop: UI.spacing.gapSm },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  appTitle: { fontSize: UI.type.title, fontWeight: "600", color: UI.colors.text },
  logoutBtn: { paddingHorizontal: UI.spacing.btnX },

  headerMetaRow: {
    marginTop: UI.spacing.textGapSm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerMeta: { fontSize: UI.type.caption, color: UI.colors.textMuted },
  headerMetaRight: { fontSize: UI.type.caption, fontWeight: "500", color: UI.colors.textMuted },

  // HERO (compact)
  heroCard: {
    borderRadius: UI.radius.hero,
    padding: UI.spacing.cardPad,
    marginTop: UI.spacing.sectionGap,
  },
  heroPressable: { width: "100%" },
  heroInner: { alignItems: "center" },

  heroTopRow: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    paddingHorizontal: 2,
  },
  heroLabel: { fontSize: UI.type.caption, color: UI.colors.textMuted, fontWeight: "700" },
  heroUpdated: { fontSize: UI.type.caption, color: UI.colors.textMuted, fontWeight: "600" },

  ringWrap: {
    marginTop: 8,
    marginBottom: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  heroStatus: {
    marginTop: 2,
    fontSize: 15,
    fontWeight: "700",
    color: UI.colors.text,
  },
  onTrackPill: {
    marginTop: 6,
    alignSelf: "center",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: UI.radius.inner,
    backgroundColor: UI.colors.homeCards?.focusChipBg ?? "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: UI.colors.homeCards?.focusChipBorder ?? "rgba(255,255,255,0.12)",
  },
  onTrackText: { fontSize: UI.type.caption, fontWeight: "700", color: UI.colors.textMuted },

  // Today Focus strip
  focusCard: {
    marginTop: UI.spacing.sectionGap,
    padding: UI.spacing.cardPad,
    borderRadius: UI.radius.card,
    backgroundColor: UI.colors.homeCards.focusBg,
    borderWidth: 1,
    borderColor: UI.colors.homeCards.focusBorder,
  },
  focusHeader: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  focusTitle: { fontSize: UI.type.section, fontWeight: "800", color: UI.colors.text },
  focusSubtitle: { fontSize: UI.type.caption, color: UI.colors.textMuted, fontWeight: "600" },

  focusStripPill: {
    marginTop: UI.spacing.gapSm,
    borderRadius: UI.radius.inner,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: UI.colors.homeCards.focusChipBg,
    borderWidth: 1,
    borderColor: UI.colors.homeCards.focusChipBorder,
  },
  focusStripText: { fontSize: UI.type.caption, color: UI.colors.textDim, fontWeight: "700" },

  // Best Next Meal
  bestCard: {
    marginTop: UI.spacing.sectionGap + 4, // a touch more breathing room
    padding: UI.spacing.cardPad,
    borderRadius: UI.radius.card,
    backgroundColor: UI.colors.homeCards.suggestBg,
    borderWidth: 1,
    borderColor: UI.colors.homeCards.suggestBorder,
  },
  bestHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  bestTitle: { fontSize: UI.type.section, fontWeight: "900", color: UI.colors.text },

  confPill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: UI.radius.pill,
    backgroundColor: UI.colors.ai.pillBg,
    borderWidth: 1,
    borderColor: UI.colors.ai.pillBorder,
  },
  confPillText: { fontSize: UI.type.caption, color: UI.colors.ai.pillText, fontWeight: "800" },

  recoveryText: { marginTop: UI.spacing.gapSm, fontSize: UI.type.caption, color: UI.colors.textMuted },

  inlineChipsWrap: { marginTop: UI.spacing.gapSm, flexDirection: "row", flexWrap: "wrap", gap: UI.spacing.gapSm },
  inlineChipActive: { borderColor: UI.colors.primary.teal },

  optionList: { marginTop: UI.spacing.sectionGap, gap: UI.spacing.gapSm },
  optionCard: {
    borderRadius: UI.radius.card,
    backgroundColor: UI.colors.surface,
    borderWidth: 1,
    borderColor: UI.colors.outline,
    padding: UI.spacing.cardPad,
  },
  optionCardPrimary: {
    borderColor: UI.colors.ai.pillBorder,
  },
  optionTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  optionTitle: { fontSize: UI.type.rowTitle, fontWeight: "900", color: UI.colors.text, flex: 1, paddingRight: 10 },
  optionTitlePrimary: { fontSize: UI.type.rowTitle + 1 },
  optionKind: { fontSize: UI.type.caption, color: UI.colors.textMuted, fontWeight: "800" },
  whyText: { marginTop: 8, fontSize: UI.type.caption, color: UI.colors.textDim },
  optionCtaRow: { marginTop: UI.spacing.sectionGap },
  secondaryBtn: { minHeight: UI.sizes.buttonH },

  // Insights
  insightCard: { marginTop: UI.spacing.sectionGap, padding: UI.spacing.cardPad, borderRadius: UI.radius.card },
  insightHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  insightTitle: { fontSize: UI.type.section, fontWeight: "800", color: UI.colors.text },
  insightToggle: { fontSize: UI.type.caption, color: UI.colors.textMuted, fontWeight: "800" },
  insightText: { fontSize: UI.type.section, color: UI.colors.textDim },

  // Modal / sheet
  modalBackdrop: {
    flex: 1,
    backgroundColor: UI.colors.modalBackdrop,
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: UI.colors.modalCard,
    borderTopLeftRadius: UI.radius.hero,
    borderTopRightRadius: UI.radius.hero,
    borderWidth: 1,
    borderColor: UI.colors.modalBorder,
    padding: UI.spacing.cardPadLg,
    paddingBottom: Platform.OS === "ios" ? 22 : UI.spacing.cardPadLg,
  },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sheetTitle: { fontSize: UI.type.cardTitle, fontWeight: "900", color: UI.colors.text },
  sheetClose: { paddingVertical: 8, paddingHorizontal: 10 },
  sheetCloseText: { fontSize: UI.type.caption, color: UI.colors.textMuted, fontWeight: "900" },
  sheetSubtitle: { marginTop: 2, fontSize: UI.type.caption, color: UI.colors.textMuted, fontWeight: "800" },
  sheetBody: { marginTop: UI.spacing.sectionGap, gap: 8 },
  sheetLine: { fontSize: UI.type.md, color: UI.colors.textDim, lineHeight: UI.type.lineHeightMd },

  sheetActionsRow: { flexDirection: "row", gap: 12, marginTop: 16 },
  sheetBtnGhost: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: UI.colors.outlineStrong,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: UI.colors.btnBg,
  },
  sheetBtnGhostText: { color: UI.colors.text, fontWeight: "800" },
  sheetBtnPrimary: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(111,174,217,0.18)",
    borderWidth: 1,
    borderColor: "rgba(111,174,217,0.35)",
  },
  sheetBtnPrimaryText: { color: UI.colors.text, fontWeight: "900" },




  contractCard: {
    marginTop: UI.spacing.sectionGap,
    padding: UI.spacing.cardPad,
    borderRadius: UI.radius.card,
    backgroundColor: UI.colors.homeCards.suggestBg,
    borderWidth: 1,
    borderColor: UI.colors.homeCards.suggestBorder,
  },

  contractHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  contractTitle: {
    fontSize: UI.type.section,     // same as Best Next Meal title size family
    fontWeight: "900",
    color: UI.colors.text,
  },

  contractHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  contractChevron: {
    fontSize: UI.type.caption,
    color: UI.colors.textMuted,
    fontWeight: "900",
  },

  contractStatusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: UI.colors.ai.pillBg,
    borderWidth: 1,
    borderColor: UI.colors.ai.pillBorder,
  },

  contractStatusText: {
    fontSize: UI.type.caption,
    fontWeight: "800",
    color: UI.colors.ai.pillText,
  },

  contractSummary: {
    marginTop: 10,
    fontSize: UI.type.caption,     // KEY: keep it in the “strip text” size
    color: UI.colors.textDim,
    fontWeight: "800",
  },

  contractSummaryStrong: {
    color: UI.colors.text,
    fontWeight: "900",
  },

  contractStatement: {
    fontSize: UI.type.caption,     // keep it compact
    color: UI.colors.textDim,
    fontWeight: "800",
  },

  contractProgressText: {
    marginTop: 6,
    fontSize: UI.type.caption,
    color: UI.colors.textMuted,
    fontWeight: "800",
  },

  contractCtaRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
    alignItems: "center",
    justifyContent: "space-between",
  },

  contractAcceptBtn: {
    flex: 1,
    height: 44,
    borderRadius: UI.radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: UI.colors.ai.pillBg,     // theme-consistent
    borderWidth: 1,
    borderColor: UI.colors.ai.pillBorder,
  },

  contractAcceptBtnText: {
    color: UI.colors.ai.pillText,
    fontWeight: "900",
  },

  contractAdjustBtn: {
    flex: 1,
    height: 44,
    borderRadius: UI.radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: UI.colors.btnBg,
    borderWidth: 1,
    borderColor: UI.colors.btnBorder,
  },

  contractAdjustBtnText: {
    color: UI.colors.btnText,
    fontWeight: "900",
  },


  contractStatementStrong: {
    fontWeight: "900",
  },

  contractLockedRow: {
    flex: 1,
    height: 46,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: UI.colors.outlineStrong,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: UI.colors.btnBg,
    opacity: 0.75,
  },
  contractLockedText: {
    fontSize: UI.type.caption,
    fontWeight: "800",
    color: UI.colors.textMuted,
  },

  contractCompletedRow: {
    flex: 1,
    height: 46,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: UI.colors.ai.pillBorder,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: UI.colors.ai.pillBg,
  },
  
  contractCompletedText: {
    fontSize: UI.type.caption,
    fontWeight: "800",
    color: UI.colors.ai.pillText,
  },
  


});
