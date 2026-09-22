// PAUSE — Story audio player: bottom sheet + circular trigger button used by
// the deep-dive header (opens the sheet with the full AudioCard inside).

import React from "react";
import { View, Text, Pressable, ActivityIndicator, Modal, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { spacing, typography, useTheme } from "@/src/theme";
import { useI18n } from "@/src/i18n";
import { GlowButton, GlowOrb } from "@/src/components/glass";

import { useAudio } from "./context";
import { AudioCard } from "./audio-card";
import { fmt } from "./constants";
import { useStyles } from "./styles";

// Bottom sheet della narrazione: si apre dal tastino "cuffie" accanto al
// capitolo e contiene il player completo (voce, velocità, ±10s, offline).
export function AudioSheet({ visible, onClose, testID = "audio-sheet" }: { visible: boolean; onClose: () => void; testID?: string }) {
  const { t } = useI18n();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} testID="audio-sheet-backdrop" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} testID={testID}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHead}>
          <View style={styles.sheetTitleRow}>
            <Ionicons name="headset" size={16} color={colors.brand} />
            <Text style={styles.sheetTitle}>{t.audio_eyebrow}</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10} style={styles.sheetClose} testID="audio-sheet-close">
            <Ionicons name="close" size={18} color={colors.onSurface} />
          </Pressable>
        </View>
        <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
          <AudioCard testID="deep-dive-audio-player" />
        </ScrollView>
      </View>
    </Modal>
  );
}

// Pulsante "Ascolta" del capitolo: vetro cyan con glow morbido e disco
// luminoso per l'icona (play/pausa/caricamento). Apre il foglio del player.
export function AudioTrigger({ onPress, testID = "audio-trigger" }: { onPress: () => void; testID?: string }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const a = useAudio();
  return (
    <GlowButton
      onPress={onPress}
      active={a.playing}
      height={40}
      testID={testID}
      accessibilityLabel={t.audio_eyebrow}
      contentStyle={{ paddingLeft: 6, paddingRight: 14, gap: 8 }}
    >
      <GlowOrb size={28}>
        {a.buffering ? (
          <ActivityIndicator size="small" color={colors.surface} />
        ) : (
          <Ionicons name={a.playing ? "pause" : "play"} size={13} color={colors.surface} style={a.playing ? undefined : { marginLeft: 2 }} />
        )}
      </GlowOrb>
      <Text style={{ color: colors.textWarm, fontFamily: typography.bodyBold, fontSize: 12.5, letterSpacing: 0.3 }}>
        {a.playing ? fmt(a.position) : t.audio_listen_short}
      </Text>
    </GlowButton>
  );
}
