// PAUSE — BookPager: a clean horizontal slide between chapters. Each page moves
// as one sheet — no stacking, dimming, shadow or haptics — calm and predictable.
// Sheets are transparent: the reader keeps its cover fixed behind the pager,
// so only the page content moves.
// Same interface as `Pager` so screens can swap one for the other.
import { forwardRef, useImperativeHandle, useState, useRef, ReactNode, useEffect, createContext, useContext } from "react";
import { View, StyleSheet, LayoutChangeEvent, StyleProp, ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, runOnJS, Easing, interpolate, Extrapolation, SharedValue,
} from "react-native-reanimated";
import type { PagerHandle } from "@/src/components/pager";

const TURN_MS = 420;
// Decelerazione morbida: parte deciso e si posa senza scatti.
const TURN_EASING = Easing.bezier(0.22, 1, 0.36, 1);
const SWIPE_FRACTION = 0.22; // how far you must drag before the page commits
const SWIPE_VELOCITY = 450;

type Props = {
  pages: ReactNode[];
  page: number;
  onPageChange: (index: number) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

// Lets page content react to the turn (e.g. a parallax backdrop): `index` is
// this sheet's page, `pos` the continuous pager position (shared value).
const SheetContext = createContext<{ index: number; pos: SharedValue<number> } | null>(null);
export const useSheet = () => useContext(SheetContext);

export const BookPager = forwardRef<PagerHandle, Props>(function BookPager(
  { pages, page, onPageChange, style, testID }, ref,
) {
  const count = pages.length;
  const [width, setWidth] = useState(0);
  // Continuous position: 2.35 = page 2 turned 35% towards page 3.
  const pos = useSharedValue(page);
  const startPos = useSharedValue(page);
  const settled = useRef(page);

  const commit = (index: number) => {
    if (index !== settled.current) {
      settled.current = index;
      onPageChange(index);
    }
  };

  const turnTo = (index: number, animated = true) => {
    "worklet";
    const target = Math.max(0, Math.min(count - 1, Math.round(index)));
    if (!animated) {
      pos.value = target;
      runOnJS(commit)(target);
      return;
    }
    runOnJS(commit)(target);
    pos.value = withTiming(target, { duration: TURN_MS, easing: TURN_EASING });
  };

  useImperativeHandle(ref, () => ({
    goTo: (index, animated = true) => turnTo(index, animated),
  }));

  // Keep in sync if the parent moves the page programmatically (e.g. resume).
  useEffect(() => {
    if (page !== settled.current) {
      settled.current = page;
      pos.value = page;
    }
  }, [page, pos]);

  const pan = Gesture.Pan()
    // Activate early on horizontal intent and never fail on a little vertical
    // wobble, so a slightly diagonal swipe still turns the page reliably.
    .activeOffsetX([-10, 10])
    .onStart(() => {
      startPos.value = pos.value;
    })
    .onUpdate((e) => {
      if (!width) return;
      const next = startPos.value - e.translationX / width;
      // Resist at both covers.
      pos.value = Math.max(-0.1, Math.min(count - 1 + 0.1, next));
    })
    .onEnd((e) => {
      if (!width) return;
      const delta = pos.value - startPos.value;
      const base = Math.round(startPos.value);
      let target = base;
      if (delta > SWIPE_FRACTION || (e.velocityX < -SWIPE_VELOCITY && delta > 0.02)) target = base + 1;
      else if (delta < -SWIPE_FRACTION || (e.velocityX > SWIPE_VELOCITY && delta < -0.02)) target = base - 1;
      turnTo(target);
    });

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w && w !== width) setWidth(w);
  };

  return (
    <GestureDetector gesture={pan}>
      <View style={[styles.fill, style]} onLayout={onLayout} testID={testID}>
        {width > 0
          // Simple carousel: each sheet is translated by its distance from the
          // current position, so pages slide horizontally as one clean unit.
          ? pages.map((p, i) => (
              <Sheet key={i} index={i} pos={pos} width={width}>
                {p}
              </Sheet>
            ))
          : null}
      </View>
    </GestureDetector>
  );
});

function Sheet({ index, pos, width, children }: { index: number; pos: SharedValue<number>; width: number; children: ReactNode }) {

  // Refined reading turn: the page tracks the finger 1:1 (responsive), while it
  // eases in with a soft cross-fade and a whisper of depth — the arriving page
  // grows from 0.95→1 and brightens, the leaving one recedes and dims. No
  // stacking, veil, shadow or haptics: calm and elegant.
  const sheetStyle = useAnimatedStyle(() => {
    const d = index - pos.value;                 // 0 = in focus, ±1 = neighbour
    const abs = Math.min(1, Math.abs(d));
    const visible = d > -1.04 && d < 1.04;
    return {
      opacity: visible ? interpolate(abs, [0, 0.6, 1], [1, 0.55, 0], Extrapolation.CLAMP) : 0,
      transform: [
        { translateX: d * width },
        { scale: interpolate(abs, [0, 1], [1, 0.95], Extrapolation.CLAMP) },
      ],
    };
  });

  return (
    <Animated.View style={[styles.sheet, { width }, sheetStyle]}>
      <SheetContext.Provider value={{ index, pos }}>{children}</SheetContext.Provider>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, overflow: "hidden" },
  sheet: { position: "absolute", top: 0, bottom: 0, left: 0 },
});
