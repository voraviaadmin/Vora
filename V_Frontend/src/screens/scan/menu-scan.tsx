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
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";

import { UI } from "../../theme/ui";
import { useModeGate } from "../../hooks/use-mode-gate";
import { Button } from "../../../components/ui/button";

/**
 * Phase 1 design:
 * - Privacy: on-device detection (Vision/ML Kit) + tap-to-select
 * - Sync: OpenAI scoring (selected items only)
 *
 * This screen implements the *camera capture* and a clean UX scaffold.
 * It does NOT dump OCR text (no gibberish).
 *
 * Next step (you will add later):
 * - Implement detectMenuItemsOnDevice(photoUri) to return candidate items.
 * - Render tappable overlays (boxes) to select items.
 */

type SelectedItem = { id: string; name: string };

export default function MenuScanScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    placeRefId?: string;
    restaurantName?: string;
    returnTo?: string;
  }>();

  const placeRefId = String(params.placeRefId ?? "").trim();
  const restaurantName = String(params.restaurantName ?? "").trim();
  const returnTo = String(params.returnTo ?? "").trim();

  const { mode } = useModeGate();
  const isSync = mode === "sync";

  const [photoUri, setPhotoUri] = useState<string>("");
  const [busy, setBusy] = useState(false);

  // Temporary manual fallback (until Vision/MLKit detection is wired)
  const [manualText, setManualText] = useState("");
  const [selected, setSelected] = useState<SelectedItem[]>([]);

  const title = useMemo(() => {
    if (restaurantName) return `Scan menu · ${restaurantName}`;
    return "Scan menu";
  }, [restaurantName]);

  useEffect(() => {
    // On enter, open camera immediately
    if (!photoUri) {
      void openCamera();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

      // Future hook:
      // const detected = await detectMenuItemsOnDevice(uri)
      // setSelectedCandidates(detected)
      // For now, we do nothing (no gibberish).
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
    setSelected((prev) => [...prev, { id: `m-${Date.now()}`, name }]);
    setManualText("");
  }

  function removeItem(id: string) {
    setSelected((prev) => prev.filter((x) => x.id !== id));
  }

  function done() {
    // For now just go back; later you’ll score + save snapshot in Sync mode.
    // Keep UX clean + non-buggy.
    router.back();
  }

  async function scoreSelected() {
    // Placeholder until you wire OpenAI scoring for selected items.
    // We keep this button here to lock the UX, but don’t send junk.
    if (!selected.length) {
      Alert.alert("Select items", "Add or select at least one menu item.");
      return;
    }
    Alert.alert(
      "Scoring not wired yet",
      "Next step: on-device detection (Privacy) + OpenAI scoring (Sync) for selected items only."
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
            ? "Sync mode: you’ll score selected items with AI (no full OCR dump)."
            : "Privacy mode: on-device scan only (no uploads)."}
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
            <Button
              title={busy ? "Opening…" : "Retake"}
              onPress={openCamera}
              disabled={busy}
              style={{ borderWidth: 1, borderColor: UI.colors.primary.apricot, flex: 1 }}
            />
            <Button
              title="Close"
              onPress={done}
              variant="ghost"
              style={{ borderWidth: 1, borderColor: UI.colors.outline, flex: 1 }}
            />
          </View>

          <Text style={styles.note}>
            Next: we’ll add tap-to-select boxes (Vision / ML Kit). This screen will never show raw OCR text.
          </Text>
        </View>

        {/* Temporary fallback (kept clean). You can remove later once tap-to-select is wired. */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Add an item (temporary fallback)</Text>
          <Text style={styles.cardSub}>
            If scan detection isn’t wired yet, add just the dish name. We’ll replace this with tap-to-select.
          </Text>

          <View style={styles.row}>
            <TextInput
              value={manualText}
              onChangeText={setManualText}
              placeholder="e.g., Bibimbap"
              placeholderTextColor={UI.colors.textDim}
              style={styles.input}
              returnKeyType="done"
              onSubmitEditing={addManualItem}
            />
            <Button
              title="Add"
              onPress={addManualItem}
              style={{ borderWidth: 1, borderColor: UI.colors.primary.apricot }}
            />
          </View>

          {selected.length ? (
            <View style={{ marginTop: UI.spacing.md }}>
              <Text style={styles.cardTitle}>Selected ({selected.length})</Text>
              {selected.map((it) => (
                <View key={it.id} style={styles.selRow}>
                  <Text style={{ color: UI.colors.text, fontWeight: "800", flex: 1 }}>{it.name}</Text>
                  <Button
                    title="Remove"
                    variant="ghost"
                    onPress={() => removeItem(it.id)}
                    style={{ borderWidth: 1, borderColor: UI.colors.outline }}
                  />
                </View>
              ))}
            </View>
          ) : null}

          <View style={{ flexDirection: "row", gap: UI.spacing.md, marginTop: UI.spacing.lg }}>
            <Button
              title={isSync ? "Score selected" : "Done"}
              onPress={isSync ? scoreSelected : done}
              style={{ borderWidth: 1, borderColor: UI.colors.primary.apricot, flex: 1 }}
            />
          </View>
        </View>

        <Text style={styles.footer}>
          Restaurant: {placeRefId || "—"} {returnTo ? `· Return: ${returnTo}` : ""}
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: "900", color: UI.colors.text },
  sub: { marginTop: 6, color: UI.colors.textDim },

  card: {
    marginTop: UI.spacing.lg,
    padding: UI.spacing.lg,
    borderRadius: UI.radius.lg,
    backgroundColor: UI.colors.surface,
    borderWidth: 1,
    borderColor: UI.colors.outline,
  },

  photo: {
    width: "100%",
    height: 320,
    borderRadius: UI.radius.lg,
    borderWidth: 1,
    borderColor: UI.colors.outline,
    backgroundColor: "#000",
  },
  photoPlaceholder: {
    width: "100%",
    height: 220,
    borderRadius: UI.radius.lg,
    borderWidth: 1,
    borderColor: UI.colors.outline,
    alignItems: "center",
    justifyContent: "center",
  },

  note: { marginTop: UI.spacing.md, color: UI.colors.textDim },

  cardTitle: { color: UI.colors.text, fontWeight: "900", fontSize: 16 },
  cardSub: { color: UI.colors.textDim, marginTop: 4 },

  row: { flexDirection: "row", gap: UI.spacing.md, marginTop: UI.spacing.md, alignItems: "center" },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: UI.colors.outline,
    borderRadius: UI.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: UI.colors.text,
    backgroundColor: UI.colors.bg,
  },

  selRow: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: UI.colors.outline,
    flexDirection: "row",
    gap: UI.spacing.md,
    alignItems: "center",
  },

  footer: { marginTop: UI.spacing.lg, color: UI.colors.textDim, textAlign: "center" },
});
