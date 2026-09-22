// PAUSE — Story audio player: bottom floating mini pill. Shows up when the
// user has scrolled past the AudioCard AND playback is active.

import React, { useEffect } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import Animated, {
  SharedValue, useAnimatedStyle, useSharedValue, interpolate, Extrapolation,
} from "react-native-reanimated";
import Ionicons from "@react-native-vector-icons/ionicons";
import { LinearGradient } from "expo-linear-gradient";

import { useTheme } from "@/src/theme";

import { useAudio } from "./context";
import { useStyles } from "./styles";

export function BottomFloatingMini({
  scrollY, bottomInset,
}: {
  scrollY: SharedValue<number>;
  viewportHeight?: number;
  bottomInset: number;
}) {
  const { playing, position, buffering, isLoaded, togglePlay, skip, cardScreenYSV, cardHeightSV } = useAudio();
  const styles = useStyles();
  const { colors } = useTheme();

  const hasStarted = playing || position > 0.5;
  const activeSV = useSharedValue(0);
  useEffect(() => {
    activeSV.value = hasStarted ? 1 : 0;
  }, [hasStarted, activeSV]);

  const animatedStyle = useAnimatedStyle(() => {
    const cardBottomOnScreen = cardScreenYSV.value + cardHeightSV.value - scrollY.value;
    const t = interpolate(cardBottomOnScreen, [20, -40], [0, 1], Extrapolation.CLAMP);
    const gated = t * activeSV.value;
    return {
      opacity: gated,
      transform: [
        { translateY: interpolate(gated, [0, 1], [80, 0]) },
        { scale: interpolate(gated, [0, 1], [0.9, 1]) },
      ],
      pointerEvents: gated > 0.05 ? "auto" : "none",
    } as any;
  });

  return (
    <Animated.View
      style={[styles.bottomMiniWrap, { bottom: bottomInset + 16 }, animatedStyle]}
      pointerEvents="box-none"
      testID="audio-mini-bar"
    >
      <View style={styles.bottomMiniPill}>
        <Pressable style={({ pressed }) => [styles.miniIconBtn, pressed && styles.pressed]} onPress={() => skip(-10)} disabled={!isLoaded} hitSlop={8} testID="audio-mini-back-10">
          <Ionicons name="play-back" size={14} color={colors.onSurface} />
          <Text style={styles.miniSkipLabel}>10</Text>
        </Pressable>
        <Pressable style={({ pressed }) => [styles.miniPlayBtn, pressed && styles.pressed]} onPress={togglePlay} hitSlop={8} testID="audio-mini-play-toggle">
          <LinearGradient colors={colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fill} />
          {buffering ? (
            <ActivityIndicator color={colors.onGradient} size="small" />
          ) : (
            <Ionicons name={playing ? "pause" : "play"} size={16} color={colors.onGradient} style={!playing ? { marginLeft: 2 } : undefined} />
          )}
        </Pressable>
        <Pressable style={({ pressed }) => [styles.miniIconBtn, pressed && styles.pressed]} onPress={() => skip(10)} disabled={!isLoaded} hitSlop={8} testID="audio-mini-fwd-10">
          <Text style={styles.miniSkipLabel}>10</Text>
          <Ionicons name="play-forward" size={14} color={colors.onSurface} />
        </Pressable>
      </View>
    </Animated.View>
  );
}
