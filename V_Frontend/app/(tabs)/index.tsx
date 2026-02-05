import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { UI } from "../../src/theme/ui";
import { useMe } from "../../src/hooks/useMe";
import { useHomeSummary } from "../../src/hooks/use-home-summary";
import type { HomeWindow } from "../../src/api/home";

import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { PrimaryButton } from "../../components/ui/PrimaryButton";
import { Chip } from "../../components/ui/Chip";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { Ring } from "../../components/ui/Ring";
import { Pressable } from "react-native";


// DEV ONLY
import { DevStatusCard } from "../../components/dev/DevStatusCard";
import { useModeGate } from "../../src/hooks/use-mode-gate";

// once-per-session flag (module scope)
let homeRingAnimatedOnce = false;

const WINDOW_ORDER: HomeWindow[] = ["daily", "3d", "7d", "14d"];

function nextWindow(w: HomeWindow): HomeWindow {
  const idx = WINDOW_ORDER.indexOf(w);
  return WINDOW_ORDER[(idx + 1) % WINDOW_ORDER.length];
}


function formatTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function HomeScreen() {
  const { mode } = useModeGate();
const isPrivacy = mode === "privacy";
  const { data: me, isLoading: meLoading, isError: meIsError, error: meError } = useMe();
  const backendOk = !!me && !meIsError;

  const [window, setWindow] = useState<HomeWindow>("daily");
  const { data: home, loading: homeLoading, error: homeError } = useHomeSummary(window, 5);

  // animate ring only once per app session
  const [animateRing, setAnimateRing] = useState(() => !homeRingAnimatedOnce);
  useEffect(() => {
    if (!homeRingAnimatedOnce) {
      homeRingAnimatedOnce = true;
      // once it has played, future mounts won't animate
      setAnimateRing(true);
    } else {
      setAnimateRing(false);
    }
  }, []);

  const hero = home?.heroScore;
  const focus = home?.todaysFocus;
  const suggestion = home?.suggestion;

  

  const streakText = useMemo(() => {
    const days = home?.header?.streakDays ?? 0;
    return `${days} day`;
  }, [home?.header?.streakDays]);

  const modeLabel = home?.header?.modeLabel ?? "Today";

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
          <Text style={styles.streakPill}>🔥 {streakText} streak</Text>
        </View>
      </View>



      {/* Window selector */}
     {/* <View style={styles.windowRow}>
        {WINDOW_ORDER.map((w) => (
          <Chip key={w} label={w} selected={window === w} onPress={() => setWindow(w)} />
        ))}
      </View> */}

      {/* Hero */}
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
      <Text style={styles.resetsText}>
        {hero?.resetsText ?? "Tap ring to switch window"}
      </Text>
    </View>
  </Pressable>
</Card>


      {/* Primary actions */}
      <View style={styles.actionsRow}>
        <View style={styles.actionCol}>
          <PrimaryButton
            title={home?.actions?.primaryCta?.title ?? "Scan Food"}
            subtitle={home?.actions?.primaryCta?.subtitle ?? null}
            onPress={() => router.push("/(tabs)/scan")}
          />
        </View>

        <View style={styles.actionCol}>
          <Button
            title={home?.actions?.secondaryCta?.title ?? "Find Restaurant"}
            onPress={() => router.push("/scan/menu-scan")}
            style={styles.secondaryBtn}
          />
        </View>
      </View>

      {/* 2-column insights */}
      <View style={styles.gridRow}>
        <View style={styles.gridColLeft}>
          <Card style={styles.gridCard}>
            <SectionHeader title={focus?.title ?? "Today’s Focus"} />
            {focus?.chips?.length ? (
              <View style={styles.chipsWrap}>
                {focus.chips.slice(0, 4).map((c) => (
                  <Chip key={c.key} label={`${c.label} ${c.valueText}`} />
                ))}
              </View>
            ) : (
              <Text style={styles.mutedText}>Log a meal to see today’s focus.</Text>
            )}
          </Card>
        </View>

        <View style={styles.gridColRight}>
          <Card style={styles.gridCard}>
            <SectionHeader title={suggestion?.title ?? "Best next meal"} />
            <Text style={styles.bodyText}>
              {suggestion?.suggestionText ?? "Log 1–2 meals to unlock a recommendation."}
            </Text>
            {!!suggestion?.contextNote && <Text style={styles.contextNote}>{suggestion.contextNote}</Text>}
          </Card>
        </View>
      </View>

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

  windowRow: {
    marginTop: UI.spacing.sectionGap,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: UI.spacing.gapSm,
  },

  heroCard: { borderRadius: UI.radius.hero, padding: UI.spacing.cardPadLg },
  heroPressable: { width: "100%" },
  heroInner: { alignItems: "center" },
  heroLoading: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: UI.sizes.ringSize,
    gap: UI.spacing.gapSm,
  },
  resetsText: { marginTop: UI.spacing.gapSm, fontSize: 11, color: UI.colors.textMuted },

  actionsRow: { marginTop: UI.spacing.sectionGap, flexDirection: "row", gap: UI.spacing.sectionGap },
  actionCol: { flex: 1 },
  secondaryBtn: { minHeight: UI.sizes.buttonH },

  gridRow: { marginTop: UI.spacing.sectionGap, flexDirection: "row", gap: UI.spacing.sectionGap },
  gridColLeft: { flex: 1 },
  gridColRight: { flex: 1 },
  gridCard: { marginTop: 0, padding: UI.spacing.cardPad, borderRadius: UI.radius.card },

  chipsWrap: { marginTop: UI.spacing.gapSm, flexDirection: "row", flexWrap: "wrap", gap: UI.spacing.gapSm },


  bodyText: { marginTop: UI.spacing.gapSm, fontSize: UI.type.section, color: UI.colors.textDim },
  contextNote: { marginTop: UI.spacing.gapSm, fontSize: UI.type.caption, color: UI.colors.textMuted },

  mutedText: { fontSize: UI.type.caption, color: UI.colors.textMuted },
  errorText: { fontSize: UI.type.section, color: UI.colors.text, fontWeight: "600" },
});
