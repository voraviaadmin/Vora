import { useEffect, useMemo, useState} from "react";
import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
  Modal,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect, router } from "expo-router";

import { UI } from "../../src/theme/ui";
import { useMe } from "../../src/hooks/useMe";
import { useHomeSummary } from "../../src/hooks/use-home-summary";
import type { HomeWindow, HomeSummaryResponse } from "../../src/api/home";

import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { PrimaryButton } from "../../components/ui/PrimaryButton";
import { Chip } from "../../components/ui/Chip";
import { Ring } from "../../components/ui/Ring";

// DEV ONLY
import { DevStatusCard } from "../../components/dev/DevStatusCard";
import { useModeGate } from "../../src/hooks/use-mode-gate";
import type { MeResponse } from "../../src/api/me";

// once-per-session flag (module scope)
let homeRingAnimatedOnce = false;

const WINDOW_ORDER: HomeWindow[] = ["daily", "3d", "7d", "14d"];
function nextWindow(w: HomeWindow): HomeWindow {
  const idx = WINDOW_ORDER.indexOf(w);
  return WINDOW_ORDER[(idx + 1) % WINDOW_ORDER.length];
}

type ConfidenceTier = "high" | "medium" | "low";
type Tone = "straight" | "encouraging" | "coach";

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
      medium: "Two good options",
      low: "Let’s narrow it down",
    },
    empty: {
      title: "Best Next Meal",
      subtitle: "Start simple — I’ll adapt as you log.",
    },
    focus: {
      title: "Today Focus",
      subtitle: "Quick signal — not a lecture.",
    },
    best: {
      title: "Best Next Meal",
      ctaEatout: "Find nearby",
      ctaCook: "How to cook",
      cookNote: "Step-by-step plan",
    },
    insight: {
      title: "Insights",
      show: "Show",
      hide: "Hide",
    },
    micro: {
      updated: (min: number) => (min <= 1 ? "Updated just now" : `Updated ${min} min ago`),
      tapRing: "Tap ring to switch window",
    },
    recovery: {
      lowScore: "Keep it simple today — one good choice is enough.",
    },
  };

  if (tone === "encouraging") {
    return {
      ...base,
      recovery: { lowScore: "All good — keep it simple today. One solid choice helps." },
      empty: { ...base.empty, subtitle: "No pressure — start with one choice and I’ll adapt." },
      confidenceHint: { high: "Feeling confident", medium: "A couple good paths", low: "Let’s explore" },
    };
  }

  if (tone === "coach") {
    return {
      ...base,
      recovery: { lowScore: "Keep it clean today — one strong choice." },
      empty: { ...base.empty, subtitle: "Choose one direction and execute." },
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
  const cuisines =
    me?.preferences?.cuisines ??
    me?.profile?.preferences?.cuisines ??
    [];
  return Array.isArray(cuisines) ? cuisines.filter(Boolean) : [];
}

function minutesSince(iso?: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const diffMs = Date.now() - t;
  if (diffMs < 0) return 0;
  return Math.floor(diffMs / 60000);
}

/**
 * Phase 1: support bestNextMeal if backend provides it,
 * else derive minimal options from legacy `suggestion`.
 */
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

  // ✅ NEW preferred path: backend provides executionPlan under suggestion
  const s = anyHome?.suggestion ?? null;
  const plan = s?.executionPlan ?? null;

  if (plan?.primaryOption) {
    const conf = plan?.meta?.confidence;
    const tier = tierFromConfidence(typeof conf === "number" ? conf : (s as any)?.confidence);

    const primary = plan.primaryOption;
    const secondary = plan.secondaryOption ?? null;

    const toView = (opt: any): DishOptionView => ({
      kind: opt?.executionHints?.channel === "home" ? "home" : "eatout",
      title: String(opt?.title ?? "Option"),
      // plan uses one-liner "why" (string). UI expects string[].
      why: opt?.why ? [String(opt.why)].slice(0, 2) : [],
      searchKey: opt?.executionHints?.searchKey ?? null,
    });

    const options: DishOptionView[] = [toView(primary)];
    if (secondary) options.push(toView(secondary));

    // Insights: show 1–2 microSteps when expanded (you already have collapse UI)
    const insights = Array.isArray(plan?.microSteps)
      ? plan.microSteps.slice(0, 2).map(String)
      : s?.contextNote
      ? [String(s.contextNote)]
      : undefined;

    return { tier, options: options.slice(0, tier === "medium" ? 3 : 2), insights };
  }

  // ---- Legacy fallback: suggestion-based (your current behavior)
  const tier = tierFromConfidence((s as any)?.confidence);

  const key =
    (s as any)?.route?.searchKey ??
    (Array.isArray((s as any)?.dishIdeas) && (s as any)?.dishIdeas?.[0]?.query) ??
    null;

  const options: DishOptionView[] = [
    { kind: "eatout", title: "Restaurant pick nearby", why: [], searchKey: key },
    { kind: "home", title: "Simple home plate", why: [] },
  ];

  if (tier === "medium") {
    options.push({ kind: "eatout", title: "Second nearby option", why: [], searchKey: key });
  }

  const insights = (s as any)?.contextNote ? [String((s as any).contextNote)] : undefined;

  return { tier, options: options.slice(0, tier === "medium" ? 3 : 2), insights };
}


