// PAUSE — cover of a story wherever a hero image appears (home card, preview,
// deep-dive, thumbnails). Uses the photo when the story has one, otherwise a
// branded gradient tinted with the category colour and its icon.
import { View, StyleSheet, StyleProp, ViewStyle } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@react-native-vector-icons/ionicons";

import { StoryPreview, hasHero, heroUrl } from "@/src/api";
import { makeStyles, spacing } from "@/src/theme";

export function StoryHero({
  story, style, iconSize = 64, transition = 200, size = "hero",
}: {
  story: StoryPreview;
  style?: StyleProp<ViewStyle>;
  iconSize?: number;
  transition?: number;
  /** "thumb" requests the ≤600px variant for list thumbnails. */
  size?: "hero" | "thumb";
}) {
  const styles = useStyles();
  if (hasHero(story)) {
    return (
      <Image
        source={{ uri: heroUrl(story, size) }} style={style} contentFit="cover" transition={transition}
        cachePolicy="memory-disk" recyclingKey={`${story.id}:${size}`}
      />
    );
  }
  const color = story.category_color;
  return (
    <View style={[styles.wrap, style]}>
      <LinearGradient
        colors={[color + "66", color + "22", "transparent"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.orb, { backgroundColor: color + "22", borderColor: color + "55", boxShadow: `0px 0px 24px ${color}80` }]}>
        <Ionicons name={story.category_icon as any} size={iconSize} color={color} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: colors.surfaceTertiary,
  },
  orb: {
    alignItems: "center",
    justifyContent: "center",
    aspectRatio: 1,
    padding: spacing.lg,
    borderRadius: 999,
    borderWidth: 1,
  },
}));
