import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { UI } from "../../src/theme/ui";

export function ModalCard(props: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <Modal visible={props.visible} transparent animationType="fade" onRequestClose={props.onClose}>
      <Pressable style={styles.backdrop} onPress={props.onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={styles.title}>{props.title}</Text>
          </View>

          <View>{props.children}</View>

          {props.footer ? <View style={styles.footer}>{props.footer}</View> : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: UI.colors.modalBackdrop,
    padding: UI.spacing.page,
    justifyContent: "center",
  },
  card: {
    backgroundColor: UI.colors.modalCard,
    borderRadius: UI.radius.card,
    padding: UI.spacing.cardPad,
    borderWidth: UI.border.thin,
    borderColor: UI.colors.modalBorder,
  },
  header: { marginBottom: UI.spacing.gapSm },
  title: { color: UI.colors.text, fontSize: UI.type.cardTitle, fontWeight: "900" },
  footer: { marginTop: UI.spacing.sectionGap },
});
