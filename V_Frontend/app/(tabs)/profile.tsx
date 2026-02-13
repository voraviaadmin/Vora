import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  TouchableWithoutFeedback,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { apiJson } from "../../src/api/client";
import { UI } from "../../src/theme/ui";
import { useMode } from "../../src/state/mode";
import { toUserMessage } from "../../src/utils/toast-copy";
import { apiPost } from "../../src/api/client";
import { getApiBaseUrl } from "../../src/api/base";

console.log("Profile Tab: [boot] api base", getApiBaseUrl());

type ToastKind = "success" | "error";
type ProfileMode = "privacy" | "sync";

type Preferences = {
  health: {
    diabetes: boolean;
    highBP: boolean;
    fattyLiver: boolean;
  };
  goal: "lose" | "maintain" | "gain";
  cuisines: string[];
};

type CuisineCatalogItem = { id: string; label: string; aliases?: string[] };

// Local-only intelligence layer (safe, optional, on-device only)
type GoalIntensity = "light" | "moderate" | "aggressive";
type ActivityLevel = "sedentary" | "moderate" | "active";
type ProteinPreference = "low" | "medium" | "high";
type EatingStyle = "home" | "balanced" | "eatout";
type PortionAppetite = "small" | "average" | "large";

type ProfileIntel = {
  goalIntensity?: GoalIntensity;
  activityLevel?: ActivityLevel;
  proteinPreference?: ProteinPreference;
  carbSensitive?: boolean;
  eatingStyle?: EatingStyle;
  portionAppetite?: PortionAppetite;
  wakeTime?: string; // "07:30"
  mealsPerDay?: 2 | 3 | 4 | 5;
  dinnerTime?: string; // "19:30"
};

const LOCAL_INTEL_KEY = "voravia.profileIntel.v1";

const defaultPrefs: Preferences = {
  health: { diabetes: false, highBP: false, fattyLiver: false },
  goal: "maintain",
  cuisines: [],
};

const defaultIntel: ProfileIntel = {
  goalIntensity: undefined,
  activityLevel: undefined,
  proteinPreference: undefined,
  carbSensitive: undefined,
  eatingStyle: undefined,
  portionAppetite: undefined,
  wakeTime: undefined,
  mealsPerDay: undefined,
  dinnerTime: undefined,
};

function ConfirmModal({
  visible,
  title,
  body,
  confirmText,
  confirmTone,
  onCancel,
  onConfirm,
  busy,
}: {
  visible: boolean;
  title: string;
  body: string;
  confirmText: string;
  confirmTone: "primary" | "danger";
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  busy?: boolean;
}) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <TouchableWithoutFeedback onPress={onCancel}>
        <View style={styles.modalBackdrop}>
          <TouchableWithoutFeedback>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>{title}</Text>
              <Text style={styles.modalBody}>{body}</Text>

              <View style={styles.modalRow}>
                <Pressable style={[styles.btn, styles.btnSecondary]} onPress={onCancel} disabled={busy}>
                  <Text style={styles.btnSecondaryText}>Cancel</Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.btn,
                    confirmTone === "danger" ? styles.btnDangerOutline : styles.btnPrimary,
                    busy ? styles.btnDisabled : null,
                  ]}
                  onPress={onConfirm}
                  disabled={busy}
                >
                  <Text style={confirmTone === "danger" ? styles.btnDangerText : styles.btnPrimaryText}>
                    {busy ? "Working…" : confirmText}
                  </Text>
                </Pressable>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

function ToastInline({ kind, msg }: { kind: ToastKind; msg: string }) {
  return (
    <View style={[styles.toast, kind === "success" ? styles.toastSuccess : styles.toastError]}>
      <Text style={styles.toastText}>{msg}</Text>
    </View>
  );
}

function isTimeLikeHHMM(v?: string) {
  if (!v) return true; // optional
  const s = v.trim();
  if (!/^\d{1,2}:\d{2}$/.test(s)) return false;
  const [hh, mm] = s.split(":").map((x) => parseInt(x, 10));
  if (Number.isNaN(hh) || Number.isNaN(mm)) return false;
  if (hh < 0 || hh > 23) return false;
  if (mm < 0 || mm > 59) return false;
  return true;
}

