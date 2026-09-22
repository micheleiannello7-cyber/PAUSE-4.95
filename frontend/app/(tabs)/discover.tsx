import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { View, Text, Pressable, ActivityIndicator, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useFocusEffect } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { api, StoryPreview } from "@/src/api";
import { makeStyles, useTheme, spacing, radius, typography } from "@/src/theme";
import { useUserId } from "@/src/session";
import { LimitBadge } from "@/src/components/limit-badge";
import { getReadingProgress, ReadingProgress } from "@/src/reading-progress";
import { PauseLogo } from "@/src/components/pause-logo";
import { GradientButton } from "@/src/components/gradient-button";
import { StoryHero } from "@/src/components/story-hero";
import { GlassSurface } from "@/src/components/glass";
import { HomeCategoryTile } from "@/src/components/home-controls";
import { HomeStoryDeck } from "@/src/components/home-story-deck";
import { useI18n } from "@/src/i18n";

export default function Discover() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const userId = useUserId();
  const { t, lang } = useI18n();
  const styles = useStyles();
  const { colors } = useTheme();
  const { data: userState } = useQuery({
    queryKey: ["user", userId], queryFn: () => api.user(userId!), enabled: !!userId,
  });
  const interests = useMemo(() => userState?.interests?.filter((i) => i !== "all") ?? [], [userState?.interests]);
  const [focusCat, setFocusCat] = useState<string | null>(null);
  const deckInterests = useMemo(() => focusCat ? [focusCat] : interests, [focusCat, interests]);
  const interestsKey = deckInterests.join(",");
  const ready = !!userId && !!userState;
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: api.categories });

  const [resume, setResume] = useState<ReadingProgress | null>(null);
  useFocusEffect(useCallback(() => {
    if (!userId) return;
    getReadingProgress(userId).then(setResume);
  }, [userId]));
  const showResume = !!resume && resume.progress < 0.95 && !userState?.completed_story_ids?.includes(resume.story.id);

  const [deck, setDeck] = useState<StoryPreview[]>([]);
  const [cursor, setCursor] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const generation = useRef(0);
  const audienceKey = useRef<string | null>(null);
  const resetDeck = useCallback(() => {
    generation.current += 1;
    setDeck([]);
    setCursor(0);
    setLoading(false);
    setExhausted(false);
    setError(false);
  }, []);

  const loadMore = useCallback(async (excludeIds: string[]) => {
    if (!userId) return;
    const requestGeneration = generation.current;
    setLoading(true);
    try {
      const story = await api.discoverNext(userId, deckInterests, excludeIds);
      // A slow response from an old topic must not overwrite a freshly selected filter.
      if (requestGeneration !== generation.current) return;
      setDeck((prev) => prev.some((item) => item.id === story.id) ? prev : [...prev, story]);
      setError(false);
    } catch {
      if (requestGeneration !== generation.current) return;
      if (excludeIds.length === 0) setError(true);
      else setExhausted(true);
    } finally {
      if (requestGeneration === generation.current) setLoading(false);
    }
  }, [userId, deckInterests]);

  useEffect(() => {
    if (!ready) return;
    const currentKey = `${userId}|${interestsKey}|${lang}`;
    if (audienceKey.current !== currentKey) {
      audienceKey.current = currentKey;
      resetDeck();
      return;
    }
    if (exhausted || loading || error) return;
    if (deck.length === 0 || cursor >= deck.length - 1) void loadMore(deck.map((s) => s.id));
  }, [ready, userId, interestsKey, lang, exhausted, loading, error, deck, cursor, loadMore, resetDeck]);

  const tileCats = useMemo(() => {
    const all = categories ?? [];
    const mine = interests.length ? all.filter((c) => interests.includes(c.id)) : all;
    return mine.length ? mine : all;
  }, [categories, interests]);
  const showEmpty = deck.length === 0 && (exhausted || (error && !loading));
  const openStory = useCallback((story: StoryPreview) => router.push(`/deep-dive/${story.id}?start=1`), [router]);

  return (
    <View testID="home-screen" style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <PauseLogo />
        <LimitBadge testID="home-limit-badge" />
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} bounces={false}>
        {showResume && resume ? <ResumeCard progress={resume} onPress={() => router.push(`/deep-dive/${resume.story.id}`)} /> : null}
        {showEmpty ? (
          <View testID="discover-empty" style={styles.empty}>
            <Ionicons name="checkmark-circle-outline" size={44} color={colors.success} />
            <Text testID="discover-empty-title" style={styles.emptyTitle}>{t.explored_all}</Text>
            <Text testID="discover-empty-message" style={styles.emptyText}>{t.explored_all_sub}</Text>
            <GradientButton label={t.restart} icon="refresh" onPress={resetDeck} testID="reset-skipped" style={styles.resetBtn} />
          </View>
        ) : deck[cursor] ? (
          <HomeStoryDeck deck={deck} cursor={cursor} onChange={setCursor} onOpen={openStory} />
        ) : (
          <View testID="discover-loading" style={styles.loading}><ActivityIndicator color={colors.brand} /></View>
        )}
        {tileCats.length ? (
          <View style={styles.catsSection} testID="home-categories">
            <View style={styles.catsHead}>
              <Text testID="home-categories-title" style={styles.catsTitle}>{t.your_categories}</Text>
              <Pressable onPress={() => router.push("/(tabs)/explore")} style={styles.seeAll} testID="home-see-all" accessibilityRole="button">
                <Text style={styles.seeAllText}>{t.see_all}</Text>
                <Ionicons name="chevron-forward-outline" size={14} color={colors.muted} />
              </Pressable>
            </View>
            <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catsRow} testID="home-category-list">
              {tileCats.map((cat) => <HomeCategoryTile key={cat.id} cat={cat} active={focusCat === cat.id} onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setFocusCat((prev) => prev === cat.id ? null : cat.id);
              }} />)}
            </ScrollView>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function ResumeCard({ progress, onPress }: { progress: ReadingProgress; onPress: () => void }) {
  const { t } = useI18n();
  const styles = useStyles();
  const { colors } = useTheme();
  const pct = Math.round(progress.progress * 100);
  return (
    <Pressable onPress={onPress} testID="resume-reading-card" accessibilityRole="button" style={({ pressed }) => [styles.resumeWrap, pressed && styles.pressed]}>
      <GlassSurface intensity="strong" glow glowColor={colors.cyanGlow} radiusOverride={radius.lg}>
        <View style={styles.resumeInner}>
          <View style={styles.resumeThumbWrap}>
            <StoryHero story={progress.story} style={styles.resumeThumb} iconSize={26} size="thumb" />
            <View style={styles.resumeThumbGlow} />
          </View>
          <View style={styles.resumeInfo}>
            <View style={styles.resumeEyebrowRow}>
              <Ionicons name="book" size={11} color={colors.cyan} />
              <Text testID="resume-reading-label" style={styles.resumeEyebrow}>{t.resume_eyebrow}</Text>
              <View style={styles.resumePctPill}><Text testID="resume-reading-progress" style={styles.resumePctText}>{pct}%</Text></View>
            </View>
            <Text testID="resume-reading-title" style={styles.resumeTitle} numberOfLines={1}>{progress.story.title}</Text>
            <View style={styles.resumeTrack}>
              <LinearGradient colors={[colors.cyan, colors.cyanSoft]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.resumeFill, { width: `${Math.max(pct, 4)}%` }]} />
            </View>
          </View>
          <View style={styles.resumePlayWrap}><Ionicons name="play" size={16} color={colors.cyan} /></View>
        </View>
      </GlassSurface>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  scroll: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  catsSection: { marginTop: spacing.sm },
  catsHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  catsTitle: { color: colors.onSurface, fontFamily: typography.displayBold, fontSize: 16 },
  seeAll: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 3 },
  seeAllText: { color: colors.muted, fontFamily: typography.bodyMedium, fontSize: 12 },
  catsRow: { gap: spacing.sm, paddingBottom: 2 },
  loading: { flex: 1, minHeight: 320, alignItems: "center", justifyContent: "center" },
  resumeWrap: { marginBottom: spacing.lg },
  pressed: { opacity: 0.92 },
  resumeInner: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.sm, paddingRight: spacing.md },
  resumeThumbWrap: { position: "relative" },
  resumeThumb: { width: 58, height: 58, borderRadius: radius.md, overflow: "hidden" },
  resumeThumbGlow: { position: "absolute", top: -1, left: -1, right: -1, bottom: -1, borderRadius: radius.md + 1, borderWidth: 1, borderColor: colors.cyan + "55" },
  resumeInfo: { flex: 1, gap: 6 },
  resumeEyebrowRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  resumeEyebrow: { color: colors.cyan, fontFamily: typography.bodyBold, fontSize: 9, letterSpacing: 1.5 },
  resumePctPill: { marginLeft: "auto", paddingHorizontal: 8, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: colors.cyanGlowSoft, borderWidth: 1, borderColor: colors.cyan + "40" },
  resumePctText: { color: colors.cyan, fontFamily: typography.bodyBold, fontSize: 10 },
  resumeTitle: { color: colors.onSurface, fontFamily: typography.bodyBold, fontSize: 14, lineHeight: 18 },
  resumeTrack: { height: 4, borderRadius: 2, backgroundColor: colors.track, overflow: "hidden" },
  resumeFill: { height: "100%", borderRadius: 2 },
  resumePlayWrap: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.cyanGlowSoft, borderWidth: 1, borderColor: colors.cyan + "55", marginLeft: spacing.xs },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 48, gap: spacing.md },
  emptyTitle: { color: colors.onSurface, fontFamily: typography.displayBold, fontSize: 18 },
  emptyText: { color: colors.muted, fontFamily: typography.body, fontSize: 14, textAlign: "center", lineHeight: 20, paddingHorizontal: spacing.lg },
  resetBtn: { alignSelf: "stretch", marginTop: spacing.sm },
}));