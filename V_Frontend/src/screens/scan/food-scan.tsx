// app/scan/food-scan.tsx
import React, { useMemo, useState, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";

import { UI } from "../../theme/ui";
import { useModeGate } from "../../hooks/use-mode-gate";
import { createMealLog, scoreMealInputPreview, type MealInput, scanOcr } from "../../api/meal-scoring";
import { invalidateHomeSummary } from "../../hooks/use-home-summary";
import { addLocalLog } from "../../storage/local-logs";


type Preview = { scoring?: any };

function PrimaryButton(props: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "primary" | "secondary";
}) {
  const { title, onPress, disabled, tone = "primary" } = props;

  return (
    <View style={{ flexGrow: 0 }}>
      <Text
        onPress={disabled ? undefined : onPress}
        style={[
          styles.btn,
          tone === "secondary" ? styles.btnSecondary : styles.btnPrimary,
          disabled ? styles.btnDisabled : null,
        ]}
      >
        {title}
      </Text>
    </View>
  );
}

export default function FoodScanScreen() {
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
    
        // populate text field for user to edit
        setItemsText(text.trim());
    
        // (recommended) auto-run preview
        // IMPORTANT: your onPreview reads itemsText, so call it after state updates.
        // simplest: call with direct string by temporarily setting local state:
        // We'll just defer one tick:
        setTimeout(() => {
          onPreview();
        }, 0);
      } catch (e: any) {
        setInlineError(e?.message ?? "Scan failed. Try again.");
      } finally {
        setScanning(false);
      }
  }

  async function onPreview() {
    const text = itemsText.trim();
    if (text.length < 2) {
      setInlineError("Type what you ate (even 1–2 words is fine), then tap Preview.");
      return;
    }

    setInlineError(null);
    setPreview(null);
    setPreviewLoading(true);

    try {
      const input: MealInput = {
        capturedAt: new Date().toISOString(),
        source: "food_scan",
        itemsText: text,
      };

      const res = await scoreMealInputPreview(input, { mode });






      setPreview(res as any);
    } catch (e: any) {
      setInlineError(e?.message ?? "Couldn’t preview right now.");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function onSave() {
    const text = itemsText.trim();
    if (text.length < 2) {
      Alert.alert("Save log", "Type what you ate first.");
      return;
    }
  
    if (!preview?.scoring) {
      Alert.alert("Save log", "Preview score first, then save.");
      return;
    }
  
    setSaving(true);
    setInlineError(null);
  
    try {
      const mealType = preview?.scoring?.derived?.mealType ?? null;
  
      if (mode === "privacy") {
        // 🔐 LOCAL SAVE
        await addLocalLog({
          capturedAt: new Date().toISOString(),
          summary: text,
          mealType,
          source: "food_scan",
          scoring: preview.scoring,
        });
  
        invalidateHomeSummary(); // local ring refresh
        Alert.alert("Saved", "Saved locally on this device.");
        return;
      }
  
      // ☁️ SYNC MODE (existing behavior)
      const out = await createMealLog(
        { summary: text, capturedAt: new Date().toISOString(), mealType },
        { mode }
      );
  
      if ("logId" in out) {
        invalidateHomeSummary();
        Alert.alert("Saved", `Log saved (${out.logId}).`);
      } else {
        setInlineError(out.reason ?? "Save failed.");
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

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title}>Food Scan</Text>
          <Text style={styles.subTitle}>{privacyCopy}</Text>
        </View>

        <View style={styles.card}>
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
            <PrimaryButton title={previewLoading ? "Previewing…" : "Preview score"} onPress={onPreview} disabled={busy || saving || previewLoading} />
            <PrimaryButton title={saving ? "Saving…" : "Save log"} onPress={onSave} disabled={busy || saving || !preview?.scoring} tone="secondary" />
          </View>

          <Text style={styles.tip}>{tipsCopy}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>What did you eat?</Text>
          <TextInput
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
        </View>

        {preview?.scoring ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Preview</Text>
            <Text style={styles.bigScore}>{preview.scoring.score}</Text>

            {Array.isArray(preview.scoring.reasons) && preview.scoring.reasons.length > 0 ? (
              <View style={{ marginTop: UI.spacing.gapSm }}>
                {preview.scoring.reasons.slice(0, 5).map((r: string, i: number) => (
                  <Text key={i} style={styles.reason}>
                    • {r}
                  </Text>
                ))}
              </View>
            ) : (
              <Text style={styles.tip}>No explanation yet.</Text>
            )}

            {mode !== "sync" ? (
              <Text style={styles.tip}>Turn on Sync for richer explanations + continuity (encrypted).</Text>
            ) : (
              <Text style={styles.tip}>Sync is on — more consistent results as preferences + history build up.</Text>
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
});