export default function ProfileTab() {
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState<Preferences>(defaultPrefs);
  const [intel, setIntel] = useState<ProfileIntel>(defaultIntel);

  const [cuisineInput, setCuisineInput] = useState("");
  const [cuisineCatalog, setCuisineCatalog] = useState<CuisineCatalogItem[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);

  // ✅ single authority for mode lives here now:
  const { mode, status, requestEnableSync, requestDisableSync } = useMode();
  const isSync = mode === "sync";
  const modeReady = status === "ready";

  const [toast, setToast] = useState<{ kind: ToastKind; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const [enableBusy, setEnableBusy] = useState(false);
  const [disableBusy, setDisableBusy] = useState(false);

  const [showEnableConfirm, setShowEnableConfirm] = useState(false);
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);

  // Accordion: only one open at a time
  type SectionKey = "goals" | "health" | "taste" | "habits";
  const [open, setOpen] = useState<SectionKey>("goals");

  const copy = useMemo(
    () => ({
      headerTitle: "Profile",
      sub: "Premium, optional preferences. One section at a time.",

      prefsTitle: "Profile preferences",
      prefsSub: "Sync saves to server. Habits are on-device.",

      saveBtn: "Save",

      modeTitle: "Privacy & Sync",
      modeSub: "Choose where your data lives.",
      privacyTitle: "Privacy mode (default)",
      privacyBody: "Everything stays on your device. Scores are generic.",
      privacyBullets: ["All data stays on your device", "No health personalization used", "Generic scoring only"],

      syncTitle: "Sync mode (opt-in)",
      syncBody: "Sync enables cross-device history, personalization, and groups.",
      syncBullets: ["Cross-device history", "Personalization and groups", "Preferences stored for Sync features"],

      enableModalTitle: "Before you turn on Sync",
      enableModalBody:
        "Sync enables personalization, groups, and cross-device history. If you later turn Sync off, your server-stored data is deleted and you will be removed from all groups.",
      disableModalTitle: "Disable Sync?",
      disableModalBody: "This deletes server-stored profile data and removes you from all groups.",

      whatStoreTitle: "What Sync stores",
      whatStoreSub: "Only what’s needed to deliver Sync features:",
      whatStoreBullets: ["Health toggles (optional)", "Your goal (lose / maintain / gain)", "Cuisine preferences"],
      noAgeGender: "We do not store age or gender.",

      syncOffTitle: "Sync is OFF",
      syncOffSub: "Server preferences won’t save. Habits still save on-device.",
      enableSyncBtn: "Enable Sync",

      syncOnTitle: "Sync is ON",
      syncOnSub: "Preferences are stored on server for Sync features.",
      disableSyncBtn: "Disable Sync & Delete Server Data",
      disableNote: "Disabling Sync deletes server-stored data and removes you from all groups.",

      // Sections
      goalsTitle: "Goals",
      healthTitle: "Health",
      tasteTitle: "Taste",
      habitsTitle: "Habits",

      // Labels
      goalLabel: "Primary goal (Sync)",
      goalIntensityLabel: "Goal intensity (on-device)",
      carbLabel: "Carb sensitivity (on-device)",
      cuisinesLabel: "Cuisines (Sync)",
      eatingStyleLabel: "Eating style (on-device)",
      mealsPerDayLabel: "Meals per day (on-device)",
      dinnerTimeLabel: "Typical dinner time (on-device)",
      wakeTimeLabel: "Typical wake time (on-device)",
      activityLabel: "Activity level (on-device)",
      proteinLabel: "Protein preference (on-device)",
      portionLabel: "Portion appetite (on-device)",

      addCuisinePlaceholder: "Type a cuisine…",
      addCuisineBtn: "Add",
      privacyNote: "Sync is required to save server preferences (goal/health/cuisines).",
    }),
    []
  );

  const cuisineSuggestions = useMemo(() => {
    const q = cuisineInput.trim().toLowerCase();
    if (!q) return [];
    const selectedLower = new Set(prefs.cuisines.map((c) => c.toLowerCase()));
    return cuisineCatalog
      .filter((c) => (c.label || "").toLowerCase().includes(q))
      .filter((c) => !selectedLower.has((c.label || "").toLowerCase()))
      .slice(0, 8);
  }, [cuisineInput, cuisineCatalog, prefs.cuisines]);

  const accent = UI.colors.primary.teal; // Profile stays neutral; use teal for active borders/toggles

  // ---------- Local intel storage ----------
  async function loadLocalIntel() {
    try {
      const raw = await AsyncStorage.getItem(LOCAL_INTEL_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as ProfileIntel;
      setIntel((p) => ({ ...p, ...parsed }));
    } catch {
      // ignore; on-device optional
    }
  }

  async function saveLocalIntel(next: ProfileIntel) {
    try {
      await AsyncStorage.setItem(LOCAL_INTEL_KEY, JSON.stringify(next));
    } catch {
      // ignore; still allow app use
    }
  }

  // ---------- Backend prefs load ----------
  async function loadPrefsIfSync() {
    setLoading(true);
    setToast(null);

    // Privacy: do not call backend
    if (!isSync) {
      setLoading(false);
      return;
    }

    try {
      let nextPrefs = defaultPrefs;
      try {
        const prefRes = await apiJson<{ preferences: Preferences | null }>("/v1/profile/preferences");
        nextPrefs = prefRes?.preferences ?? defaultPrefs;
      } catch (e: any) {
        const msg = String(e?.message ?? "");
        if (!msg.includes("Cannot GET /v1/profile/preferences")) throw e;
        // route missing -> keep defaults silently
      }
      setPrefs(nextPrefs);
    } catch (e: any) {
      setToast({ kind: "error", msg: toUserMessage(e) });
    } finally {
      setLoading(false);
    }
  }

  // ---------- Cuisine catalog ----------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiJson<{ data: { cuisines: CuisineCatalogItem[] } }>("/v1/meta/cuisines");
        if (cancelled) return;
        setCuisineCatalog(res.data?.cuisines ?? []);
        setCatalogLoaded(true);
      } catch {
        if (cancelled) return;
        setCuisineCatalog([]);
        setCatalogLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    loadLocalIntel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadPrefsIfSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSync]);

  // ---------- Sync enable/disable ----------
  async function enableSync() {
    setEnableBusy(true);
    setToast(null);

    try {
      await requestEnableSync(async () => {
        await apiPost("/v1/profile/enable-sync", {});
      });

      setShowEnableConfirm(false);
      setToast({ kind: "success", msg: "Sync enabled." });
      await loadPrefsIfSync();
    } catch (e: any) {
      if (e?.name === "AbortError") {
        Alert.alert("Can’t reach server", "Check API base URL / IP, then try again.");
        return;
      }
      Alert.alert("Enable Sync failed", e?.message ?? "Please try again.");
    } finally {
      setEnableBusy(false);
    }
  }

  async function disableSync() {
    setDisableBusy(true);
    setToast(null);
    try {
      await requestDisableSync(async () => {
        await apiJson("/v1/profile/disable-sync", { method: "POST" });
      });

      setShowDisableConfirm(false);
      setToast({ kind: "success", msg: "Sync disabled. Server data deleted." });
      await loadPrefsIfSync();
    } catch (e: any) {
      setToast({ kind: "error", msg: "Couldn’t disable Sync. Please try again." });
    } finally {
      setDisableBusy(false);
    }
  }

  // ---------- Cuisine helpers (NO autosave) ----------
  function addCuisine(rawOverride?: string) {
    if (!isSync) return;
    const raw = (rawOverride ?? cuisineInput).trim();
    if (!raw) return;

    if (prefs.cuisines.some((c) => c.toLowerCase() === raw.toLowerCase())) {
      setCuisineInput("");
      return;
    }

    setPrefs((p) => ({
      ...p,
      cuisines: [...p.cuisines, raw],
    }));
    setCuisineInput("");
  }

  function removeCuisine(c: string) {
    if (!isSync) return;
    setPrefs((p) => ({
      ...p,
      cuisines: p.cuisines.filter((x) => x !== c),
    }));
  }

  // ---------- Backend save (stable contract) with PUT->POST fallback ----------
  async function persistPrefsStable(next: Preferences) {
    // Only in Sync mode
    if (!isSync) return;

    // try PUT first (current behavior)
    try {
      await apiJson("/v1/profile/preferences", {
        method: "PUT",
        body: JSON.stringify({ preferences: next }),
      });
      return;
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      const looksLikeMethodMismatch =
        msg.includes("Cannot PUT /v1/profile/preferences") ||
        msg.includes("Cannot POST /v1/profile/preferences") ||
        msg.includes("Cannot") ||
        msg.includes("405") ||
        msg.includes("404");

      if (!looksLikeMethodMismatch) throw e;
    }

    // fallback to POST (older environments)
    await apiJson("/v1/profile/preferences", {
      method: "POST",
      body: JSON.stringify({ preferences: next }),
    });
  }

  // ---------- Manual Save: backend prefs (if sync) + local intel (always) ----------
  async function onSaveAll() {
    setSaving(true);
    setToast(null);

    const nextPrefs: Preferences = {
      health: { ...prefs.health },
      goal: prefs.goal,
      cuisines: [...prefs.cuisines],
    };

    const nextIntel: ProfileIntel = {
      ...intel,
      // normalize time fields
      wakeTime: intel.wakeTime?.trim() ? intel.wakeTime.trim() : undefined,
      dinnerTime: intel.dinnerTime?.trim() ? intel.dinnerTime.trim() : undefined,
    };

    // validate time inputs (optional but must be valid if set)
    if (!isTimeLikeHHMM(nextIntel.wakeTime)) {
      setSaving(false);
      setToast({ kind: "error", msg: "Wake time must be HH:MM (e.g., 07:30)." });
      return;
    }
    if (!isTimeLikeHHMM(nextIntel.dinnerTime)) {
      setSaving(false);
      setToast({ kind: "error", msg: "Dinner time must be HH:MM (e.g., 19:30)." });
      return;
    }

    try {
      // Always save local intel (privacy-safe)
      await saveLocalIntel(nextIntel);

      // Save backend prefs only if Sync
      if (isSync) {
        await persistPrefsStable(nextPrefs);
        setToast({ kind: "success", msg: "Saved. Sync preferences updated." });
        await loadPrefsIfSync();
      } else {
        setToast({ kind: "success", msg: "Saved on-device. Enable Sync to sync preferences." });
      }
    } catch (e: any) {
      setToast({ kind: "error", msg: e?.message ?? "Couldn’t save. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  // ---------- Pills ----------
  function Pill({
    label,
    selected,
    disabled,
    onPress,
    tone,
  }: {
    label: string;
    selected?: boolean;
    disabled?: boolean;
    onPress?: () => void;
    tone?: "neutral" | "accent";
  }) {
    const on = !!selected;
    const dis = !!disabled;

    const bg = on
      ? tone === "accent"
        ? "rgba(111, 174, 217, 0.14)" // teal tint
        : UI.colors.successBg
      : UI.colors.pill.neutralBg;

    const border = on
      ? tone === "accent"
        ? "rgba(111, 174, 217, 0.28)"
        : UI.colors.successBorder
      : UI.colors.pill.neutralBorder;

    return (
      <Pressable
        onPress={onPress}
        disabled={dis}
        style={[
          styles.pill,
          { backgroundColor: bg, borderColor: border, opacity: dis ? 0.55 : 1 },
        ]}
      >
        <Text style={styles.pillText}>{label}</Text>
      </Pressable>
    );
  }

  function AccordionCard({
    k,
    title,
    subtitle,
    children,
  }: {
    k: SectionKey;
    title: string;
    subtitle?: string;
    children: React.ReactNode;
  }) {
    const isOpen = open === k;
    const dimOthers = open !== k;

    return (
      <View
        style={[
          styles.card,
          isOpen ? styles.cardActive : null,
          dimOthers ? styles.cardDim : null,
        ]}
      >
        <Pressable
          onPress={() => setOpen((prev) => (prev === k ? prev : k))}
          style={styles.accordionHeader}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.h2}>{title}</Text>
            {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
          </View>

          <View style={styles.chevWrap}>
            <Text style={styles.chev}>{isOpen ? "▾" : "▸"}</Text>
          </View>
        </Pressable>

        {isOpen ? <View style={styles.accordionBody}>{children}</View> : null}
      </View>
    );
  }

  const goalOptions: Array<{ label: string; value: Preferences["goal"] }> = [
    { label: "Lose", value: "lose" },
    { label: "Maintain", value: "maintain" },
    { label: "Gain", value: "gain" },
  ];

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.section}>
          <Text style={styles.h1}>{copy.headerTitle}</Text>
          <Text style={styles.sub}>
            {isSync ? "Sync is on for personalization + groups." : "Privacy mode is on (on-device)."}
          </Text>
        </View>

        {toast ? <ToastInline kind={toast.kind} msg={toast.msg} /> : null}

        {/* Profile Preferences (Accordion) */}
        <View style={styles.card}>
          <Text style={styles.h2}>{copy.prefsTitle}</Text>
          <Text style={styles.sub}>{copy.prefsSub}</Text>
          {!isSync ? <Text style={styles.note}>{copy.privacyNote}</Text> : null}

          <View style={{ marginTop: UI.spacing.sectionGapSm, gap: UI.spacing.sectionGapSm }}>
            <AccordionCard k="goals" title={copy.goalsTitle}>
              <Text style={styles.label}>{copy.goalLabel}</Text>
              <View style={styles.pillRow}>
                {goalOptions.map((g) => (
                  <Pill
                    key={g.value}
                    label={g.label}
                    selected={prefs.goal === g.value}
                    disabled={!isSync}
                    onPress={() => setPrefs((p) => ({ ...p, goal: g.value }))}
                    tone="accent"
                  />
                ))}
              </View>

              <View style={styles.divider} />

              <Text style={styles.label}>{copy.goalIntensityLabel}</Text>
              <View style={styles.pillRow}>
                <Pill
                  label="Light"
                  selected={intel.goalIntensity === "light"}
                  onPress={() => setIntel((p) => ({ ...p, goalIntensity: "light" }))}
                />
                <Pill
                  label="Moderate"
                  selected={intel.goalIntensity === "moderate"}
                  onPress={() => setIntel((p) => ({ ...p, goalIntensity: "moderate" }))}
                />
                <Pill
                  label="Aggressive"
                  selected={intel.goalIntensity === "aggressive"}
                  onPress={() => setIntel((p) => ({ ...p, goalIntensity: "aggressive" }))}
                />
              </View>
            </AccordionCard>

            <AccordionCard k="health" title={copy.healthTitle}>
              <Text style={styles.label}>Health toggles (Sync)</Text>

              <View style={styles.switchRow}>
                <Text style={styles.switchText}>Diabetes</Text>
                <Switch
                  value={prefs.health.diabetes}
                  trackColor={{ false: UI.colors.outline, true: accent }}
                  thumbColor={Platform.OS === "android" ? UI.colors.surface : undefined}
                  ios_backgroundColor={UI.colors.outline}
                  onValueChange={(v) => setPrefs((p) => ({ ...p, health: { ...p.health, diabetes: v } }))}
                  disabled={!isSync}
                />
              </View>

              <View style={styles.switchRow}>
                <Text style={styles.switchText}>High BP</Text>
                <Switch
                  value={prefs.health.highBP}
                  trackColor={{ false: UI.colors.outline, true: accent }}
                  thumbColor={Platform.OS === "android" ? UI.colors.surface : undefined}
                  ios_backgroundColor={UI.colors.outline}
                  onValueChange={(v) => setPrefs((p) => ({ ...p, health: { ...p.health, highBP: v } }))}
                  disabled={!isSync}
                />
              </View>

              <View style={styles.switchRow}>
                <Text style={styles.switchText}>Fatty liver</Text>
                <Switch
                  value={prefs.health.fattyLiver}
                  trackColor={{ false: UI.colors.outline, true: accent }}
                  thumbColor={Platform.OS === "android" ? UI.colors.surface : undefined}
                  ios_backgroundColor={UI.colors.outline}
                  onValueChange={(v) => setPrefs((p) => ({ ...p, health: { ...p.health, fattyLiver: v } }))}
                  disabled={!isSync}
                />
              </View>

              <View style={styles.divider} />

              <Text style={styles.label}>{copy.carbLabel}</Text>
              <View style={styles.switchRow}>
                <Text style={styles.switchText}>Carb sensitive</Text>
                <Switch
                  value={!!intel.carbSensitive}
                  trackColor={{ false: UI.colors.outline, true: accent }}
                  thumbColor={Platform.OS === "android" ? UI.colors.surface : undefined}
                  ios_backgroundColor={UI.colors.outline}
                  onValueChange={(v) => setIntel((p) => ({ ...p, carbSensitive: v }))}
                />
              </View>
            </AccordionCard>

            <AccordionCard k="taste" title={copy.tasteTitle}>
              <Text style={styles.label}>{copy.cuisinesLabel}</Text>

              <TextInput
                value={cuisineInput}
                onChangeText={setCuisineInput}
                placeholder={copy.addCuisinePlaceholder}
                placeholderTextColor={UI.colors.textMuted}
                style={styles.input}
                editable={isSync}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="done"
              />

              <Pressable
                style={[
                  styles.btn,
                  styles.btnSecondary,
                  (!isSync || !cuisineInput.trim()) ? styles.btnDisabled : null,
                  { marginTop: 10 },
                ]}
                onPress={() => addCuisine()}
                disabled={!isSync || !cuisineInput.trim()}
              >
                <Text style={styles.btnSecondaryText}>{copy.addCuisineBtn}</Text>
              </Pressable>

              {prefs.cuisines.length > 0 && (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                  {prefs.cuisines.map((c) => (
                    <Pressable
                      key={c}
                      onPress={() => removeCuisine(c)}
                      disabled={!isSync}
                      style={[
                        styles.chip,
                        { opacity: isSync ? 1 : 0.55 },
                      ]}
                    >
                      <Text style={styles.chipText}>{c}  ✕</Text>
                    </Pressable>
                  ))}
                </View>
              )}

              {cuisineInput.trim().length > 0 && (
                <View style={{ marginTop: 10 }}>
                  {!catalogLoaded ? (
                    <Text style={[styles.muted, { fontSize: 12 }]}>Loading suggestions…</Text>
                  ) : cuisineSuggestions.length > 0 ? (
                    <View style={{ gap: 8 }}>
                      <Text style={[styles.muted, { fontSize: 12 }]}>Suggestions</Text>

                      {cuisineSuggestions.map((s) => (
                        <Pressable
                          key={s.id}
                          onPress={() => addCuisine(s.label)}
                          disabled={!isSync}
                          style={[
                            styles.suggestionRow,
                            { opacity: isSync ? 1 : 0.55 },
                          ]}
                        >
                          <Text style={styles.suggestionText}>{s.label}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : (
                    <Text style={[styles.muted, { fontSize: 12 }]}>
                      No suggestions. Tap “Add” to save as a custom cuisine.
                    </Text>
                  )}
                </View>
              )}

              <View style={styles.divider} />

              <Text style={styles.label}>{copy.eatingStyleLabel}</Text>
              <View style={styles.pillRow}>
                <Pill
                  label="Home"
                  selected={intel.eatingStyle === "home"}
                  onPress={() => setIntel((p) => ({ ...p, eatingStyle: "home" }))}
                />
                <Pill
                  label="Balanced"
                  selected={intel.eatingStyle === "balanced"}
                  onPress={() => setIntel((p) => ({ ...p, eatingStyle: "balanced" }))}
                />
                <Pill
                  label="Eat Out"
                  selected={intel.eatingStyle === "eatout"}
                  onPress={() => setIntel((p) => ({ ...p, eatingStyle: "eatout" }))}
                />
              </View>
            </AccordionCard>

            <AccordionCard k="habits" title={copy.habitsTitle}>
              <Text style={styles.label}>{copy.mealsPerDayLabel}</Text>
              <View style={styles.pillRow}>
                {[2, 3, 4, 5].map((n) => (
                  <Pill
                    key={n}
                    label={`${n}`}
                    selected={intel.mealsPerDay === n}
                    onPress={() => setIntel((p) => ({ ...p, mealsPerDay: n as 2 | 3 | 4 | 5 }))}
                  />
                ))}
              </View>

              <View style={styles.divider} />

              <Text style={styles.label}>{copy.dinnerTimeLabel}</Text>
              <TextInput
                value={intel.dinnerTime ?? ""}
                onChangeText={(t) => setIntel((p) => ({ ...p, dinnerTime: t }))}
                placeholder="19:30"
                placeholderTextColor={UI.colors.textMuted}
                style={styles.input}
                autoCorrect={false}
                autoCapitalize="none"
              />

              <Text style={[styles.label, { marginTop: UI.spacing.sectionGapSm }]}>{copy.wakeTimeLabel}</Text>
              <TextInput
                value={intel.wakeTime ?? ""}
                onChangeText={(t) => setIntel((p) => ({ ...p, wakeTime: t }))}
                placeholder="07:30"
                placeholderTextColor={UI.colors.textMuted}
                style={styles.input}
                autoCorrect={false}
                autoCapitalize="none"
              />

              <View style={styles.divider} />

              <Text style={styles.label}>{copy.activityLabel}</Text>
              <View style={styles.pillRow}>
                <Pill
                  label="Sedentary"
                  selected={intel.activityLevel === "sedentary"}
                  onPress={() => setIntel((p) => ({ ...p, activityLevel: "sedentary" }))}
                />
                <Pill
                  label="Moderate"
                  selected={intel.activityLevel === "moderate"}
                  onPress={() => setIntel((p) => ({ ...p, activityLevel: "moderate" }))}
                />
                <Pill
                  label="Active"
                  selected={intel.activityLevel === "active"}
                  onPress={() => setIntel((p) => ({ ...p, activityLevel: "active" }))}
                />
              </View>

              <Text style={[styles.label, { marginTop: UI.spacing.sectionGapSm }]}>{copy.proteinLabel}</Text>
              <View style={styles.pillRow}>
                <Pill
                  label="Low"
                  selected={intel.proteinPreference === "low"}
                  onPress={() => setIntel((p) => ({ ...p, proteinPreference: "low" }))}
                />
                <Pill
                  label="Medium"
                  selected={intel.proteinPreference === "medium"}
                  onPress={() => setIntel((p) => ({ ...p, proteinPreference: "medium" }))}
                />
                <Pill
                  label="High"
                  selected={intel.proteinPreference === "high"}
                  onPress={() => setIntel((p) => ({ ...p, proteinPreference: "high" }))}
                />
              </View>

              <Text style={[styles.label, { marginTop: UI.spacing.sectionGapSm }]}>{copy.portionLabel}</Text>
              <View style={styles.pillRow}>
                <Pill
                  label="Small"
                  selected={intel.portionAppetite === "small"}
                  onPress={() => setIntel((p) => ({ ...p, portionAppetite: "small" }))}
                />
                <Pill
                  label="Average"
                  selected={intel.portionAppetite === "average"}
                  onPress={() => setIntel((p) => ({ ...p, portionAppetite: "average" }))}
                />
                <Pill
                  label="Large"
                  selected={intel.portionAppetite === "large"}
                  onPress={() => setIntel((p) => ({ ...p, portionAppetite: "large" }))}
                />
              </View>
            </AccordionCard>
          </View>

          {/* Manual Save (both layers) */}
          <Pressable
            style={[
              styles.btn,
              styles.btnPrimary,
              saving ? styles.btnDisabled : null,
              { marginTop: UI.spacing.sectionGap },
            ]}
            onPress={onSaveAll}
            disabled={saving}
          >
            {saving ? <ActivityIndicator /> : <Text style={styles.btnPrimaryText}>{copy.saveBtn}</Text>}
          </Pressable>
        </View>

        {/* Privacy & Sync */}
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={styles.h2}>{copy.modeTitle}</Text>
              <Text style={styles.sub}>{copy.modeSub}</Text>
            </View>

            <View style={[styles.switchWrap, !modeReady && { opacity: 0.5 }]}>
              <Text style={styles.switchLabel}>
                {!modeReady ? "Starting…" : isSync ? "Sync" : "Privacy"}
              </Text>

              <Switch
                value={isSync}
                disabled={!modeReady}
                trackColor={{ false: UI.colors.outline, true: accent }}
                thumbColor={Platform.OS === "android" ? UI.colors.surface : undefined}
                ios_backgroundColor={UI.colors.outline}
                onValueChange={(v) => {
                  if (!modeReady) return;
                  if (v) setShowEnableConfirm(true);
                  else setShowDisableConfirm(true);
                }}
              />
            </View>
          </View>

          <View style={styles.block}>
            <Text style={styles.strong}>{copy.privacyTitle}</Text>
            <Text style={styles.muted}>{copy.privacyBody}</Text>
            <View style={{ marginTop: UI.spacing.gapSm }}>
              {copy.privacyBullets.map((b) => (
                <View key={b} style={styles.bulletRow}>
                  <Text style={styles.bullet}>•</Text>
                  <Text style={styles.bulletText}>{b}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.block}>
            <Text style={styles.strong}>{copy.syncTitle}</Text>
            <Text style={styles.muted}>{copy.syncBody}</Text>
            <View style={{ marginTop: UI.spacing.gapSm }}>
              {copy.syncBullets.map((b) => (
                <View key={b} style={styles.bulletRow}>
                  <Text style={styles.bullet}>•</Text>
                  <Text style={styles.bulletText}>{b}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.divider} />

          {!isSync ? (
            <View style={styles.block}>
              <Text style={styles.strong}>{copy.syncOffTitle}</Text>
              <Text style={styles.muted}>{copy.syncOffSub}</Text>

              <Pressable style={[styles.btn, styles.btnPrimary]} onPress={() => setShowEnableConfirm(true)}>
                <Text style={styles.btnPrimaryText}>{copy.enableSyncBtn}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.block}>
              <Text style={styles.strong}>{copy.syncOnTitle}</Text>
              <Text style={styles.muted}>{copy.syncOnSub}</Text>

              <Text style={styles.note}>{copy.disableNote}</Text>

              <Pressable style={[styles.btn, styles.btnDangerOutline]} onPress={() => setShowDisableConfirm(true)}>
                <Text style={styles.btnDangerText}>{copy.disableSyncBtn}</Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* What we store (Sync only) */}
        <View style={styles.card}>
          <Text style={styles.h2}>{copy.whatStoreTitle}</Text>
          <Text style={styles.sub}>{copy.whatStoreSub}</Text>

          <View style={{ marginTop: UI.spacing.gapSm }}>
            {copy.whatStoreBullets.map((b) => (
              <View key={b} style={styles.bulletRow}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.bulletText}>{b}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.note}>{copy.noAgeGender}</Text>
        </View>

        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator />
            <Text style={styles.muted}>Loading…</Text>
          </View>
        ) : null}
      </ScrollView>

      <ConfirmModal
        visible={showEnableConfirm}
        title={copy.enableModalTitle}
        body={copy.enableModalBody}
        confirmText="Turn on Sync"
        confirmTone="primary"
        onCancel={() => setShowEnableConfirm(false)}
        onConfirm={enableSync}
        busy={enableBusy}
      />

      <ConfirmModal
        visible={showDisableConfirm}
        title={copy.disableModalTitle}
        body={copy.disableModalBody}
        confirmText="Disable Sync"
        confirmTone="danger"
        onCancel={() => setShowDisableConfirm(false)}
        onConfirm={disableSync}
        busy={disableBusy}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: UI.colors.bg,
  },

  container: {
    padding: UI.spacing.page,
    paddingBottom: UI.spacing.page + 10,
    gap: UI.spacing.sectionGap,
  },

  section: {
    gap: UI.spacing.textGapSm,
  },

  h1: {
    fontSize: 22,
    fontWeight: "700",
    color: UI.colors.text,
  },

  h2: {
    fontSize: 16,
    fontWeight: "700",
    color: UI.colors.text,
  },

  sub: {
    color: UI.colors.textDim,
  },

  strong: {
    color: UI.colors.text,
    fontWeight: "700",
  },

  muted: {
    color: UI.colors.textMuted,
  },

  note: {
    color: UI.colors.textDim,
    marginTop: UI.spacing.textGapSm,
  },

  label: {
    color: UI.colors.textMuted,
    fontSize: 12,
    marginTop: UI.spacing.textGapSm,
  },

  card: {
    backgroundColor: UI.colors.cardBg,
    borderRadius: UI.radius.card,
    padding: UI.spacing.cardPadLg ?? UI.spacing.cardPad,
    borderWidth: 1,
    borderColor: UI.colors.cardBorder,
    gap: UI.spacing.sectionGapSm,

    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },

  cardActive: {
    borderColor: "rgba(111, 174, 217, 0.28)",
  },

  cardDim: {
    // dim only within accordion list
  },

  block: {
    gap: UI.spacing.textGapSm,
    marginTop: UI.spacing.sectionGapSm,
  },

  divider: {
    height: 1,
    backgroundColor: UI.colors.outline,
    marginTop: UI.spacing.sectionGapSm,
  },

  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: UI.spacing.gap,
  },

  switchWrap: {
    alignItems: "flex-end",
    gap: UI.spacing.gapXs,
  },

  switchLabel: {
    color: UI.colors.textMuted,
    fontSize: 12,
  },

  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: UI.spacing.gapSm,
  },

  bullet: {
    color: UI.colors.textMuted,
    marginTop: 1,
  },

  bulletText: {
    flex: 1,
    color: UI.colors.textDim,
  },

  input: {
    marginTop: UI.spacing.textGapSm,
    backgroundColor: UI.colors.surface,
    borderColor: UI.colors.outline,
    borderWidth: 1,
    borderRadius: UI.radius.md,
    paddingHorizontal: UI.spacing.btnX,
    paddingVertical: Platform.select({ ios: UI.spacing.btnY, android: 10, default: 10 }),
    color: UI.colors.text,
  },

  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: UI.spacing.gapXs,
  },

  switchText: {
    color: UI.colors.textDim,
  },

  btn: {
    marginTop: UI.spacing.sectionGapSm,
    borderRadius: UI.radius.btn,
    paddingVertical: UI.spacing.btnY,
    paddingHorizontal: UI.spacing.btnX,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  btnPrimary: {
    backgroundColor: UI.colors.primary.teal,
    borderColor: UI.colors.primary.teal,
  },

  btnPrimaryText: {
    color: UI.colors.surface,
    fontWeight: "700",
  },

  btnSecondary: {
    backgroundColor: UI.colors.btnBg,
    borderColor: UI.colors.btnBorder,
  },

  btnSecondaryText: {
    color: UI.colors.text,
    fontWeight: "700",
  },

  btnDangerOutline: {
    backgroundColor: UI.colors.btnBg,
    borderColor: UI.colors.errorBorder,
  },

  btnDangerText: {
    color: UI.colors.text,
    fontWeight: "700",
  },

  btnDisabled: {
    opacity: 0.55,
  },

  toast: {
    borderRadius: UI.radius.md,
    paddingVertical: UI.spacing.pillY,
    paddingHorizontal: UI.spacing.pillX,
    borderWidth: 1,
  },

  toastSuccess: {
    backgroundColor: UI.colors.successBg,
    borderColor: UI.colors.successBorder,
  },

  toastError: {
    backgroundColor: UI.colors.errorBg,
    borderColor: UI.colors.errorBorder,
  },

  toastText: {
    color: UI.colors.text,
    fontWeight: "600",
  },

  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: UI.spacing.gapSm,
    paddingVertical: UI.spacing.gapSm,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    padding: UI.spacing.page,
    justifyContent: "center",
    alignItems: "center",
  },

  modalCard: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: UI.colors.cardBg,
    borderRadius: UI.radius.card,
    padding: UI.spacing.cardPadLg ?? UI.spacing.cardPad,
    borderWidth: 1,
    borderColor: UI.colors.cardBorder,
    gap: UI.spacing.sectionGapSm,
  },

  modalTitle: {
    color: UI.colors.text,
    fontSize: 16,
    fontWeight: "800",
  },

  modalBody: {
    color: UI.colors.textDim,
    lineHeight: 20,
  },

  modalRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: UI.spacing.gapSm,
    marginTop: UI.spacing.sectionGapSm,
  },

  // Accordion styling
  accordionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: UI.spacing.gapSm,
    paddingVertical: 6,
  },

  accordionBody: {
    marginTop: UI.spacing.sectionGapSm,
  },

  chevWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: UI.colors.btnBg,
    borderWidth: 1,
    borderColor: UI.colors.btnBorder,
    alignItems: "center",
    justifyContent: "center",
  },

  chev: {
    color: UI.colors.textDim,
    fontSize: 16,
    fontWeight: "700",
    marginTop: -1,
  },

  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: UI.spacing.textGapSm,
  },

  pill: {
    borderWidth: 1,
    borderRadius: UI.radius.pill,
    paddingVertical: UI.spacing.pillY,
    paddingHorizontal: UI.spacing.pillX,
  },

  pillText: {
    color: UI.colors.text,
    fontWeight: "700",
    fontSize: 12,
  },

  chip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: UI.radius.pill,
    borderWidth: 1,
    borderColor: UI.colors.outline,
    backgroundColor: UI.colors.surface,
  },

  chipText: {
    color: UI.colors.text,
    fontSize: 13,
    fontWeight: "600",
  },

  suggestionRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: UI.radius.md,
    borderWidth: 1,
    borderColor: UI.colors.outline,
    backgroundColor: UI.colors.surface,
  },

  suggestionText: {
    color: UI.colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
});
