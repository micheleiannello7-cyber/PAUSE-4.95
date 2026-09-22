// PAUSE — navigazione del lettore in vetro. Rule sottile, segmenti dei
// capitoli (attivo con gradiente cyan luminoso), etichetta "Capitolo N di M"
// e due frecce vetro con leggero glow. Coerente con il pulsante "Ascolta".
import { View, Text, StyleProp, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@react-native-vector-icons/ionicons";

import { makeStyles, useTheme, spacing, typography, withAlpha } from "@/src/theme";
import { GlassIconButton } from "@/src/components/glass";

type Props = {
  count: number;
  index: number;
  onPrev: () => void;
  onNext: () => void;
  /** Sull'ultima pagina la freccia avanti resta attiva e chiama questo. */
  onEndNext?: () => void;
  label?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function ReaderNav({ count, index, onPrev, onNext, onEndNext, label, style, testID = "pager-nav" }: Props) {
  const s = useStyles();
  const { colors } = useTheme();
  const canPrev = index > 0;
  const atEnd = index >= count - 1;
  const canNext = !atEnd || !!onEndNext;
  const segW = count > 6 ? 8 : 14;

  return (
    <View style={[s.wrap, style]} testID={testID}>
      <GlassIconButton
        onPress={onPrev}
        disabled={!canPrev}
        size={34}
        testID="pager-prev"
        hitSlop={12}
      >
        <Ionicons name="chevron-back" size={17} color={colors.textWarmSecondary} />
      </GlassIconButton>

      {/* Centro: indicatore minimal luminoso + etichetta secondaria. */}
      <View style={s.center}>
        <View style={s.segments} testID="pager-dots" accessibilityLabel={`${index + 1} / ${count}`}>
          {Array.from({ length: count }, (_, i) =>
            i === index ? (
              <View key={i} style={s.segActiveWrap}>
                <LinearGradient
                  colors={[colors.cyan, colors.cyanSoft]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[s.seg, s.segActive]}
                  testID="pager-dot-active"
                />
              </View>
            ) : (
              <View key={i} style={[s.seg, { width: segW }, i < index && s.segDone]} />
            ),
          )}
        </View>
        {label ? <Text style={s.label} numberOfLines={1} testID="deep-dive-page-label">{label}</Text> : null}
      </View>

      <GlassIconButton
        onPress={atEnd && onEndNext ? onEndNext : onNext}
        disabled={!canNext}
        size={34}
        testID="pager-next"
        hitSlop={12}
        active={atEnd && !!onEndNext}
      >
        <Ionicons
          name={atEnd && onEndNext ? "arrow-forward" : "chevron-forward"}
          size={17}
          color={atEnd && onEndNext ? colors.cyan : colors.textWarmSecondary}
        />
      </GlassIconButton>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 40 },
  center: { flex: 1, alignItems: "center", gap: 7 },
  segments: { flexDirection: "row", alignItems: "center", gap: 5 },
  seg: { height: 3, borderRadius: 2, backgroundColor: withAlpha(colors.onSurface, 0.14) },
  segDone: { backgroundColor: withAlpha(colors.cyan, 0.38) },
  segActive: { width: 26 },
  segActiveWrap: {
    borderRadius: 2,
    boxShadow: `0px 0px 12px ${colors.cyanGlow}` as any,
  },
  label: {
    color: withAlpha(colors.textWarmSecondary, 0.62), fontFamily: typography.bodyMedium,
    fontSize: 10.5, letterSpacing: 1.8, textTransform: "uppercase",
  },
}));
