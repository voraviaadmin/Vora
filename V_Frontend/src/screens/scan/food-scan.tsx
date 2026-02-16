// app/scan/food-scan.tsx
import React, { useMemo, useState, useRef, useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useLocalSearchParams } from "expo-router";
import { UI } from "../../theme/ui";
import { useModeGate } from "../../hooks/use-mode-gate";
import { ApiError, apiPostForm } from "../../api/client";
import { createMealLog, scoreMealInputPreview, scanOcr } from "../../api/meal-scoring";
import type { MealInput } from "../../contracts/meal-input";
import { invalidateHomeSummary } from "../../hooks/use-home-summary";
import { addLocalLog } from "../../storage/local-logs";
import { normalizeReasons } from "../../utils/score-explain";
import { scoreV1 } from "../../api/meal-scoring";





type ItemPreview =
  | {
    kind?: "item_v1";
    itemName?: string | null;
    scoringJson?: any;
    scoring?: any;
  }

type PlatePreview = {
  kind: "plate_v2";
  items: Array<{
    itemName: string;
    portion?: { grams?: number | null; serving?: string };
    scoring?: any;
    confidence?: number;
  }>;
  totalMealNutrition?: any;
  overall?: any;

  // keep primary item fields for backward compatibility
  itemName?: string | null;
  scoringJson?: any;
};

type Preview = ItemPreview | PlatePreview;


type MealType = "breakfast" | "lunch" | "dinner" | "snack";
type StartMode = "camera" | "text";

function coerceMealType(v: unknown): MealType | null {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "breakfast" || s === "lunch" || s === "dinner" || s === "snack") return s;
  return null;
}

function coerceStart(v: unknown): StartMode {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "text" ? "text" : "camera";
}


function PrimaryButton(props: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "primary" | "secondary";
  style?: ViewStyle;
}) {
  const { title, onPress, disabled, tone = "primary", style } = props;

  return (
    <View style={[style]}>
      <Pressable
        onPress={disabled ? undefined : onPress}
        disabled={disabled}
        style={[
          styles.btn,
          tone === "secondary" ? styles.btnSecondary : styles.btnPrimary,
          disabled ? styles.btnDisabled : null,
        ]}
      >
        <Text style={styles.btnText}>{title}</Text>
      </Pressable>
    </View>
  );
}


async function scoreVisionV1(fileUri: string, _mode: "sync" | "privacy") {
  const form = new FormData();
  form.append("file", {
    uri: fileUri,
    name: "scan.jpg",
    type: "image/jpeg",
  } as any);

  const result = await apiPostForm<{ data?: any }>("/v1/sync/scan/score-vision-v1", form);
  return result; // ✅ return raw; unwrap in one place only

  //return result?.data ?? result;
}


function isLikelyOcrGarbage(s: string) {
  const t = (s ?? "").trim();
  if (!t) return true;

  // Too long and low word quality is usually OCR junk
  const letters = (t.match(/[A-Za-z]/g) ?? []).length;
  const total = t.length;
  const alphaRatio = total > 0 ? letters / total : 0;

  const words = t.split(/\s+/).filter(Boolean);
  const longWords = words.filter(w => w.length >= 3);

  // Heuristics tuned for “random OCR”
  if (t.length > 120 && alphaRatio < 0.55) return true;
  if (t.length > 80 && longWords.length < 3) return true;
  if (alphaRatio < 0.35) return true;

  return false;
}

function cleanLogSummary(raw: string, mode: "sync" | "privacy") {
  const t = (raw ?? "").trim();
  if (mode === "sync" && isLikelyOcrGarbage(t)) return "Food scan (photo)";
  return t;
}



