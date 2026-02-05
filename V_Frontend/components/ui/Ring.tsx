import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { UI } from "../../src/theme/ui";

type Props = {
  value: number; // 0..100
  size?: number; // default UI.sizes.ringSize
  stroke?: number; // default UI.sizes.ringStroke
  label?: string | null;
  statusWord?: string | null;
  description?: string | null;

  // NEW
  animate?: boolean; // default true
  durationMs?: number; // default UI.motion.ringMs or 600
};

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export function Ring({
  value,
  size = UI.sizes.ringSize,
  stroke = UI.sizes.ringStroke,
  label,
  statusWord,
  description,
  animate = true,
  durationMs = UI.motion?.ringMs ?? 600,
}: Props) {
  const pct = clamp01((Number(value) || 0) / 100);

  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  const progress = useRef(new Animated.Value(animate ? 0 : pct)).current;

  useEffect(() => {
    if (!animate) {
      progress.setValue(pct);
      return;
    }

    progress.setValue(0);
    Animated.timing(progress, {
      toValue: pct,
      duration: durationMs,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // svg props
    }).start();
  }, [animate, pct, durationMs, progress]);

  const dashOffset = useMemo(() => {
    // Start at top (12 o’clock)
    const startAtTop = c * 0.25;
    // dashoffset decreases as progress increases
    return Animated.add(
      new Animated.Value(startAtTop),
      Animated.multiply(progress, new Animated.Value(-c))
    );
  }, [c, progress]);

  return (
    <View style={[styles.wrap, { width: size }]}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={UI.colors.ring.track}
            strokeWidth={stroke}
            fill="transparent"
            strokeLinecap="round"
          />
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={UI.colors.ring.active}
            strokeWidth={stroke}
            fill="transparent"
            strokeLinecap="round"
            strokeDasharray={`${c} ${c}`}
            strokeDashoffset={dashOffset as any}
          />
        </Svg>

        <View style={[styles.center, { width: size, height: size }]}>
          <Text style={styles.score}>{Math.round(Number(value) || 0)}</Text>
          {!!label && <Text style={styles.scoreLabel}>{label}</Text>}
        </View>
      </View>

      {!!statusWord && <Text style={styles.status}>{statusWord}</Text>}
      {!!description && <Text style={styles.desc}>{description}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    alignSelf: "center",
  },
  center: {
    position: "absolute",
    left: 0,
    top: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  score: {
    fontSize: UI.type.heroNumber,
    fontWeight: "700",
    color: UI.colors.text,
    marginTop: -6, // optical overlap
  },
  scoreLabel: {
    marginTop: 2,
    fontSize: UI.type.label,
    fontWeight: "500",
    color: UI.colors.textMuted,
  },
  status: {
    marginTop: UI.spacing.gapSm,
    fontSize: 14,
    fontWeight: "600",
    color: UI.colors.text,
  },
  desc: {
    marginTop: UI.spacing.textGapSm,
    fontSize: 13,
    fontWeight: "400",
    color: UI.colors.textDim,
    textAlign: "center",
    maxWidth: 260,
  },
});
