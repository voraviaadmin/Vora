import React, { useEffect, useMemo, useRef } from "react";
import { Animated, StyleSheet, Text } from "react-native";
import { UI } from "../../src/theme/ui";

export function ScoreDelta(props: {
  today: number | null;
  yesterday: number | null;
  bumpKey?: string | number; // e.g. days window
}) {
  const { today, yesterday, bumpKey } = props;
  if (today == null || yesterday == null) return null;

  const delta = useMemo(() => Math.round(today - yesterday), [today, yesterday]);

  if (delta === 0) return <Text style={styles.neutral}>0</Text>;
  const up = delta > 0;

  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(UI.motion.deltaTranslateY)).current;

  useEffect(() => {
    opacity.setValue(0);
    translateY.setValue(UI.motion.deltaTranslateY);

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: UI.motion.fast,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: UI.motion.fast,
        useNativeDriver: true,
      }),
    ]).start();
  }, [delta, bumpKey, opacity, translateY]);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      <Text style={[styles.val, up ? styles.up : styles.down]}>
        {up ? "↑" : "↓"} {Math.abs(delta)}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  val: { fontWeight: "900" },
  up: { color: UI.colors.deltaUp },
  down: { color: UI.colors.deltaDown },
  neutral: { color: UI.colors.textMuted, fontWeight: "900" },
});