export default function FoodScanScreen() {
  const params = useLocalSearchParams<{ mealType?: string; start?: string }>();
  const start = coerceStart(params.start);
  const inputRef = useRef<TextInput>(null);
  const [cameraExpanded, setCameraExpanded] = useState(start === "camera");
  const [textExpanded, setTextExpanded] = useState(start === "text");



  useEffect(() => {
    if (start === "text") {
      setTextExpanded(true);
      setCameraExpanded(false);
    } else {
      setCameraExpanded(true);
      setTextExpanded(false);
    }
  }, [start]);


  useEffect(() => {
    if (start === "text") {
      const t = setTimeout(() => inputRef.current?.focus(), 150);
      return () => clearTimeout(t);
    }
  }, [start]);





  const mealTypeOverride = coerceMealType(params.mealType);

  const { mode, ready } = useModeGate();
  const [permission, requestPermission] = useCameraPermissions();


  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const cameraRef = useRef<CameraView | null>(null);
  const [scanning, setScanning] = useState(false);

  const [itemsText, setItemsText] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [lastPhotoUri, setLastPhotoUri] = useState<string | null>(null);





  const privacyCopy = useMemo(() => {
    if (!ready) return "";
    if (mode === "sync") return "Sync is on • You can save logs + keep per-log explanations (encrypted).";
    return "Private mode • Typing is best. Camera scan is optional and won’t block manual entry.";
  }, [mode, ready]);

  const tipsCopy = useMemo(() => {
    if (!ready) return "";
    if (mode === "sync") return "Tip: You can use camera later to draft text faster, then edit before scoring.";
    return "Tip: In private mode, type a short description (e.g., “gatorade”, “chicken salad”, “2 tacos”).";
  }, [mode, ready]);




  async function onScanPhoto() {
    if (!ready) return;

    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        setInlineError("Camera permission is required to scan.");
        return;
      }
    }

    try {
      setInlineError(null);
      setScanning(true);

      const cam = cameraRef.current;
      if (!cam) {
        setInlineError("Camera not ready. Try again.");
        return;
      }

      // take picture (fast, no base64)
      const photo: any = await (cam as any).takePictureAsync({
        quality: 1,
        skipProcessing: false,
      });

      const uri = photo?.uri;
      if (!uri) {
        setInlineError("Could not capture photo. Try again.");
        return;
      }

      setLastPhotoUri(uri); // ✅ persist for Preview button + Save

      const ocrResp = await scanOcr({ uri, name: "scan.jpg", type: "image/jpeg" }, { mode });
      if (ocrResp?.meta?.blocked) {
        setInlineError("Privacy mode: on-device OCR is coming soon. Type what you ate below.");
        return;
      }




      const text = ocrResp?.data?.text ?? "";

      if (!text.trim()) {
        setInlineError("Couldn’t read text from that photo. Try again with better lighting.");
        return;
      }

      // In Sync (Vision-first): do NOT populate Type box.
      // populate text field for user to edit
      if (mode !== "sync") {
        setItemsText(text.trim());
      }


      // (recommended) auto-run preview
      // IMPORTANT: your onPreview reads itemsText, so call it after state updates.
      // simplest: call with direct string by temporarily setting local state:
      // We'll just defer one tick:
      setTimeout(() => {
        onPreview(uri);
      }, 0);
    } catch (e: any) {
      setInlineError(e?.message ?? "Scan failed. Try again.");
    } finally {
      setScanning(false);
    }
  }


  async function handleSyncPreview(photoUri?: string, text?: string) {
    const hasPhoto = typeof photoUri === "string" && photoUri.startsWith("file:");

    // 1) Vision-first if photo exists
    if (hasPhoto) {
      console.log("Food-Scan handleSyncPreview - Vision-first", photoUri);
      setItemsText("");



      console.log("VISION about to call scoreVisionV1");



      let data: any = null;
      
      try {
        data = await scoreVisionV1(photoUri!, "sync");
        console.log("VISION scoreVisionV1 returned ✅");
      } catch (e: any) {
        if (e instanceof ApiError) {
          console.log("VISION ApiError", {
            status: e.status,
            url: e.url,
            bodyText: e.bodyText,
            message: e.message,
          });
        } else {
          console.log("VISION error", e?.name, e?.message ?? e);
        }
        throw e;
      }
      
      console.log("VISION RAW (post-await):", data);
      // ✅ Canonical unwrap for all variants:
      // - fetch wrapper: { data: ... }
      // - apiOk wrapper: { ok:true, data:{...} }
      // - sometimes nested: { ok:true, data:{ ok:true, data:{...}} }
      const payload =
        (data as any)?.data?.data ??
        (data as any)?.data ??
        data;

      console.log("VISION payload.kind:", payload?.kind);
      console.log("VISION payload keys:", Object.keys(payload ?? {}));



      // 🔒 Make sure this is plain JSON (Hermes/JSI safety)
      try {
        JSON.stringify(data);
      } catch {
        throw new Error(
          "SYNC_VISION_BAD_RESPONSE: non-serializable response (possible circular/native object)."
        );
      }



      const kind = payload?.kind ?? null;
      const items = payload?.items ?? payload?.plate?.items ?? []; // tolerate either
      const overall = payload?.overall ?? payload?.plate?.overall ?? null;
      const totalMealNutrition = payload?.totalMealNutrition ?? payload?.plate?.totalMealNutrition ?? null;

      const isPlate =
        kind === "plate_v2" ||
        kind === "plate" ||
        (Array.isArray(items) && items.length > 1);

      if (isPlate) {
        const primary =
          items.slice().sort((a: any, b: any) => {
            const ac = a?.scoring?.estimates?.calories ?? 0;
            const bc = b?.scoring?.estimates?.calories ?? 0;
            return bc - ac;
          })[0] ?? items[0] ?? null;

        setPreview({
          kind: "plate_v2",
          items,
          overall,
          totalMealNutrition,
          itemName: primary?.itemName ?? null,
          scoringJson: primary?.scoring ?? null,
        } as any);

        setInlineError(null);
        return;
      }


      // ✅ Single item (existing)
      if (!payload?.scoringJson) throw new Error("AI response missing scoring details. Please try again.");
      setPreview(payload);
      setInlineError(null);
      return;
      

    }

    // 2) Text fallback
    const cleanText = String(text ?? "").trim();
    if (!cleanText) {
      throw new Error("Take a photo (Vision-first), or type what you ate.");
    }

    console.log("Food-Scan handleSyncPreview - Text fallback", cleanText);

    const res = await scoreV1({ context: "food_scan", input: { text: cleanText } }, { mode: "sync" });
    const data: any = (res as any)?.data ?? res ?? null;

    if (!data?.scoringJson) {
      throw new Error("AI response missing scoring details. Please try again.");
    }

    // Optional: JSI safety on rich sync payload too
    try {
      JSON.stringify(data);
    } catch {
      throw new Error(
        "SYNC_TEXT_BAD_RESPONSE: non-serializable response (possible circular/native object)."
      );
    }

    setPreview(data);
    setInlineError(null);
  }

  async function handlePrivacyPreview(text?: string) {
    const cleanText = String(text ?? "").trim();

    // Privacy requires user-confirmed text (OCR can be messy)
    if (!cleanText) {
      setItemsText("In Privacy Mode, Camera Recognition can be inaccurate. Please type what you ate.");
      throw new Error("Type what you ate.");
    }

    // Optional guard: reject mostly-symbol OCR garbage (premium UX)
    const lettersOnly = cleanText.replace(/[^a-zA-Z ]/g, "");
    if (lettersOnly.trim().length < 3) {
      throw new Error("OCR text unclear. Please edit before scoring.");
    }

    console.log("Food-Scan handlePrivacyPreview - Text", cleanText);

    const res = await scoreV1({ context: "food_scan", input: { text: cleanText } }, { mode: "privacy" });
    const data: any = (res as any)?.data ?? res ?? null;

    // Privacy may return scoring OR scoringJson (depending on backend version)
    const scoringAny = data?.scoringJson ?? data?.scoring ?? null;
    if (!scoringAny) {
      throw new Error("Preview unavailable right now.");
    }

    const normalized = data?.scoringJson
      ? data
      : {
        ...data,
        scoringJson: {
          score: scoringAny.score,
          label: "Good",
          why: (scoringAny.reasons || []).slice(0, 1).join(" "),
          reasons: scoringAny.reasons || [],
          flags: [],
          estimates: {
            calories: null,
            protein_g: null,
            carbs_g: null,
            fat_g: null,
            sugar_g: null,
            sodium_mg: null,
            fiber_g: null,
          },
        },
      };

    setPreview(normalized);
    setInlineError(null);
  }


  async function onPreview(photoUri?: string) {
    const text = String(itemsText ?? "").trim();

    setInlineError(null);
    setPreview(null);
    setPreviewLoading(true);

    try {
      if (mode === "sync") {
        // ✅ if button clicked without uri, reuse last captured photo
        const uriToUse = photoUri ?? lastPhotoUri ?? undefined;
        await handleSyncPreview(uriToUse, text);
      } else {
        await handlePrivacyPreview(text);
      }
    } catch (e: any) {
      setInlineError(e?.message ?? "Couldn't preview right now.");
    } finally {
      setPreviewLoading(false);
    }
  }






  async function onSave() {

    const rawText = itemsText.trim();
    const text = cleanLogSummary(rawText, mode);

    const fallbackSummary = (preview as any)?.itemName || (preview as any)?.plate?.overall?.why || "";
    if (text.length < 2 && !fallbackSummary) {
      Alert.alert(
        "Save log",
        "Take a photo and preview score first (Vision-first), or type what you ate."
      );
      return;
    }



    // Capture once so TS can narrow reliably
    const p = preview;

    // Guard by mode (Sync requires scoringJson; Privacy requires scoring)
    if (mode === "sync") {
      // Sync supports both item_v1 and plate_v2
      if (!p) {
        Alert.alert("Save log", "Preview score first, then save.");
        return;
      }

      if (p.kind === "plate_v2") {
        if (!p.overall) {
          Alert.alert("Save log", "Preview score first, then save.");
          return;
        }
      } else {
        if (!p.scoringJson) {
          Alert.alert("Save log", "Preview score first, then save.");
          return;
        }
      }
    } else {
      // Privacy mode still uses scoring
      if (!p || !("scoring" in p) || !p.scoring) {
        Alert.alert("Save log", "Preview score first, then save.");
        return;
      }
    }


    setSaving(true);
    setInlineError(null);

    try {
      const derivedMealType =
        mode === "sync"
          ? (p as any)?.scoringJson?.derived?.mealType ?? (p as any)?.overall?.derived?.mealType ?? null
          : ("scoring" in (p as any) ? (p as any).scoring?.derived?.mealType ?? null : null);

      const mealType = mealTypeOverride ?? derivedMealType ?? null;

      const privacyPreview = (p && "scoring" in p) ? (p as any) : null;
      if (mode === "privacy") {
        if (!privacyPreview?.scoring) {
          Alert.alert("Save log", "Preview score first, then save.");
          return;
        }

        await addLocalLog({
          capturedAt: new Date().toISOString(),
          summary: text,
          mealType,
          source: "food_scan",
          scoring: privacyPreview.scoring,
        });

        invalidateHomeSummary(); // local ring refresh
        Alert.alert("Saved", "Saved locally on this device.");
        return;
      }

      // ☁️ SYNC MODE (existing behavior)

      if ((p as any)?.kind === "plate_v2") {
        const plate = p as any;
      
        const items: any[] = Array.isArray(plate.items) ? plate.items : [];
        if (!items.length) {
          Alert.alert("Save log", "No items to save from this plate.");
          return;
        }
      
        // Save EACH item as its own log (fastest fix without backend changes)
        // Optional: you can also create an extra “plate summary” log later if you want.
        const results = [];
      
        for (const it of items) {
          const scoringJson = it?.scoring ?? null;
          const score = scoringJson?.score ?? null;
          const itemName = String(it?.itemName ?? "").trim() || "Plate item";
      
          if (!scoringJson || score == null) {
            console.warn("Skipping item without scoring:", it?.itemName);
            continue;
          }
      
          const out = await createMealLog(
            {
              summary: itemName,
              capturedAt: new Date().toISOString(),
              mealType,
              score,
              scoringJson,
            },
            { mode }
          );
      
          results.push(out);
        }
      
        invalidateHomeSummary();
        Alert.alert("Saved", `Saved ${results.length} items from plate.`);
        return;
      }
      
      // ✅ Single-item (existing behavior)
      const scoringJson = (p as any).scoringJson;
      const score = scoringJson?.score ?? null;
      const itemName = (p as any)?.itemName ?? null;
      
      const cleanText = String(text ?? "").trim();
      const safeSummary =
        String(itemName ?? "").trim()
          ? String(itemName).trim()
          : cleanText
            ? cleanText
            : "Food entry";
      
      const out = await createMealLog(
        {
          summary: safeSummary,
          capturedAt: new Date().toISOString(),
          mealType,
          score,
          scoringJson,
        },
        { mode }
      );

      if ("logId" in out) {
        invalidateHomeSummary();
        Alert.alert("Saved", `Log saved (${out.logId}).`);
      } else {
        setInlineError((out as any).reason ?? "Save failed.");
      }



    } catch (e: any) {
      setInlineError(e?.message ?? "Failed to save.");
    } finally {
      setSaving(false);
    }








    
  }


  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }


  const pj = preview?.scoringJson ?? null; // canonical
  const ps = preview && "scoring" in preview ? (preview as any).scoring : null;
  const previewScore = mode === "sync" ? pj?.score : ps?.score;
  const previewLabel = mode === "sync" ? pj?.label : ps?.label;
  const previewWhy = mode === "sync" ? pj?.why : null;
  const previewReasons = mode === "sync" ? pj?.reasons : ps?.reasons;
  const previewFlags = mode === "sync" ? pj?.flags : ps?.flags;






  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title}>Food Scan</Text>
          <Text style={styles.subTitle}>{privacyCopy}</Text>
        </View>


        <View style={styles.card}>

          {/* Header row */}
          <Pressable

            onPress={() => setCameraExpanded((v) => !v)}
            style={{
              flexDirection: "row", justifyContent: "space-between", alignItems: "center",
              paddingVertical: 6,
            }}
          >
            <Text style={styles.sectionTitle}>Camera</Text>
            <Text style={styles.toggleText}>
              {cameraExpanded ? "Hide" : "Use camera"}
            </Text>
          </Pressable>

          {/* Collapsible body */}
          {cameraExpanded && (
            <>
              <View style={styles.cameraWrap}>
                {permission?.granted ? (
                  <CameraView ref={cameraRef} style={styles.camera} />
                ) : (
                  <View style={[styles.camera, styles.cameraPlaceholder]}>
                    <Text style={styles.cameraPlaceholderText}>Camera permission not granted</Text>
                  </View>
                )}
              </View>

              <View style={styles.row}>
                <PrimaryButton
                  title={scanning ? "Scanning..." : "Scan photo (Camera)"}
                  onPress={onScanPhoto}
                  disabled={scanning || busy || saving}
                  tone="secondary"
                />
              </View>

              <Text style={styles.tip}>{tipsCopy}</Text>
            </>
          )}
        </View>

        <View style={styles.card}>
          <Pressable
            onPress={() => setTextExpanded((v) => !v)}
            style={{
              flexDirection: "row", justifyContent: "space-between", alignItems: "center",
              paddingVertical: 6,
            }}
          >
            <Text style={styles.sectionTitle}>Type</Text>
            <Text style={styles.toggleText}>
              {textExpanded ? "Hide" : "Type instead"}
            </Text>
          </Pressable>

          {textExpanded && (
            <>
              <Text style={styles.sectionTitle}>What did you eat?</Text>
              <TextInput
                ref={inputRef}
                returnKeyType="done"
                blurOnSubmit={true}
                style={styles.input}
                placeholder='Example: "gatorade" or "chicken salad"'
                placeholderTextColor={UI.colors.textMuted}
                multiline
                value={itemsText}
                onChangeText={(t) => {
                  setItemsText(t);
                  setInlineError(null);
                  setPreview(null);
                }}
                textAlignVertical="top"
              />

              <View style={styles.rowSmall}>
                <PrimaryButton
                  title="Clear"
                  onPress={() => {
                    setItemsText("");
                    setPreview(null);
                    setInlineError(null);
                  }}
                  tone="secondary"
                  disabled={busy || saving || itemsText.trim().length === 0}
                />
              </View>

              {inlineError ? <Text style={styles.inlineError}>{inlineError}</Text> : null}
            </>
          )}
        </View>


        <View style={{ flexDirection: "row", marginTop: 12, marginBottom: 12 }}>

          <PrimaryButton
            title={previewLoading ? "Previewing…" : "Preview score"}
            onPress={onPreview}
            disabled={busy || saving || previewLoading}
            style={{ flex: 1, marginRight: 12 }}
          />
          <PrimaryButton
            title={saving ? "Saving…" : "Save log"}
            onPress={onSave}
            disabled={
              busy ||
              saving ||
              (mode === "sync"
                ? !preview || ((preview as any).kind === "plate_v2" ? !(preview as any).overall : !(preview as any).scoringJson)
                : !preview || !("scoring" in preview) || !(preview as any).scoring)
            }

            tone="secondary"
            style={{ flex: 1 }}
          />
        </View>





        {mode === "sync" && (((preview as any)?.kind === "plate_v2") || ((preview as any)?.kind === "plate")) ? (

          <View style={[styles.card, { marginTop: 12 }]}>
            <Text style={styles.sectionTitle}>Plate Preview</Text>

            {/* Overall */}
            <Text style={styles.bigScore}>{(preview as any)?.overall?.score ?? "—"}</Text>
            {!!(preview as any)?.overall?.label ? (
              <Text style={styles.previewLabel}>{(preview as any)?.overall?.label}</Text>
            ) : null}
            {!!(preview as any)?.overall?.why ? (
              <Text style={styles.previewWhy}>{(preview as any)?.overall?.why}</Text>
            ) : null}

            {/* Totals */}
            {(preview as any)?.totalMealNutrition ? (
              <Text style={styles.tip}>
                Total: {(preview as any).totalMealNutrition.calories ?? "—"} cal • P{" "}
                {(preview as any).totalMealNutrition.protein_g ?? "—"}g • C{" "}
                {(preview as any).totalMealNutrition.carbs_g ?? "—"}g • F{" "}
                {(preview as any).totalMealNutrition.fat_g ?? "—"}g
              </Text>
            ) : null}

            {/* Items list */}
            <View style={{ marginTop: UI.spacing.md, gap: 10 }}>
              {Array.isArray((preview as any)?.items) && (preview as any).items.length > 0 ? (
                (preview as any).items.map((it: any, idx: number) => {
                  const sc = it?.scoring ?? null;
                  const est = sc?.estimates ?? {};
                  const portionText =
                    it?.portion?.serving ??
                    (it?.portion?.grams ? `${it.portion.grams} g` : "portion unknown");

                  return (
                    <View
                      key={`${it?.itemName ?? "item"}-${idx}`}
                      style={{
                        padding: 12,
                        borderRadius: UI.radius.inner,
                        borderWidth: UI.border.thin,
                        borderColor: UI.colors.outline,
                        backgroundColor: "rgba(255,255,255,0.04)",
                      }}
                    >
                      <Text style={{ color: UI.colors.text, fontWeight: "900" }}>
                        {it?.itemName ?? "Item"}{" "}
                        <Text style={{ color: UI.colors.textDim, fontWeight: "700" }}>
                          • {portionText}
                        </Text>
                      </Text>

                      {sc ? (
                        <>
                          <Text style={{ color: UI.colors.textDim, marginTop: 4 }}>
                            Score: {sc.score ?? "—"} • {sc.label ?? ""}
                          </Text>
                          <Text style={{ color: UI.colors.textDim, marginTop: 4 }}>
                            {est.calories ?? "—"} cal • P {est.protein_g ?? "—"}g • C {est.carbs_g ?? "—"}g • F{" "}
                            {est.fat_g ?? "—"}g
                          </Text>

                          {Array.isArray(sc.flags) && sc.flags.length > 0 ? (
                            <Text style={styles.tip}>Flags: {sc.flags.join(", ")}</Text>
                          ) : null}

                          {Array.isArray(sc.reasons) && sc.reasons.length > 0 ? (
                            <View style={{ marginTop: 6 }}>
                              {normalizeReasons(sc.reasons, { context: "food", max: 3 }).map((r: string, i: number) => (
                                <Text key={i} style={styles.reason}>• {r}</Text>
                              ))}
                            </View>
                          ) : null}
                        </>
                      ) : (
                        <Text style={styles.tip}>No scoring for this item.</Text>
                      )}
                    </View>
                  );
                })
              ) : (
                <Text style={styles.tip}>No items detected.</Text>
              )}
            </View>

            <Text style={styles.tip}>Sync is on — plate breakdown is saved per-log (encrypted).</Text>
          </View>
        ) : (mode === "sync" ? !!pj : !!ps) ? (
          // ✅ your existing single-item preview card unchanged
          <View style={[styles.card, { marginTop: 12 }]}>
            <Text style={styles.sectionTitle}>Preview</Text>

            <Text style={styles.bigScore}>{previewScore ?? "—"}</Text>
            {!!previewLabel ? <Text style={styles.previewLabel}>{previewLabel}</Text> : null}

            {mode === "sync" && !!previewWhy ? (
              <Text style={styles.previewWhy}>{previewWhy}</Text>
            ) : null}

            {Array.isArray(previewReasons) && previewReasons.length > 0 ? (
              <View style={{ marginTop: UI.spacing.gapSm }}>
                {normalizeReasons(previewReasons, { context: "food", max: 5 }).map((r: string, i: number) => (
                  <Text key={i} style={styles.reason}>• {r}</Text>
                ))}
              </View>
            ) : (
              <Text style={styles.tip}>No explanation yet.</Text>
            )}

            {Array.isArray(previewFlags) && previewFlags.length > 0 ? (
              <Text style={styles.tip}>Flags: {previewFlags.join(", ")}</Text>
            ) : null}

            {mode !== "sync" ? (
              <Text style={styles.tip}>Turn on Sync for richer explanations + continuity (encrypted).</Text>
            ) : (
              <Text style={styles.tip}>Sync is on — explanations are saved per-log (encrypted).</Text>
            )}
          </View>
        ) : null}




        <View style={{ height: 24 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: UI.colors.bg },
  scroll: { flex: 1 },
  scrollContent: { padding: UI.spacing.page, paddingBottom: UI.spacing.page + 40 },

  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  header: { marginBottom: UI.spacing.sectionGap },
  title: { color: UI.colors.text, fontSize: UI.type.h1, fontWeight: "900" },
  subTitle: { color: UI.colors.textDim, marginTop: UI.spacing.gapSm, fontSize: 14, lineHeight: 18 },

  card: {
    backgroundColor: UI.colors.cardBg,
    borderColor: UI.colors.cardBorder,
    borderWidth: UI.border.thin,
    borderRadius: UI.radius.card,
    padding: UI.spacing.cardPad,
    marginBottom: UI.spacing.sectionGap,
  },

  cameraWrap: { borderRadius: UI.radius.inner, overflow: "hidden", borderWidth: UI.border.thin, borderColor: UI.colors.outline },
  camera: { width: "100%", height: 260 },
  cameraPlaceholder: { alignItems: "center", justifyContent: "center" },
  cameraPlaceholderText: { color: UI.colors.textDim },

  row: { flexDirection: "row", gap: UI.spacing.gapSm, marginTop: UI.spacing.sectionGap, flexWrap: "wrap" },
  rowSmall: { flexDirection: "row", gap: UI.spacing.gapSm, marginTop: UI.spacing.gapSm, flexWrap: "wrap" },

  btn: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: UI.radius.inner,
    overflow: "hidden",
    fontWeight: "800",
    color: UI.colors.text,
  },
  btnPrimary: { backgroundColor: "rgba(255,255,255,0.12)" },
  btnSecondary: { backgroundColor: "rgba(255,255,255,0.06)", borderWidth: UI.border.thin, borderColor: UI.colors.outline },
  btnDisabled: { opacity: 0.45 },

  tip: { color: UI.colors.textMuted, marginTop: UI.spacing.gapSm, lineHeight: 18 },

  sectionTitle: { color: UI.colors.text, fontWeight: "900", marginBottom: UI.spacing.gapSm, marginTop: 4 },
  toggleText: {
    color: UI.colors.textDim,
    fontWeight: "800",
    fontSize: 14,
    lineHeight: 18,
  },

  input: {
    minHeight: 110,
    borderRadius: UI.radius.inner,
    borderWidth: UI.border.thin,
    borderColor: UI.colors.outline,
    padding: UI.spacing.cardPad,
    color: UI.colors.text,
    backgroundColor: "rgba(0,0,0,0.20)",
    textAlignVertical: "top",
    lineHeight: UI.type.lineHeightMd,
  },

  inlineError: { marginTop: UI.spacing.gapSm, color: "rgba(255,180,180,0.95)", lineHeight: 18 },

  bigScore: { color: UI.colors.text, fontSize: 70, fontWeight: "900", marginTop: 4 },
  reason: { color: UI.colors.textDim, lineHeight: 18, marginTop: 2 },
  btnText: {
    // keep it simple; match your theme values if you have them
    color: "#fff",
    fontWeight: "900",
    textAlign: "center",
  },

  previewLabel: { color: UI.colors.textDim, fontWeight: "800", marginTop: 4 },
  previewWhy: { color: UI.colors.text, marginTop: UI.spacing.gapSm, lineHeight: 18 },



});