export default function HomeScreen() {
  const { mode } = useModeGate();
  const isPrivacy = mode === "privacy";

  const { data: me, isLoading: meLoading, isError: meIsError } = useMe();
  const backendOk = !!me && !meIsError;

  const [window, setWindow] = useState<HomeWindow>("daily");

  const { data: home, refetch } = useHomeSummary(window, 5);

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
  const focus = home?.todaysFocus;

  const recentCount = home?.recentLogs?.items?.length ?? 0;
  const hasLogs = recentCount > 0;

  const scoreValue = hero?.value ?? 0;
  const isLowScoreDay = hasLogs && scoreValue > 0 && scoreValue < 55;

  const modeLabel = home?.header?.modeLabel ?? "Today";

  const updatedMin = useMemo(() => minutesSince(home?.meta?.generatedAt), [home?.meta?.generatedAt]);

  const derived = useMemo(() => deriveOptionsFromHome(home), [home]);
  const confidenceTier = derived.tier;

  // Low confidence cuisine chips (inline, only when low)
  const cuisineChips = useMemo(() => {
    const uniq = Array.from(new Set(getUserCuisines(me))).slice(0, 6);
    return uniq;
  }, [me]);

  const [selectedCuisine, setSelectedCuisine] = useState<string | null>(null);
  useEffect(() => {
    // reset when confidence tier changes
    setSelectedCuisine(null);
  }, [confidenceTier]);

  // Collapsed insight block (always collapsed by default)
  const [insightOpen, setInsightOpen] = useState(false);

  const insightsText = useMemo(() => {
    const lines: string[] = [];

    // Prefer bestNextMeal insights if present
    if (derived.insights?.length) lines.push(...derived.insights);

    // Else: lightweight fallback from focus chips
    if (!lines.length && focus?.chips?.length) {
      const chips = focus.chips.slice(0, 2);
      const a = chips[0] ? `${chips[0].label}: ${chips[0].valueText}` : "";
      const b = chips[1] ? `${chips[1].label}: ${chips[1].valueText}` : "";
      const joined = [a, b].filter(Boolean).join(" • ");
      if (joined) lines.push(joined);
    }

    return lines.slice(0, 2);
  }, [derived.insights, focus?.chips]);

  // Bottom sheet for “How to cook” (Phase 1 placeholder; later wire on-demand endpoint)
  const [cookOpen, setCookOpen] = useState(false);
  const [cookLoading] = useState(false);

  const plan = (home as any)?.suggestion?.executionPlan ?? null;

  const onPressOption = (opt: DishOptionView) => {
    if (opt.kind === "eatout") {
      const key = selectedCuisine ? selectedCuisine : (opt.searchKey ?? undefined);
      goEatOut(key ?? undefined);
      return;
    }
  
    // home
    // Optional: only open if plan has howToCook action (future)
    if (plan?.actions?.howToCook) {
      setCookOpen(true);
    } else {
      setCookOpen(true); // keep current behavior for now
    }
  };
  

  // Today Focus pills: max 3
  const focusChips = useMemo(() => {
    const chips = focus?.chips ?? [];
    return chips.slice(0, 3);
  }, [focus?.chips]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.appTitle}>Voravia</Text>
          <Button title="Logout" variant="ghost" onPress={() => {}} style={styles.logoutBtn} />
        </View>

        <View style={styles.headerMetaRow}>
          <Text style={styles.headerMeta}>{modeLabel}</Text>
          <Text style={styles.streakPill}>🔥 {home?.header?.streakDays ?? 0} day streak</Text>
        </View>
      </View>

      {/* Score Ring */}
      <Card style={styles.heroCard}>
        <Pressable
          onPress={() => setWindow((w) => nextWindow(w))}
          accessibilityRole="button"
          accessibilityLabel="Change score window"
          style={styles.heroPressable}
        >
          <View style={styles.heroInner}>
            <Ring
              value={hero?.value ?? 0}
              label={hero?.label ?? "Daily Score"}
              statusWord={hero?.statusWord ?? "Start"}
              description={hero?.description ?? "Log a meal to build your score."}
              animate={animateRing}
              durationMs={UI.motion?.ringMs ?? 600}
            />
            <View style={styles.ringMetaRow}>
              <Text style={styles.resetsText}>{hero?.resetsText ?? C.micro.tapRing}</Text>
              {typeof updatedMin === "number" ? (
                <Text style={styles.updatedText}>{C.micro.updated(updatedMin)}</Text>
              ) : null}
            </View>
          </View>
        </Pressable>
      </Card>

      {/* Today Focus (informational only) */}
      <Card style={styles.focusCard}>
        <View style={styles.focusHeader}>
          <Text style={styles.focusTitle}>{C.focus.title}</Text>
          <Text style={styles.focusSubtitle}>{C.focus.subtitle}</Text>
        </View>

        {focusChips.length ? (
          <View style={styles.focusChipsWrap}>
            {focusChips.map((ch) => (
              <View key={ch.key} style={styles.focusPill}>
                <Text style={styles.focusPillLabel}>{ch.label}</Text>
                <Text style={styles.focusPillValue}>{ch.valueText}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.mutedText}>
            {hasLogs ? "Your focus will appear as you log." : "Log once and I’ll shape your focus."}
          </Text>
        )}
      </Card>

      {/* Best Next Meal (ONLY decision block) */}
      <Card style={styles.bestCard}>
        <View style={styles.bestHeader}>
          <Text style={styles.bestTitle}>{C.best.title}</Text>
          <View style={styles.confPill}>
            <Text style={styles.confPillText}>{C.confidenceHint[confidenceTier]}</Text>
          </View>
        </View>

        {isLowScoreDay ? <Text style={styles.recoveryText}>{C.recovery.lowScore}</Text> : null}

        {/* Low confidence: inline cuisine chips (optional) */}
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
            const title = opt.title;

            // Keep the UX clean: 2 why bullets max
            const why = Array.isArray(opt.why) ? opt.why.slice(0, 2) : [];

            return (
              <View key={`${opt.kind}-${idx}`} style={styles.optionCard}>
                <View style={styles.optionTopRow}>
                  <Text style={styles.optionTitle}>{title}</Text>
                  <Text style={styles.optionKind}>{opt.kind === "eatout" ? "Eat out" : "Home"}</Text>
                </View>

                {why.length ? (
                  <View style={styles.whyList}>
                    {why.map((w, i) => (
                      <Text key={`${idx}-why-${i}`} style={styles.whyText}>
                        • {w}
                      </Text>
                    ))}
                  </View>
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

      {/* Insights (collapsed by default, max 2 lines when open) */}
      {hasLogs && insightsText.length ? (
        <Card style={styles.insightCard}>
          <Pressable onPress={() => setInsightOpen((v) => !v)} style={styles.insightHeader}>
            <Text style={styles.insightTitle}>{C.insight.title}</Text>
            <Text style={styles.insightToggle}>{insightOpen ? C.insight.hide : C.insight.show}</Text>
          </Pressable>

          {insightOpen ? (
            <View style={{ marginTop: UI.spacing.gapSm }}>
              {insightsText.slice(0, 2).map((t, i) => (
                <Text key={`ins-${i}`} style={styles.insightText}>
                  {t}
                </Text>
              ))}
            </View>
          ) : null}
        </Card>
      ) : null}

      {/* Bottom sheet: How to cook (Phase 1 placeholder) */}
      <Modal visible={cookOpen} transparent animationType="slide" onRequestClose={() => setCookOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setCookOpen(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{C.best.ctaCook}</Text>
            <Pressable onPress={() => setCookOpen(false)} style={styles.sheetClose}>
              <Text style={styles.sheetCloseText}>Close</Text>
            </Pressable>
          </View>

          {cookLoading ? (
            <View style={styles.sheetBody}>
              <ActivityIndicator />
              <Text style={styles.mutedText}>Building your plan…</Text>
            </View>
          ) : (
            <View style={styles.sheetBody}>
              <Text style={styles.sheetSubtitle}>{C.best.cookNote}</Text>
              <Text style={styles.sheetText}>
                Phase 1: this sheet is wired and ready. Next step is connecting the on-demand ExecutionPlan endpoint
                so this returns ingredients + steps personalized to your profile and last 14 days.
              </Text>

              <View style={{ marginTop: UI.spacing.sectionGap }}>
                <Button title="OK" onPress={() => setCookOpen(false)} />
              </View>
            </View>
          )}
        </View>
      </Modal>

      {/* DEV ONLY */}
      {__DEV__ ? (
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
      ) : null}
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
  streakPill: { fontSize: UI.type.caption, fontWeight: "500", color: UI.colors.textMuted },

  heroCard: { borderRadius: UI.radius.hero, padding: UI.spacing.cardPadLg, marginTop: UI.spacing.sectionGap },
  heroPressable: { width: "100%" },
  heroInner: { alignItems: "center" },
  ringMetaRow: { marginTop: UI.spacing.gapSm, width: "100%", alignItems: "center" },
  resetsText: { fontSize: 11, color: UI.colors.textMuted },
  updatedText: { marginTop: 6, fontSize: 11, color: UI.colors.textMuted },

  // Today Focus
  focusCard: {
    marginTop: UI.spacing.sectionGap,
    padding: UI.spacing.cardPad,
    borderRadius: UI.radius.card,
    backgroundColor: UI.colors.homeCards.focusBg,
    borderWidth: 1,
    borderColor: UI.colors.homeCards.focusBorder,
  },
  focusHeader: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  focusTitle: { fontSize: UI.type.section, fontWeight: "700", color: UI.colors.text },
  focusSubtitle: { fontSize: UI.type.caption, color: UI.colors.textMuted },

  focusChipsWrap: { marginTop: UI.spacing.gapSm, gap: UI.spacing.gapSm },
  focusPill: {
    borderRadius: UI.radius.inner,
    paddingVertical: UI.spacing.pillY,
    paddingHorizontal: UI.spacing.pillX,
    backgroundColor: UI.colors.homeCards.focusChipBg,
    borderWidth: 1,
    borderColor: UI.colors.homeCards.focusChipBorder,
  },
  focusPillLabel: { fontSize: UI.type.caption, color: UI.colors.textMuted, fontWeight: "600" },
  focusPillValue: { marginTop: 2, fontSize: UI.type.section, color: UI.colors.textDim },

  // Best Next Meal
  bestCard: {
    marginTop: UI.spacing.sectionGap,
    padding: UI.spacing.cardPad,
    borderRadius: UI.radius.card,
    backgroundColor: UI.colors.homeCards.suggestBg,
    borderWidth: 1,
    borderColor: UI.colors.homeCards.suggestBorder,
  },
  bestHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  bestTitle: { fontSize: UI.type.section, fontWeight: "800", color: UI.colors.text },
  confPill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: UI.radius.pill,
    backgroundColor: UI.colors.ai.pillBg,
    borderWidth: 1,
    borderColor: UI.colors.ai.pillBorder,
  },
  confPillText: { fontSize: UI.type.caption, color: UI.colors.ai.pillText, fontWeight: "700" },

  recoveryText: { marginTop: UI.spacing.gapSm, fontSize: UI.type.caption, color: UI.colors.textMuted },

  inlineChipsWrap: { marginTop: UI.spacing.gapSm, flexDirection: "row", flexWrap: "wrap", gap: UI.spacing.gapSm },
  inlineChipActive: {
    borderColor: UI.colors.primary.teal,
  },

  optionList: { marginTop: UI.spacing.sectionGap, gap: UI.spacing.gapSm },
  optionCard: {
    borderRadius: UI.radius.card,
    backgroundColor: UI.colors.surface,
    borderWidth: 1,
    borderColor: UI.colors.outline,
    padding: UI.spacing.cardPad,
  },
  optionTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  optionTitle: { fontSize: UI.type.rowTitle, fontWeight: "800", color: UI.colors.text, flex: 1, paddingRight: 10 },
  optionKind: { fontSize: UI.type.caption, color: UI.colors.textMuted, fontWeight: "700" },

  whyList: { marginTop: UI.spacing.gapSm, gap: 4 },
  whyText: { fontSize: UI.type.caption, color: UI.colors.textDim },

  optionCtaRow: { marginTop: UI.spacing.sectionGap },
  secondaryBtn: { minHeight: UI.sizes.buttonH },

  // Insights
  insightCard: { marginTop: UI.spacing.sectionGap, padding: UI.spacing.cardPad, borderRadius: UI.radius.card },
  insightHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  insightTitle: { fontSize: UI.type.section, fontWeight: "700", color: UI.colors.text },
  insightToggle: { fontSize: UI.type.caption, color: UI.colors.textMuted, fontWeight: "700" },
  insightText: { fontSize: UI.type.section, color: UI.colors.textDim },

  mutedText: { fontSize: UI.type.caption, color: UI.colors.textMuted },

  // Modal sheet
  modalBackdrop: { flex: 1, backgroundColor: UI.colors.modalBackdrop },
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
  },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sheetTitle: { fontSize: UI.type.cardTitle, fontWeight: "800", color: UI.colors.text },
  sheetClose: { paddingVertical: 8, paddingHorizontal: 10 },
  sheetCloseText: { fontSize: UI.type.caption, color: UI.colors.textMuted, fontWeight: "800" },

  sheetBody: { marginTop: UI.spacing.sectionGap },
  sheetSubtitle: { fontSize: UI.type.caption, color: UI.colors.textMuted, fontWeight: "700" },
  sheetText: { marginTop: 8, fontSize: UI.type.md, color: UI.colors.textDim, lineHeight: UI.type.lineHeightMd },
});
