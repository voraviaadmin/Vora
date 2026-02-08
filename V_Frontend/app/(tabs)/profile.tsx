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
import { Picker } from "@react-native-picker/picker";
import { apiJson } from "../../lib/api";
import { UI } from "../../src/theme/ui";
import { useMode } from "../../src/state/mode";
import { toUserMessage } from "../../src/utils/toast-copy";
import { apiPost, ApiError } from "../../src/api/client"; // adjust path
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

type ProfileResponse = {
  mode: ProfileMode;
};

const defaultPrefs: Preferences = {
  health: { diabetes: false, highBP: false, fattyLiver: false },
  goal: "maintain",
  cuisines: [],
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
                    confirmTone === "danger" ? styles.btnDanger : styles.btnPrimary,
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

export default function ProfileTab() {
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState<Preferences>(defaultPrefs);
  const [cuisineInput, setCuisineInput] = useState("");

  type CuisineCatalogItem = { id: string; label: string; aliases?: string[] };

  const [cuisineCatalog, setCuisineCatalog] = useState<CuisineCatalogItem[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  
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
  const [showNotes, setShowNotes] = useState(false);
  


  const copy = useMemo(
    () => ({
      headerTitle: "Profile",
      sub: "Preferences are optional and designed for zero-patience logging.",

      prefsTitle: "Preferences",
      prefsSub: "These help personalize Sync mode. Privacy mode uses generic scoring.",

      healthTitle: "Health profile (optional)",
      healthSub: "Only used in Sync mode. Not stored in Privacy mode.",

      goalTitle: "Goal",
      goalSub: "Used to tailor recommendations in Sync mode.",

      cuisineTitle: "Cuisines",
      cuisineSub: "Pick what you like. You can add more anytime.",

      addCuisinePlaceholder: "American, Thai etc. Type a cuisine and press Add",
      addCuisineBtn: "Add",
      removeCuisineBtn: "Remove",

      saveBtn: "Save preferences",

      modeTitle: "Privacy & Sync",
      modeSub: "Choose where your data lives.",
      privacyTitle: "Privacy & Sync",
      privacyBodyTitle: "Privacy mode (default)",
      privacyBody:
        "In Privacy mode, everything stays on your device. No health personalization is used, and scores are generic.",
      privacyBullets: [
        "All data stays on your device",
        "No health personalization used",
        "Generic scoring only",
      ],
      syncTitle: "Sync mode (opt-in)",
      syncBodyTitle: "Sync mode (opt-in)",
      syncBody:
        "Sync enables cross-device history, personalization, and groups. Preferences are stored on the server for Sync features.",
      syncBullets: [
        "Cross-device history",
        "Personalization and groups",
        "Preferences stored on server for Sync features",
      ],

      whatStoreTitle: "What Sync stores",
      whatStoreSub: "Only what’s needed to deliver Sync features:",
      whatStoreBullets: ["Health toggles (optional)", "Your goal (lose / maintain / gain)", "Cuisine preferences"],
      noAgeGender: "We do not store age or gender.",

      syncOffTitle: "Sync is OFF",
      syncOffSub: "Your preferences stay on this device.",
      enableSyncBtn: "Enable Sync",

      syncOnTitle: "Sync is ON",
      syncOnSub: "Preferences are encrypted on the server for Sync features.",
      disableSyncBtn: "Disable Sync & Delete Server Data",
      disableNote: "Disabling Sync deletes server-stored profile data and removes you from all groups.",

      budgetTitle: "Spending control",
      budgetBody:
        "Budgets are advisory. The app will notify you at 50%, 75%, 90%, and 100%. Nothing is blocked unless you choose to block it.",
      budgetBullets: [
        "Notifications only (no auto downgrade)",
        "You can block OpenAI/Google features for the month",
        "Generic scoring still works anytime",
      ],

      enableModalTitle: "Before you turn on Sync",
      enableModalBody:
        "Sync enables personalization, groups, and cross-device history. If you later turn Sync off, your server-stored data is deleted and you will be removed from all groups.",
      disableModalTitle: "Disable Sync?",
      disableModalBody: "This deletes server-stored profile data and removes you from all groups.",

      notesTitle: "Details & notes",
      notesBody:
        "Privacy mode keeps everything on-device. Sync mode stores only what is required for cross-device sync and personalization. There is no silent downgrade or hidden cloud use.",
      notesBtn: "Details",
      notesClose: "Close",

      privacyNote: "Privacy Mode ignores health preferences and uses generic scoring.",
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
  



  async function loadAll() {
    setLoading(true);
    setToast(null);
  
    // ✅ ADD THIS BLOCK RIGHT HERE
    if (!isSync) {
      // Privacy mode: do not call backend. Treat as "local-only, no error".
      setPrefs(defaultPrefs);      // optional: keep UI populated
      setLoading(false);
      return;
    }
  
    try {
      // IMPORTANT: mode is NOT loaded from backend anymore (local-first authority)
  
      let nextPrefs = defaultPrefs;
      try {
        const prefRes = await apiJson<{ preferences: Preferences | null }>("/v1/profile/preferences");
        nextPrefs = prefRes?.preferences ?? defaultPrefs;
      } catch (e: any) {
        // sync mode but older backend may not have this route
        const msg = String(e?.message ?? "");
        if (!msg.includes("Cannot GET /v1/profile/preferences")) throw e;
        // If route missing, just fall back to defaults silently
      }
  
      setPrefs(nextPrefs);
    } catch (e: any) {
      setToast({ kind: "error", msg: toUserMessage(e) });
    } finally {
      setLoading(false);
    }
  }


  useEffect(() => {
    let cancelled = false;
  
    async function loadCuisineCatalog() {
      try {
        const res = await apiJson<{ data: { cuisines: CuisineCatalogItem[] } }>("/v1/meta/cuisines");
        if (cancelled) return;
        setCuisineCatalog(res.data.cuisines || []);
        setCatalogLoaded(true);
      } catch {
        // Don’t block profile UX if catalog fails. Keep free-text flow.
        if (cancelled) return;
        setCuisineCatalog([]);
        setCatalogLoaded(true);
      }
    }
  
    // load once (or whenever screen mounts)
    loadCuisineCatalog();
  
    return () => {
      cancelled = true;
    };
  }, []);
  



  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function enableSync() {
    setEnableBusy(true);
    setToast(null);
  
    try {
      await requestEnableSync(async () => {
        // IMPORTANT: await the API call
        await apiPost("/v1/profile/enable-sync", {});
      });
  
      // Close confirm modal only on success
      setShowEnableConfirm(false);
  
      setToast({ kind: "success", msg: "Sync enabled." });
      await loadAll();
    } catch (e: any) {
      if (e?.name === "AbortError") {
        Alert.alert("Can’t reach server. Check EXPO_PUBLIC_API_BASE_URL / Wi-Fi.", "Check API base URL / IP, then try again.");
        return;
      }
      Alert.alert("Enable Sync failed", e?.message ?? "Please try again.");
    } finally {
      // ✅ This is what prevents “Working…” forever
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
      await loadAll();
    } catch (e: any) {
      setToast({ kind: "error", msg: "Couldn’t disable Sync. Please try again." });
    } finally {
      setDisableBusy(false);
    }
  }

  async function savePreferences() {
    if (mode !== "sync") {
      Alert.alert("Sync is off", "Enable Sync to save preferences.");
      return;
    }

    setSaving(true);
    setToast(null);
    try {
      const next: Preferences = {
        health: { ...prefs.health },
        goal: prefs.goal,
        cuisines: [...prefs.cuisines],
      };
      //console.log("[profile/preferences] body=", JSON.stringify({ preferences: next }));
      await apiJson("/v1/profile/preferences", {
        method: "PUT",
        body: JSON.stringify({ preferences: next }),
      });

      setPrefs(next);
      setToast({ kind: "success", msg: "Saved. Your preferences are updated." });
      await loadAll();
    } catch (e: any) {
      //console.error("[profile/preferences] save failed:", e?.stack ?? e);
      //console.error("[profile/preferences] state:", { mode });
      setToast({ kind: "error", msg: e?.message ?? "Couldn't save preferences. Please try again." });
    }
    

    finally {
      setSaving(false);
    }
  }


  function addCuisine(rawOverride?: string) {
    const raw = (rawOverride ?? cuisineInput).trim();
    if (!raw) return;
  
    if (prefs.cuisines.some((c) => c.toLowerCase() === raw.toLowerCase())) {
      setCuisineInput("");
      return;
    }
  
    const next: Preferences = {
      health: { ...prefs.health },
      goal: prefs.goal,
      cuisines: [...prefs.cuisines, raw],
    };
  
    setPrefs(next);
    setCuisineInput("");
    scheduleAutosave(next);
  }
  
  
  function removeCuisine(c: string) {
    const next: Preferences = {
      health: { ...prefs.health },
      goal: prefs.goal,
      cuisines: prefs.cuisines.filter((x) => x !== c),
    };
    setPrefs(next);
    scheduleAutosave(next);
  }
  
  
  const autosaveTimer = useRef<any>(null);


async function persistPreferences(next: Preferences) {
  if (!isSync) return; // don’t write in Privacy mode

  setToast(null);
  try {
    await apiJson("/v1/profile/preferences", {
      method: "PUT", // if your backend is POST, change to "POST"
      body: JSON.stringify({ preferences: next }),
    });
    setToast({ kind: "success", msg: "Saved." });
  } catch {
    setToast({ kind: "error", msg: "Couldn’t save. Please try again." });
  }
}

function scheduleAutosave(next: Preferences) {
  if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
  autosaveTimer.current = setTimeout(() => {
    persistPreferences(next);
  }, 500);
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


        {/* Preferences */}
        <View style={styles.card}>
          <Text style={styles.h2}>{copy.prefsTitle}</Text>
          <Text style={styles.sub}>{copy.prefsSub}</Text>

          {!isSync ? <Text style={styles.note}>{copy.privacyNote}</Text> : null}

          <View style={styles.block}>
            <Text style={styles.strong}>{copy.healthTitle}</Text>

            <View style={styles.switchRow}>
              <Text style={styles.switchText}>Diabetes</Text>
              <Switch
                value={prefs.health.diabetes}
                trackColor={{ false: UI.colors.outline, true: UI.colors.primary.teal }}
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
                trackColor={{ false: UI.colors.outline, true: UI.colors.primary.teal }}
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
                trackColor={{ false: UI.colors.outline, true: UI.colors.primary.teal }}
                thumbColor={Platform.OS === "android" ? UI.colors.surface : undefined}
                ios_backgroundColor={UI.colors.outline}
                onValueChange={(v) => setPrefs((p) => ({ ...p, health: { ...p.health, fattyLiver: v } }))}
                disabled={!isSync}
              />
            </View>
          </View>


          {/* Goal chips */}
          <View style={styles.block}>
            <Text style={styles.strong}>{copy.goalTitle}</Text>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: UI.spacing.textGapSm }}>
              {goalOptions.map((g) => {
                const on = prefs.goal === g.value;
                return (
                  <Pressable
                    key={g.value}
                    disabled={!isSync}
                    onPress={() => setPrefs((p) => ({ ...p, goal: g.value }))}
                    style={[
                      styles.pillBtn,
                      on ? styles.pillBtnOn : styles.pillBtnOff,
                      !isSync ? styles.btnDisabled : null,
                    ]}
                  >
                    <Text style={styles.pillBtnText}>{g.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.block}>
            <Text style={styles.strong}>{copy.cuisineTitle}</Text>

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

  {/* Add cuisine button (your addCuisine() was not wired before) */}
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

  {/* Selected cuisines chips */}
  {prefs.cuisines.length > 0 && (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
      {prefs.cuisines.map((c) => (
        <Pressable
          key={c}
          onPress={() => removeCuisine(c)}
          disabled={!isSync}
          style={{
            paddingVertical: 6,
            paddingHorizontal: 10,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: UI.colors.outline,
            backgroundColor: UI.colors.surface,
            opacity: isSync ? 1 : 0.5,
          }}
        >
          <Text style={{ color: UI.colors.text, fontSize: 13 }}>{c}  ✕</Text>
        </Pressable>
      ))}
    </View>
  )}

  {/* Suggestions (only when typing) */}
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
              style={{
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: UI.colors.outline,
                backgroundColor: UI.colors.surface,
                opacity: isSync ? 1 : 0.5,
              }}
            >
              <Text style={{ color: UI.colors.text, fontSize: 14 }}>{s.label}</Text>
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
          </View>
        </View>


        {/* ✅ Save button BETWEEN Preferences and Privacy/Sync cards */}
        <Pressable
          style={[
            styles.btn,
            styles.btnPrimary,
            (!isSync || saving) ? styles.btnDisabled : null,
          ]}
          onPress={savePreferences}
          disabled={!isSync || saving}
        >
          {saving ? <ActivityIndicator /> : <Text style={styles.btnPrimaryText}>{copy.saveBtn}</Text>}
        </Pressable>





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
                trackColor={{ false: UI.colors.outline, true: UI.colors.primary.teal }}
                thumbColor={Platform.OS === "android" ? UI.colors.surface : undefined}
                ios_backgroundColor={UI.colors.outline}
                onValueChange={(v) => {
                  if (!modeReady) return; // ✅ hard guard
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

              <Pressable
                style={[styles.btn, styles.btnDangerOutline]}
                onPress={() => setShowDisableConfirm(true)}
              >
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

        {/* Spending control */}
        <View style={styles.card}>
          <Text style={styles.h2}>{copy.budgetTitle}</Text>
          <Text style={styles.sub}>{copy.budgetBody}</Text>

          <View style={{ marginTop: UI.spacing.gapSm }}>
            {copy.budgetBullets.map((b) => (
              <View key={b} style={styles.bulletRow}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.bulletText}>{b}</Text>
              </View>
            ))}
          </View>
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

  card: {
    backgroundColor: UI.colors.cardBg,
    borderRadius: UI.radius.card,
    padding: UI.spacing.cardPadLg ?? UI.spacing.cardPad,
    borderWidth: 1,
    borderColor: UI.colors.cardBorder,
    gap: UI.spacing.sectionGapSm,
  
    // premium depth
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
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

  pickerWrap: {
    marginTop: UI.spacing.textGapSm,
    borderWidth: 1,
    borderColor: UI.colors.outline,
    borderRadius: UI.radius.md,
    overflow: "hidden",
    backgroundColor: UI.colors.surface,
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

  btnDanger: {
    backgroundColor: UI.colors.errorBorder,
    borderColor: UI.colors.errorBorder,
  },

  btnDangerOutline: {
    backgroundColor: UI.colors.btnBg,
    borderColor: UI.colors.errorBorder,
  },

  btnDangerText: {
    color: UI.colors.neutral[900],
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


  pillBtn: {
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  pillBtnOn: {
    backgroundColor: UI.colors.successBg,
    borderColor: UI.colors.successBorder,
  },
  pillBtnOff: {
    backgroundColor: UI.colors.btnBg,
    borderColor: UI.colors.btnBorder,
  },
  pillBtnText: {
    color: UI.colors.text,
    fontWeight: "700",
    fontSize: 12,
  },

  cuisineRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: UI.colors.outline,
  },
  cuisineText: {
    color: UI.colors.text,
    fontSize: 14,
  },


});