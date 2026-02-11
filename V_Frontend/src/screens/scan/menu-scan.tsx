import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Image,
  Pressable,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { UI } from "../../theme/ui";
import { useModeGate } from "../../hooks/use-mode-gate";
import { Button } from "../../../components/ui/button";
import { detectMenuTextBoxes } from "../../utils/menuDetection";
import { parseMenuToItemsText } from "../../utils/menu-parse";
import { syncEatOutMenuScore, syncEatOutMenuScoreVision, syncEatOutPutSnapshot, syncEatOutGetSnapshot } from "../../api/meal-scoring";
import { buildMenuCandidates, foldDescriptions } from "../../utils/menu-parse";
import { getLocalMenuDraft, upsertLocalMenuDraft, clearLocalMenuDraft } from "../../storage/local-logs";
import { normalizeReasons } from "../../utils/score-explain";





type SelectedItem = { id: string; name: string };
type CandidateItem = { id: string; name: string; confidence: number };

function uniqByLower(items: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of items) {
    const k = s.trim().toLowerCase();
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s.trim());
  }
  return out;
}

function draftKey(placeRefId: string) {
  return `vora.menuScanDraft.${placeRefId}`;
}




export default function MenuScanScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    placeRefId?: string;
    restaurantName?: string;
    returnTo?: string;
    mealType?: string;
  }>();
  
  

  const placeRefId = String(params.placeRefId ?? "scan").trim();
  const restaurantName = String(params.restaurantName ?? "Scanned menu").trim();
  const returnTo = String(params.returnTo ?? "/(tabs)/scan").trim();
  const mealType = String(params.mealType ?? "").trim();
  

  const { mode } = useModeGate();
  const isSync = mode === "sync";

  const [photoUri, setPhotoUri] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scoring, setScoring] = useState(false);
