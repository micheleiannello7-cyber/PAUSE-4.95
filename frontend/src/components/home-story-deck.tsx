import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { View, Text, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation, Easing, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming,
  type SharedValue,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { StoryPreview } from "@/src/api";
import { makeStyles, typography } from "@/src/theme";
import { useI18n } from "@/src/i18n";
import { CoachTip } from "@/src/coach-tips";
import { HomeStoryCard } from "./home-story-card";
import { HomeNavButton } from "./home-controls";
import { PagerDots } from "./pager";

type Props = { deck: StoryPreview[]; cursor: number; onChange: (index: number) => void; onOpen: (story: StoryPreview) => void };
const MAX_DOTS = 8;
const OFFSET = 16;

export function HomeStoryDeck({ deck, cursor, onChange, onOpen }: Props) {
  const styles = useStyles();
  const { t, lang } = useI18n();
  const { width } = useWindowDimensions();
  const position = useSharedValue(cursor);
  const tx = useSharedValue(0);
  const busy = useSharedValue(false);
  const moving = useRef(false);
  const mounted = useRef(true);
  const [animating, setAnimating] = useState(false);
  const canPrev = cursor > 0;
  const canNext = cursor < deck.length - 1;
  const finish = useCallback((target: number) => {
    if (mounted.current) onChange(target);
  }, [onChange]);

  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancelAnimation(tx);
    };
  }, [tx]);

  useLayoutEffect(() => {
    // Unlock only after React has committed the newly active card and its neighbours.
    moving.current = false;
    busy.value = false;
    setAnimating(false);
  }, [cursor, busy]);

  const move = useCallback((direction: number) => {
    const target = cursor + direction;
    if (moving.current || target < 0 || target >= deck.length) return;
    moving.current = true;
    busy.value = true;
    setAnimating(true);
    Haptics.selectionAsync().catch(() => {});
    tx.value = withTiming(-direction * width, { duration: 240, easing: Easing.bezier(0.22, 1, 0.36, 1) }, (finished) => {
      if (!finished) return;
      // Atomic UI-thread hand-off: the incoming, already mounted story becomes
      // active in the SAME frame as the offset resets. Never reset an old card.
      position.value = target;
      tx.value = 0;
      runOnJS(finish)(target);
    });
  }, [cursor, deck.length, width, busy, tx, position, finish]);

  const open = useCallback(() => {
    if (!moving.current && deck[cursor]) onOpen(deck[cursor]);
  }, [deck, cursor, onOpen]);

  const gesture = useMemo(() => {
    const pan = Gesture.Pan().activeOffsetX([-8, 8]).failOffsetY([-16, 16])
      .onStart(() => { if (!busy.value) cancelAnimation(tx); })
      .onUpdate((e) => {
        if (busy.value) return;
        const blocked = (e.translationX > 0 && !canPrev) || (e.translationX < 0 && !canNext);
        tx.value = e.translationX * (blocked ? 0.2 : 1);
      })
      .onEnd((e) => {
        if (busy.value) return;
        if (canNext && (e.translationX < -55 || e.velocityX < -450)) runOnJS(move)(1);
        else if (canPrev && (e.translationX > 55 || e.velocityX > 450)) runOnJS(move)(-1);
        else tx.value = withSpring(0, { damping: 22, stiffness: 220 });
      })
      .onFinalize((_e, success) => {
        if (!success && !busy.value) tx.value = withSpring(0, { damping: 22, stiffness: 220 });
      });
    const tap = Gesture.Tap().maxDistance(10).maxDuration(400)
      .onEnd((_e, success) => { if (success && !busy.value) runOnJS(open)(); });
    return Gesture.Race(pan, tap);
  }, [busy, tx, canNext, canPrev, move, open]);

  const start = Math.max(0, cursor - 1);
  return (
    <View style={styles.container} testID="home-story-deck">
      <View style={styles.deck}>
        <GestureDetector gesture={gesture}>
          <View style={styles.gestureSurface} testID="discover-swipe-area" collapsable={false}>
            {deck.slice(start, cursor + 2).map((story, offset) => (
              <StoryLayer key={story.id} story={story} index={start + offset} active={start + offset === cursor}
                position={position} tx={tx} width={width} onOpen={open} />
            ))}
          </View>
        </GestureDetector>
        <CoachTip id="home" text={t.tip_home} icon="hand-left-outline" style={styles.tip} />
      </View>
      <View style={styles.navigation}>
        <HomeNavButton direction="prev" disabled={!canPrev || animating} onPress={() => move(-1)} label={lang === "it" ? "Storia precedente" : "Previous story"} />
        <View style={styles.hint}>
          <PagerDots count={Math.min(deck.length, MAX_DOTS)} index={cursor - Math.max(0, Math.min(cursor - (MAX_DOTS - 2), deck.length - MAX_DOTS))} testID="discover-deck-dots" />
          <Text testID="discover-swipe-hint" style={styles.hintText}>{t.swipe_hint}</Text>
        </View>
        <HomeNavButton direction="next" disabled={!canNext || animating} onPress={() => move(1)} label={lang === "it" ? "Storia successiva" : "Next story"} />
      </View>
    </View>
  );
}

function StoryLayer({ story, index, active, position, tx, width, onOpen }: {
  story: StoryPreview; index: number; active: boolean; position: SharedValue<number>;
  tx: SharedValue<number>; width: number; onOpen: () => void;
}) {
  const styles = useStyles();
  const animatedStyle = useAnimatedStyle(() => {
    const relative = index - position.value;
    const current = relative === 0;
    const incoming = (relative === 1 && tx.value <= 0) || (relative === -1 && tx.value > 0);
    const progress = Math.min(Math.abs(tx.value) / width, 1);
    return {
      zIndex: current ? 3 : incoming ? 2 : 0,
      opacity: current || incoming ? 1 : 0,
      transform: [
        { translateX: current ? tx.value : 0 },
        { translateY: current ? 0 : (1 - progress) * OFFSET },
        { scale: current ? 1 : 0.96 + 0.04 * progress },
        { rotateZ: current ? `${(tx.value / width) * 3}deg` : "0deg" },
      ],
    };
  });
  return (
    <Animated.View
      testID={`deck-layer-${story.id}`} style={[styles.layer, animatedStyle]}
      pointerEvents={active ? "auto" : "none"} accessible={active}
      accessibilityElementsHidden={!active} importantForAccessibility={active ? "yes" : "no-hide-descendants"}
      accessibilityRole="button" accessibilityLabel={story.title} onAccessibilityTap={onOpen}
    >
      <HomeStoryCard story={story} active={active} onOpen={onOpen} />
    </Animated.View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1 },
  deck: { flex: 1, minHeight: 352, maxHeight: 640, overflow: "hidden" },
  gestureSurface: { flex: 1 },
  layer: { position: "absolute", top: 0, left: 0, right: 0, bottom: OFFSET },
  tip: { top: 52 },
  navigation: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 },
  hint: { flex: 1, alignItems: "center", gap: 7 },
  hintText: { color: colors.muted, fontFamily: typography.bodyMedium, fontSize: 11 },
}));