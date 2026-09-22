import { Pressable, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Category } from "@/src/api";
import { makeStyles, radius, typography, useTheme, withAlpha } from "@/src/theme";
import { DirectionIcon, CategoryIcon } from "./category-icon";
import { CategoryArtwork } from "./category-artwork";

export function HomeCategoryTile({ cat, active, onPress }: {
  cat: Category; active: boolean; onPress: () => void;
}) {
  const styles = useStyles();
  return (
    <Pressable
      testID={`home-cat-${cat.id}`} onPress={onPress}
      accessibilityRole="button" accessibilityLabel={cat.name}
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [styles.tile, active && {
        borderColor: cat.color, backgroundColor: cat.color + "18",
      }, pressed && styles.pressed]}
    >
      <CategoryArtwork category={cat} testID={`home-category-art-${cat.id}`} compact cornerRadius={radius.md} />
      <View style={[styles.badge, { borderColor: withAlpha(cat.color, 0.6) }]} testID={`home-cat-badge-${cat.id}`}>
        <CategoryIcon categoryId={cat.id} color={cat.color} highlightColor={styles.tileName.color} size={13} testID={`home-cat-badge-icon-${cat.id}`} />
      </View>
      {active ? <View style={[styles.check, { backgroundColor: cat.color }]}><Ionicons testID={`home-cat-selected-${cat.id}`} name="checkmark" size={11} color={styles.checkGlyph.color} /></View> : null}
      <Text testID={`home-cat-label-${cat.id}`} style={styles.tileName} numberOfLines={2}>{cat.name}</Text>
    </Pressable>
  );
}

export function HomeNavButton({ direction, disabled, onPress, label }: {
  direction: "prev" | "next"; disabled: boolean; onPress: () => void; label: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress} disabled={disabled} testID={`discover-${direction}`}
      accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.arrow, disabled && styles.disabled, pressed && styles.pressed]}
    >
      <View pointerEvents="none" style={styles.highlight} />
      <DirectionIcon direction={direction} color={colors.onSurface} />
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  tile: {
    width: 88, height: 88, paddingBottom: 7, paddingHorizontal: 5,
    borderRadius: radius.md, backgroundColor: colors.surfaceSecondary,
    borderWidth: 1, borderColor: colors.glassBorderStrong, alignItems: "center", justifyContent: "flex-end", overflow: "hidden",
  },
  highlight: { position: "absolute", top: 0, left: 12, right: 12, height: 1, backgroundColor: colors.glassHighlight },
  check: { position: "absolute", top: 6, right: 6, width: 17, height: 17, borderRadius: 5, alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: 5, left: 5, width: 22, height: 22, borderRadius: 7, alignItems: "center", justifyContent: "center", borderWidth: 1.5, backgroundColor: colors.surface },
  checkGlyph: { color: colors.artworkSurface },
  tileName: { color: colors.onGradient, fontFamily: typography.bodyBold, fontSize: 12, lineHeight: 15, textAlign: "center" },
  arrow: {
    width: 48, height: 48, borderRadius: radius.md, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.glassBorderStrong,
  },
  pressed: { opacity: 0.75, transform: [{ scale: 0.96 }] },
  disabled: { opacity: 0.3 },
}));