// PAUSE — Story audio player: intro pieces used by the deep-dive intro page.
// Il pulsante "Ascolta" è ora un GlowButton: vetro cyan con glow morbido
// esterno e leggera pulsazione dinamica quando l'audio è in riproduzione.
// Riferimento visivo dell'intero design system Glassmorphism di PAUSE.

import React, { useRef } from "react";
import { View, Text, ActivityIndicator, LayoutChangeEvent } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";

import { spacing, useTheme, typography } from "@/src/theme";
import { useI18n } from "@/src/i18n";
import { GlowButton, GlowOrb } from "@/src/components/glass";

import { useAudio } from "./context";
import { AudioCard } from "./audio-card";

// Il pulsante "Ascolta" — vetro cyan luminoso, icona play a sinistra, testo
// bianco. Quando l'audio è attivo pulsa delicatamente (dinamica gestita da
// GlowButton). Non ha stati "neon": è vetro illuminato dalla luce.
export function IntroListenButton({
  onListen, compact = false, testID = "deep-dive-listen-ai",
}: { onListen: () => void; compact?: boolean; testID?: string }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const a = useAudio();
  const onPress = () => {
    Haptics.selectionAsync().catch(() => {});
    if (!a.playing) a.togglePlay();
    onListen();
  };
  return (
    <GlowButton
      onPress={onPress}
      active={a.playing}
      height={compact ? 48 : 56}
      testID={testID}
      accessibilityLabel={t.deep_listen_ai}
      contentStyle={{ paddingLeft: compact ? 8 : 10, paddingRight: compact ? 16 : 20, gap: compact ? 9 : 11 }}
    >
      <GlowOrb size={compact ? 30 : 34}>
        {a.buffering ? (
          <ActivityIndicator size="small" color={colors.surface} />
        ) : (
          <Ionicons
            name={a.playing ? "pause" : "play"}
            size={compact ? 14 : 16}
            color={colors.surface}
            style={a.playing ? undefined : { marginLeft: 2 }}
          />
        )}
      </GlowOrb>
      <Text
        style={{
          color: colors.textWarm,
          fontFamily: typography.bodyBold,
          fontSize: compact ? 13.5 : 15,
          letterSpacing: 0.3,
        }}
      >
        {compact ? t.audio_listen_short : t.deep_listen_ai}
      </Text>
    </GlowButton>
  );
}

// Renders the full AudioCard inline at the top of the deep-dive; publishes
// its screen position so the floating mini knows when to appear.
export function InFlowAudioCard({ testID = "deep-dive-audio-player" }: { testID?: string }) {
  const placeholderRef = useRef<View>(null);
  const measuredRef = useRef(false);
  const { cardScreenYSV, cardHeightSV } = useAudio();

  const onLayout = (e: LayoutChangeEvent) => {
    const { height } = e.nativeEvent.layout;
    if (height > 0) cardHeightSV.value = height;
    if (measuredRef.current) return;
    setTimeout(() => {
      const node = placeholderRef.current as any;
      if (!node || typeof node.measure !== "function") return;
      node.measure((_x: number, _y: number, _w: number, h: number, _pageX: number, pageY: number) => {
        if (pageY == null || !isFinite(pageY)) return;
        measuredRef.current = true;
        cardScreenYSV.value = pageY;
        if (h > 0) cardHeightSV.value = h;
      });
    }, 40);
  };

  return (
    <View ref={placeholderRef} onLayout={onLayout} style={{ marginTop: spacing.sm }}>
      <AudioCard testID={testID} />
    </View>
  );
}
