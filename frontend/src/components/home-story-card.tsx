import { View, Text, StyleSheet, useWindowDimensions } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { StoryPreview, isLesson } from "@/src/api";
import { makeStyles, radius, typography, useTheme } from "@/src/theme";
import { useI18n } from "@/src/i18n";
import { StoryHero } from "./story-hero";
import { HighlightedTitle } from "./highlighted-title";
import { GradientButton } from "./gradient-button";
import { CategoryIcon } from "./category-icon";

export function HomeStoryCard({ story, active, onOpen }: {
  story: StoryPreview; active: boolean; onOpen: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const { width } = useWindowDimensions();
  const id = `home-story-${story.id}`;
  const lesson = isLesson(story);
  const tint = lesson ? colors.warning : colors.cyanSoft;
  const titleSize = story.title.length > 65 ? 24 : story.title.length > 42 ? 28 : 30;
  const fontSize = width < 360 ? titleSize - 3 : titleSize;
  return (
    <View style={styles.card} testID={active ? `story-card-${story.id}` : `deck-card-${story.id}`}>
      {/* Each story keeps its own image instance; no image crossfade during a deck hand-off. */}
      <StoryHero story={story} style={StyleSheet.absoluteFill} iconSize={72} transition={0} />
      <LinearGradient
        colors={["rgba(5,7,12,0)", "rgba(5,7,12,0.25)", "rgba(5,7,12,0.7)", "rgba(5,7,12,0.96)"]}
        locations={[0.2, 0.42, 0.68, 1]} style={StyleSheet.absoluteFill}
      />
      <View style={styles.topRow}>
        <View testID={`${id}-kind`} style={[styles.badge, { borderColor: tint + "55" }]}>
          <Ionicons name={lesson ? "school-outline" : "bulb-outline"} size={13} color={tint} />
          <Text style={[styles.kindText, { color: tint }]}>{lesson ? t.lesson_badge : t.curiosity_badge}</Text>
        </View>
        <View testID={`${id}-duration`} style={styles.badge}>
          <Ionicons name="time-outline" size={13} color={colors.onGradient} />
          <Text style={styles.duration}>{story.reading_time_min} {t.min}</Text>
        </View>
      </View>
      <View style={styles.body}>
        <View testID={`${id}-category`} style={[styles.category, { borderColor: story.category_color + "55" }]}>
          <CategoryIcon categoryId={story.category_id} color={story.category_color} highlightColor={colors.onGradient} size={16} testID={`${id}-category-icon`} />
          <Text style={styles.categoryText} numberOfLines={1}>{story.category_name.split("·")[0].trim()}</Text>
        </View>
        <HighlightedTitle
          testID={`${id}-title`} title={story.title} highlight={story.highlight_words}
          style={[styles.title, { fontSize, lineHeight: fontSize + 6 }]}
          numberOfLines={4} adjustsFontSizeToFit minimumFontScale={0.8}
        />
        <View pointerEvents="none" style={styles.cta}>
          <GradientButton label={t.read_story} icon="book-outline" onPress={onOpen} testID={active ? "approfondisci-home" : `${id}-cta`} />
        </View>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: {
    flex: 1, borderRadius: radius.lg + 4, overflow: "hidden", justifyContent: "flex-end",
    backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.glassBorderStrong,
  },
  topRow: { position: "absolute", top: 16, left: 16, right: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  badge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 9, minHeight: 28, borderRadius: radius.sm, backgroundColor: colors.scrim, borderWidth: 1, borderColor: colors.glassBorderStrong },
  kindText: { fontFamily: typography.bodyBold, fontSize: 10, letterSpacing: 1 },
  duration: { color: colors.onGradient, fontFamily: typography.bodyMedium, fontSize: 12 },
  body: { padding: 20, gap: 12 },
  category: { alignSelf: "flex-start", maxWidth: "100%", flexDirection: "row", alignItems: "center", gap: 7, minHeight: 28, paddingHorizontal: 9, borderRadius: radius.sm, borderWidth: 1, backgroundColor: colors.scrim },
  categoryText: { flexShrink: 1, color: colors.onGradient, fontFamily: typography.bodyBold, fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase" },
  title: { color: colors.onGradient, fontFamily: typography.displayBold, letterSpacing: -0.5 },
  cta: { marginTop: 4 },
}));