const [fallbackRecommended, setFallbackRecommended] = useState(false);
const [fallbackReason, setFallbackReason] = useState<string | null>(null);


  // Manual fallback (0% patience users need an escape hatch)
  const [manualText, setManualText] = useState("");
  const [candidates, setCandidates] = useState<CandidateItem[]>([]);
  const [selected, setSelected] = useState<SelectedItem[]>([]);

  const title = useMemo(() => {
    if (restaurantName) return `Scan menu · ${restaurantName}`;
    return "Scan menu";
  }, [restaurantName]);

  useEffect(() => {

    if (!photoUri) {
      void openCamera();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  useEffect(() => {
    if (!placeRefId) return;
  
    (async () => {
      const draft = await getLocalMenuDraft(placeRefId);
      if (!draft?.items?.length) return;
  
      setSelected((prev) => {
        if (prev.length) return prev; // don't clobber active session
        return draft.items.map((name, idx) => ({
          id: `draft-${idx}-${name.toLowerCase()}`,
          name,
        }));
      });
    })();
  }, [placeRefId]);
  

  async function runVisionScore(uri: string) {
    setScoring(true);
    setFallbackRecommended(false);
    setFallbackReason(null);
  
    try {
      const resp = await syncEatOutMenuScoreVision(
        { uri, name: "menu.jpg", type: "image/jpeg" },
        { mode: "sync" }
      );
  
      const ranked = resp?.data?.ranked ?? [];
      const overallConfidence = resp?.data?.overallConfidence ?? 0;
      const fallback = Boolean(resp?.data?.fallbackRecommended);
  
      if (fallback || !ranked.length) {
        setFallbackRecommended(true);
        setFallbackReason(resp?.data?.fallbackReason ?? "LOW_CONFIDENCE");
        // Now show manual UI: run on-device detection as helper
        await runDetection(uri);
        return;
      }
  
      const snapshotItems = ranked.map((r: any) => {
        const sj = r.scoringJson ?? null;
      
        return {
          name: r.name,
          scoreValue: sj?.score ?? r.score?.value ?? undefined,
          scoreLabel: sj?.label ?? r.score?.label ?? undefined,
      
          // ✅ Persist canonical AI payload (immutable)
          scoringJson: sj,
      
          // Optional helpers (keep these if you want fast list rendering)
          reasons: Array.isArray(sj?.reasons) ? sj.reasons : [],
          flags: Array.isArray(sj?.flags) ? sj.flags : [],
        };
      });
      

  
      await clearLocalMenuDraft(placeRefId);
  
      router.replace({
        pathname: "/eatout/menu-view",
        params: { placeRefId, restaurantName, mealType },
      });
    } catch (e: any) {
      // Provider failure → manual fallback
      setFallbackRecommended(true);
      setFallbackReason("PROVIDER_FAILED");
      await runDetection(uri);
    } finally {
      setScoring(false);
    }
  }
  
  async function runDetection(uri: string) {
    setDetecting(true);
    try {
      const boxes = await detectMenuTextBoxes(uri);
      const rawLines = boxes.map((b) => b.text);
      const folded = foldDescriptions(rawLines);
      const candidates = buildMenuCandidates(folded);
  
      if (!candidates.length) {
        setFallbackRecommended(true);
        setFallbackReason("NO_TEXT_DETECTED");
        setCandidates([]);
        return;
      }
  
      setCandidates(
        candidates.map((c, idx) => ({
          id: `c-${idx}-${c.norm}`,
          name: c.text,
          confidence: c.confidence,
        }))
      );

      //console.log("[menu-scan] boxes:", boxes.length, boxes.slice(0, 5));
      //console.log("[menu-scan] rawLines:", rawLines.length);
      //console.log("[menu-scan] folded:", folded.length, folded.slice(0, 10));
      //console.log("[menu-scan] candidates:", candidates.length, candidates.slice(0, 10));


    } catch (e) {
      setFallbackRecommended(true);
      setFallbackReason("DETECTION_FAILED");
      setCandidates([]);
    } finally {
      setDetecting(false);
    }
  }
  


  async function openCamera() {
    setBusy(true);
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Camera needed", "Allow camera access to scan menus.");
        router.back();
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        quality: 0.85,
        allowsEditing: false,
      });

      if (result.canceled) {
        router.back();
        return;
      }

      const uri = result.assets?.[0]?.uri;
      if (!uri) {
        Alert.alert("Scan failed", "Please try again.");
        router.back();
        return;
      }

      setPhotoUri(uri);
      await runDetection(uri); // <-- must happen every time

      /*if (isSync) {
        void runVisionScore(uri);
      } else {
        void runDetection(uri);
      }*/

      // Always run local detection to build candidates.
      // Sync scoring happens only when user taps "Score & Save".
    

    } catch (e: any) {
      Alert.alert("Scan failed", e?.message ?? "Please try again.");
      router.back();
    } finally {
      setBusy(false);
    }
  }


  

  function addManualItem() {
    const name = manualText.trim();
    if (!name) return;
    addSelectedName(name, `m-${Date.now()}`);
    setManualText("");
  }

  function addSelectedName(name: string, id: string) {
    const n = name.trim();
    if (!n) return;
    setSelected((prev) => {
      const exists = prev.some((x) => x.name.trim().toLowerCase() === n.toLowerCase());
      if (exists) return prev;
      return [...prev, { id, name: n }];
    });
  }

  function toggleCandidate(item: CandidateItem) {
    const lower = item.name.trim().toLowerCase();
    setSelected((prev) => {
      const exists = prev.some((x) => x.name.trim().toLowerCase() === lower);
      if (exists) return prev.filter((x) => x.name.trim().toLowerCase() !== lower);
      return [...prev, { id: item.id, name: item.name }];
    });
  }

  function removeItem(id: string) {
    setSelected((prev) => prev.filter((x) => x.id !== id));
  }

  function back() {
    if (returnTo) router.replace(returnTo as any);
    else router.back();
  }

  function normName(s: string) {
    return String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }
  
  function mergeMenuItems(existing: any[], incoming: any[]) {
    const keyFor = (it: any) => {
      const id = String(it?.itemId ?? "").trim();
      if (id) return `id:${id}`;
      const nm = normName(it?.name);
      return nm ? `nm:${nm}` : "";
    };
  
    const map = new Map<string, any>();
  
    const put = (it: any) => {
      const k = keyFor(it);
      if (!k) return;
  
      const prev = map.get(k);
      if (!prev) {
        map.set(k, it);
        return;
      }
  
      const prevHasSj = !!prev?.scoringJson;
      const nextHasSj = !!it?.scoringJson;
  
      // Prefer canonical payload when incoming has it and prev doesn't
      if (nextHasSj && !prevHasSj) {
        map.set(k, it);
        return;
      }
  
      // If both have canonical payload, prefer incoming (latest)
      if (nextHasSj && prevHasSj) {
        map.set(k, { ...prev, ...it, scoringJson: it.scoringJson });
        return;
      }
  
      // Otherwise: preserve existing scoringJson, but merge in other updates
      map.set(k, {
        ...prev,
        ...it,
        scoringJson: prev?.scoringJson ?? it?.scoringJson ?? null,
      });
    };
  
    for (const it of existing || []) put(it);
    for (const it of incoming || []) put(it);
  
    return Array.from(map.values());
  }
  
  
  

  async function saveSyncSnapshotAndOpen() {
    if (!selected.length) {
      Alert.alert("Select items", "Add or select at least one menu item.");
      return;
    }
    if (!isSync) {
      Alert.alert(
        "Privacy mode",
        "Privacy mode does not send data to the backend or score items. Switch to Sync mode to score and save a menu snapshot."
      );
      return;
    }

    setSaving(true);
    try {
      // 1) score selected items
      const scoreResp = await syncEatOutMenuScore(
        {
          items: selected.map((s, idx) => ({
            itemId: `sel-${idx}-${s.name.toLowerCase().replace(/\s+/g, "-")}`,
            name: s.name,
          })),
        },
        { mode: "sync" }
      );

      // 2) persist snapshot (overwrite allowed; backend enforces 30-day expiry)
// build items from this save
//const ranked = scoreResp?.data?.ranked ?? [];

//console.log("scoreResp data", JSON.stringify(scoreResp?.data, null, 2));


const ranked = scoreResp?.data?.ranked ?? [];

const snapshotItems =
  ranked.length > 0
    ? ranked.map((r: any) => ({
        // ✅ keep item identity (important for restaurant+item uniqueness)
        itemId: r.itemId ?? null,
        name: r.name,

        // ✅ keep summary fields (fast UI)
        scoreValue: r.score?.value ?? r.scoringJson?.score ?? null,
        scoreLabel: r.score?.label ?? r.scoringJson?.label ?? null,

        // ✅ canonical immutable payload
        scoringJson: r.scoringJson ?? null,

        // Optional UI helpers (derived, not source of truth)
        reasons: Array.isArray(r.scoringJson?.reasons) ? r.scoringJson.reasons : [],
        flags: Array.isArray(r.scoringJson?.flags) ? r.scoringJson.flags : [],
      }))
    : selected.map((s, idx) => ({
        itemId: `sel-${idx}-${s.name.toLowerCase().replace(/\s+/g, "-")}`,
        name: s.name,
        scoringJson: null,
        scoreValue: null,
        scoreLabel: null,
        reasons: [],
        flags: [],
      }));


    //console.log("ranked[0] keys", ranked?.[0] ? Object.keys(ranked[0]) : "none");
    //console.log("ranked[0]", ranked?.[0]);
    

// 1) compute newItems from this scan
const newItems =
  snapshotItems.length ? snapshotItems : selected.map((s) => ({ name: s.name }));

// 2) rawLines must come from SCORE response (best) or parsed fallback
const newRawLines: string[] =
  scoreResp?.data?.extracted?.rawLines ?? [];

// 3) fetch existing snapshot (if any) + existing rawLines
let existingItems: any[] = [];
let existingRawLines: string[] = [];

try {
  const prev = await syncEatOutGetSnapshot(placeRefId, { mode: "sync" });

  // IMPORTANT: your API seems to wrap in `.data`
  existingItems = Array.isArray(prev?.data?.snapshot?.items) ? prev.data.snapshot.items : [];
  existingRawLines = Array.isArray(prev?.data?.snapshot?.extracted?.rawLines)
    ? prev.data.snapshot.extracted.rawLines
    : [];
} catch {
  // ok if none exists
}


// 4) merge + dedupe
const mergedItems = mergeMenuItems(existingItems, newItems);


const mergedRawLines = Array.from(
  new Set(
    [...existingRawLines, ...newRawLines]
      .map((s) => String(s).trim())
      .filter(Boolean)
  )
);

//console.log("merged items WITH scoringJson", mergedItems.filter(i => !!i.scoringJson).length);
//console.log("merged items TOTAL", mergedItems.length);

// 5) ONE write (upsert)
await syncEatOutPutSnapshot(
  placeRefId,
  {
    menuSource: "scan_camera",
    confidence: 1, // Sync mode: ignore confidence
    items: mergedItems,
  },
  { mode: "sync" }
);

const verify = await syncEatOutGetSnapshot(placeRefId, { mode: "sync" });
const its = verify?.data?.snapshot?.items ?? [];
console.log(
  "snapshot stored scoringJson count",
  its.filter((i: any) => !!i.scoringJson).length,
  "total",
  its.length
);



      await clearLocalMenuDraft(placeRefId);

      // 3) navigate to view screen (new page, no inline expand)
      router.replace({
        pathname: "/eatout/menu-view",
        params: { placeRefId, restaurantName, mealType },
      });
      
    } catch (e: any) {
      const modeBlocked =
        e?.message === "MODE_BLOCKED" ||
        e?.code === "MODE_BLOCKED";
    
        const msg =
        modeBlocked
          ? "Switch to Sync mode to score and save."
          : e?.response?.data?.error?.message ||
            e?.response?.data?.message ||
            e?.body?.error?.message ||
            e?.error?.message ||
            e?.message ||
            (typeof e === "string" ? e : JSON.stringify(e, null, 2));
      
      Alert.alert("Could not save menu", msg);
    } finally {
      setSaving(false);
    }
  }

  function resolveReturnTo(rt: string | undefined) {
    const v = (rt ?? "").trim();
    if (!v) return "/(tabs)/eat-out";
    // Accept only absolute in-app routes
    if (v.startsWith("/")) return v;
    // Back-compat for older callers that used "eatout"
    if (v === "eat-out") return "/(tabs)/eat-out";
    return "/(tabs)/eat-out";
  }
  


  async function donePrivacy() {
    if (!selected.length) {
      Alert.alert("Add at least one item", "Select or add at least one menu item to continue.");
      return;
    }
  
    // Merge/upsert (2nd page scan adds items; no surprises)
    await upsertLocalMenuDraft(
      placeRefId,
      selected.map((s) => s.name),
      { merge: true }
    );
  
    Alert.alert(
      "Saved locally (30 days)",
      "Privacy mode keeps this on your device only. Switch to Sync to score and save a snapshot.",
      [
        {
          text: "OK",
          onPress: () => router.replace("/(tabs)/eat-out" as any),
        },
      ]
    );
  }
  
  

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: UI.colors.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 72 : 0}
    >
      <ScrollView
        style={{ flex: 1, backgroundColor: UI.colors.bg }}
        contentContainerStyle={{ padding: UI.spacing.lg, paddingBottom: 90 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.sub}>
        {isSync
  ? scoring
    ? "Scanning… then scoring with your profile."
    : fallbackRecommended
      ? "We’re not confident reading this menu. Use Manual Select."
      : "Sync mode: scan → select items → score (profile-aware)."
  : "Privacy mode: on-device scan only (nothing sent)."}
        </Text>

        <View style={styles.card}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.photo} />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Text style={{ color: UI.colors.textDim }}>
                {busy ? "Opening camera…" : "No photo yet."}
              </Text>
            </View>
          )}

          <View style={{ flexDirection: "row", gap: UI.spacing.md, marginTop: UI.spacing.md }}>
            <Button title={busy ? "Opening…" : "Retake"} onPress={openCamera} disabled={busy || saving} />
            <Button
              title={scoring ? "Scoring…" : saving ? "Saving…" : isSync ? "Score & Save" : "Done"}
              onPress={isSync ? saveSyncSnapshotAndOpen : donePrivacy}
              disabled={busy || detecting || saving || scoring}
              variant={isSync ? "default" : "ghost"}
            />
          </View>
        </View>


        {(candidates.length > 0 || detecting || fallbackRecommended || !isSync) && (
          <>
            <View style={styles.section}>
              <Text style={styles.h2}>Tap dishes you’re considering</Text>
              <Text style={styles.note}>
                {detecting
                  ? "Scanning menu…"
                  : candidates.length
                  ? "Tap to select. You can also add manually below."
                  : "Nothing detected. Add items manually (fast) or retake with better lighting."}
              </Text>

              {candidates.length > 0 && (
                <View style={styles.chipWrap}>
                  {candidates.map((c) => {
                    const isOn = selected.some((s) => s.name.trim().toLowerCase() === c.name.trim().toLowerCase());
                    return (
                      <Pressable
                        key={c.id}
                        onPress={() => toggleCandidate(c)}
                        style={[
                          styles.chip,
                          { borderColor: isOn ? UI.colors.primary.apricot : UI.colors.cardBorder },
                          isOn ? styles.chipOn : null,
                        ]}
                      >
                        <Text style={{ color: UI.colors.text }}>{c.name}</Text>
                        
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
      
              <View style={styles.section}>
                <Text style={styles.h2}>Manual add</Text>
                <Text style={styles.note}>Paste a line item name (quickest fallback).</Text>

                <View style={{ flexDirection: "row", gap: UI.spacing.md, alignItems: "center" }}>
                  <TextInput
                    value={manualText}
                    onChangeText={setManualText}
                    placeholder="e.g., Grilled salmon"
                    placeholderTextColor={UI.colors.textDim}
                    style={styles.input}
                    returnKeyType="done"
                    onSubmitEditing={addManualItem}
                  />
                  <Button title="Add" onPress={addManualItem} disabled={!manualText.trim() || saving} />
                </View>
              </View>

              <View style={styles.section}>
                <Text style={styles.h2}>Selected</Text>
                {!selected.length ? (
                  <Text style={styles.note}>Nothing selected yet.</Text>
                ) : (
                  <View style={{ gap: UI.spacing.sm }}>
                    {selected.map((s) => (
                      <View key={s.id} style={styles.row}>
                        <Text style={{ color: UI.colors.text, flex: 1 }}>{s.name}</Text>
                        <Pressable onPress={() => removeItem(s.id)} hitSlop={10}>
                          <Text style={{ color: UI.colors.status.danger }}>Remove</Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                )}
              </View>
              </>
         )}


        {!isSync && (
          <View style={styles.banner}>
            <Text style={styles.bannerTitle}>Privacy mode</Text>
            <Text style={styles.bannerText}>
              We won’t score or save to backend in Privacy mode. Switch to Sync mode to get “View menu (Scored)” and 30-day snapshots.
            </Text>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  title: {
    color: UI.colors.text,
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 6,
  },
  sub: {
    color: UI.colors.textDim,
    marginBottom: UI.spacing.lg,
  },
  card: {
    backgroundColor: UI.colors.cardBg,
    borderRadius: UI.radius.lg,
    padding: UI.spacing.lg,
    borderWidth: 1,
    borderColor: UI.colors.cardBorder,
  },
  photo: {
    width: "100%",
    height: 240,
    borderRadius: UI.radius.md,
    backgroundColor: UI.colors.canvas,
  },
  photoPlaceholder: {
    width: "100%",
    height: 240,
    borderRadius: UI.radius.md,
    backgroundColor: UI.colors.canvas,
    alignItems: "center",
    justifyContent: "center",
  },
  section: { marginTop: UI.spacing.xl },
  h2: { color: UI.colors.text, fontSize: 16, fontWeight: "700", marginBottom: 6 },
  note: { color: UI.colors.textDim, marginBottom: UI.spacing.md },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: UI.colors.cardBorder,
    borderRadius: UI.radius.md,
    paddingHorizontal: UI.spacing.md,
    paddingVertical: Platform.OS === "ios" ? 12 : 10,
    color: UI.colors.text,
    backgroundColor: UI.colors.pill.neutralBg,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: UI.spacing.md,
    padding: UI.spacing.md,
    borderWidth: 1,
    borderColor: UI.colors.cardBorder,
    borderRadius: UI.radius.md,
    backgroundColor: UI.colors.cardBg,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: UI.spacing.sm,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: UI.colors.cardBg,
  },
  chipOn: {
    backgroundColor: UI.colors.pill.neutralBg,
  },
  banner: {
    marginTop: UI.spacing.xl,
    padding: UI.spacing.lg,
    borderRadius: UI.radius.lg,
    borderWidth: 1,
    borderColor: UI.colors.cardBorder,
    backgroundColor: UI.colors.cardBg,
  },
  bannerTitle: { color: UI.colors.text, fontWeight: "700", marginBottom: 6 },
  bannerText: { color: UI.colors.textDim, lineHeight: 18 },
});
