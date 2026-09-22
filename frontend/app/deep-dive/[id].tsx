import { useRef, useCallback, useEffect, useState, ReactNode } from "react";
import {
  View, Text, StyleSheet, Pressable, ActivityIndicator, Share, useWindowDimensions,
  LayoutChangeEvent, StyleProp, ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withRepeat, Easing, SharedValue } from "react-native-reanimated";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";

import { api, Chapter, Story, heroUrl, isLesson } from "@/src/api";
import { makeStyles, useTheme, withAlpha, spacing, radius, typography, ThemeColors } from "@/src/theme";
import { useUserId } from "@/src/session";
import { useStoryActions } from "@/src/hooks/use-story-actions";
import { saveReadingProgress, clearReadingProgress, getReadingProgress, toStoryPreview } from "@/src/reading-progress";
import { HighlightedTitle } from "@/src/components/highlighted-title";
import { CategoryTag, MetaInline } from "@/src/components/reader-meta";
import { GradientButton } from "@/src/components/gradient-button";
import { LessonCover } from "@/src/components/lesson-cover";
import { KindBadge } from "@/src/components/kind-badge";
import { StoryAudioProvider, AudioSheet, AudioTrigger, IntroListenButton } from "@/src/components/story-audio-player";
import { PagerHandle } from "@/src/components/pager";
import { ReaderNav } from "@/src/components/reader-nav";
import { BookPager } from "@/src/components/book-pager";
import { Screen } from "@/src/components/screen";
import { StoryShareCard, SHARE_CARD_WIDTH } from "@/src/components/story-share-card";
import { GlassIconButton, AmbientGlow } from "@/src/components/glass";
import { useI18n } from "@/src/i18n";
import { CoachTip } from "@/src/coach-tips";

export default function DeepDive() {
  // `start=1` (dalla Home "Leggi la curiosità"): si apre direttamente sul
  // primo capitolo, senza la pagina introduttiva.
  const { id, start } = useLocalSearchParams<{ id: string; start?: string }>();
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const router = useRouter();
  const qc = useQueryClient();
  const userId = useUserId();
  const completedRef = useRef<string | null>(null);
  const pagerRef = useRef<PagerHandle>(null);
  const shareRef = useRef<View>(null);
  const startedAtRef = useRef<number>(Date.now());
  const [page, setPage] = useState(start === "1" ? 1 : 0);
  const [audioOpen, setAudioOpen] = useState(false);
  // Il progresso di lettura si salva solo dopo un vero gesto del lettore
  // (non per la pagina su cui si è aperta la storia automaticamente).
  const touchedRef = useRef(false);
  const changePage = (i: number) => { touchedRef.current = true; setPage(i); };
  const progressSV = useSharedValue(0);
  // Altezza della copertina fissa (sfuma dietro il titolo della pagina corrente).
  const coverH = useSharedValue(Math.round(winH * 0.55));
  const contentTops = useRef<Record<number, number>>({});
  const { t } = useI18n();
  const styles = useStyles();
  const { colors } = useTheme();
  const barStyle = useAnimatedStyle(() => ({ width: `${Math.min(1, progressSV.value) * 100}%` }));

  const { data: story, isLoading } = useQuery({
    queryKey: ["story", id],
    queryFn: () => api.story(id!),
    enabled: !!id,
  });
  const { data: user } = useQuery({
    queryKey: ["user", userId],
    queryFn: () => api.user(userId!),
    enabled: !!userId,
  });
  const { toggle } = useStoryActions(userId, id);

  // Pages: intro · one per chapter · closing ("Da ricordare" + next story).
  const pageCount = (story?.chapters.length ?? 0) + 2;
  const lastPage = pageCount - 1;

  // Resume the page the reader left this story at.
  useEffect(() => {
    if (!userId || !id || !story) return;
    getReadingProgress(userId).then((p) => {
      if (p && p.story.id === id && p.page > 0 && p.page < lastPage) {
        setPage(p.page);
        pagerRef.current?.goTo(p.page, false);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, id, !!story]);

  // Mark as completed once: when the reader reaches the last page (or taps "next").
  const markComplete = useCallback(async () => {
    if (!userId || !id || completedRef.current === id) return;
    completedRef.current = id;
    try {
      await clearReadingProgress(userId);
      const secs = Math.round((Date.now() - startedAtRef.current) / 1000);
      await api.complete(userId, id, story?.deep_dive_time_min ?? 2, secs);
      qc.invalidateQueries({ queryKey: ["user"] });
      qc.invalidateQueries({ queryKey: ["limit"] });
    } catch {}
  }, [userId, id, story?.deep_dive_time_min, qc]);

  // A curiosity is counted as soon as it's opened — but only after a 5s dwell,
  // so backing out within 5 seconds (misclick / quick peek) does NOT consume
  // one of the session's stories. Leaving the screen clears the timer.
  const markCompleteRef = useRef(markComplete);
  markCompleteRef.current = markComplete;
  useEffect(() => {
    if (!userId || !id) return;
    const timer = setTimeout(() => markCompleteRef.current(), 5000);
    return () => clearTimeout(timer);
  }, [userId, id]);

  // Narration is resolved lazily by the audio player (status → persistent
  // URL); nothing is generated until the listener taps play.

  useEffect(() => {
    if (!story) return;
    const progress = lastPage > 0 ? page / lastPage : 0;
    progressSV.value = withTiming(progress, { duration: 220 });
    if (page >= lastPage) {
      markComplete();
      return;
    }
    // Remember genuine mid-read positions only (skip the intro page).
    if (userId && page > 0 && touchedRef.current && completedRef.current !== id) {
      saveReadingProgress(userId, { story: toStoryPreview(story), page, progress, updatedAt: Date.now() });
    }
  }, [page, story, lastPage, userId, id, markComplete, progressSV]);

  // La copertina fissa sfuma dietro il titolo della pagina corrente (vedi
  // onContentTop più sotto): quando si sfoglia, il punto di dissolvenza si
  // sposta con dolcezza invece di far scorrere tutta la schermata.
  useEffect(() => {
    const y = contentTops.current[page];
    if (y != null) coverH.value = withTiming(y + COVER_OVERLAP, { duration: 420 });
  }, [page, coverH]);

  if (isLoading || !story) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  const bookmarked = user?.bookmarked_story_ids.includes(story.id) ?? false;
  const liked = user?.liked_story_ids.includes(story.id) ?? false;
  const minutesLabel = `${story.deep_dive_time_min} ${t.min}`;

  const onNext = async () => {
    await markComplete();
    try {
      // 5 storie → pausa di 4 ore: se il limite è scattato, mostra la schermata di pausa.
      if (userId) {
        const limit = await api.limitCheck(userId);
        if (limit.blocked) {
          router.replace("/pause-limit");
          return;
        }
      }
      const next = await api.nextStory(story.id, userId ?? undefined);
      router.replace(`/deep-dive/${next.id}`);
    } catch {}
  };

  // Share a ready-made image card (cover + title + hook + brand). Falls back
  // to a plain text share where image sharing isn't available (e.g. web).
  const onShare = async () => {
    try {
      if (shareRef.current && (await Sharing.isAvailableAsync())) {
        const uri = await captureRef(shareRef, { format: "png", quality: 1, result: "tmpfile" });
        await Sharing.shareAsync(uri, { dialogTitle: t.share, mimeType: "image/png", UTI: "public.png" });
        return;
      }
    } catch {}
    Share.share({ message: `${story.title} — ${t.share_suffix}` }).catch(() => {});
  };

  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)/discover"));
  const goTo = (i: number) => pagerRef.current?.goTo(Math.max(0, Math.min(lastPage, i)));

  // Il contenuto delle pagine è ancorato in basso, sopra la navigazione, e non
  // sale mai oltre questa quota (resta sotto i tasti in alto).
  const minTop = insets.top + 52 + spacing.xl;
  // Il suggerimento della mini-guida sta sotto i tasti in alto, sulla foto,
  // così non copre mai il testo del capitolo (ancorato in basso).
  const tipTop = insets.top + 56;
  // Etichetta editoriale ("Capitolo 1 di 6") dalle costanti maiuscole del dizionario.
  const sentence = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
  const pageLabel = sentence(
    page === 0
      ? t.deep_intro
      : page === lastPage
        ? t.remember
        : `${t.chapter} ${page} ${t.of} ${story.chapters.length}`,
  );

  // La copertina è fissa dietro le pagine: quando si sfoglia cambia solo il
  // testo. La sua sfumatura si adatta con dolcezza alla pagina corrente, così il
  // titolo resta sempre nella parte bassa dell'immagine.
  const onContentTop = (index: number, y: number) => {
    contentTops.current[index] = y;
    if (index === page) coverH.value = withTiming(y + COVER_OVERLAP, { duration: 420 });
  };

  const pages = [
    <ReaderSheet key="intro" index={0} minTop={minTop} glowColor={story.category_color} onContentTop={onContentTop} testID="deep-dive-page-intro">
      <View style={styles.metaRow}>
        <CategoryTag name={story.category_name} icon={story.category_icon} color={story.category_color} />
        <KindBadge story={story} overlay />
        <View style={styles.metaSpacer} />
        <MetaInline icon="time-outline" label={minutesLabel} testID="deep-dive-minutes" />
      </View>
      <HighlightedTitle title={story.title} highlight={story.highlight_words} highlightColor={colors.cyan} style={styles.readerTitle} />
      <Text style={styles.readerBody} numberOfLines={5}>{story.hook}</Text>
      <View style={styles.ctaRow}>
        <GradientButton label={t.deep_start} icon="book-outline" onPress={() => goTo(1)} testID="deep-dive-start" style={styles.ctaMain} />
        <IntroListenButton compact onListen={() => goTo(1)} />
      </View>
    </ReaderSheet>,
    ...story.chapters.map((c) => (
      <ChapterPage
        key={c.number}
        chapter={c}
        story={story}
        minTop={minTop}
        minutesLabel={minutesLabel}
        onContentTop={(y) => onContentTop(c.number, y)}
        onListen={() => setAudioOpen(true)}
      />
    )),
    <ReaderSheet key="end" index={lastPage} minTop={minTop} glowColor={colors.warning} onContentTop={onContentTop} testID="deep-dive-page-end">
      <View style={styles.metaRow}>
        <CategoryTag name={story.category_name} icon={story.category_icon} color={story.category_color} />
        <View style={styles.metaSpacer} />
        <MetaInline icon="time-outline" label={minutesLabel} />
      </View>
      <View style={styles.eyebrowRow} testID="summary-card">
        <Ionicons name="star" size={12} color={colors.warning} />
        <Text style={[styles.eyebrow, { color: colors.warning }]}>{t.remember}</Text>
      </View>
      <HighlightedTitle title={story.title} highlight={story.highlight_words} highlightColor={colors.cyan} style={styles.readerTitle} />
      <Text style={styles.readerBody}>{story.summary}</Text>
      {/* Fine storia: Mi piace, Condividi e Home come pillole leggere, poi il
          passo successivo in evidenza. */}
      <View style={styles.endActions} testID="deep-dive-actions">
        <Pressable
          onPress={() => toggle("like")}
          style={({ pressed }) => [styles.endBtn, liked && styles.endBtnActive, pressed && styles.endBtnPressed]}
          testID="like-button"
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t.i_like}
        >
          <Ionicons name={liked ? "heart" : "heart-outline"} size={18} color={liked ? colors.error : colors.onSurface} />
          <Text style={styles.endBtnLabel} numberOfLines={1}>{t.i_like}</Text>
        </Pressable>
        <Pressable
          onPress={onShare}
          style={({ pressed }) => [styles.endBtn, pressed && styles.endBtnPressed]}
          testID="share-story"
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t.share}
        >
          <Ionicons name="share-outline" size={18} color={colors.onSurface} />
          <Text style={styles.endBtnLabel} numberOfLines={1}>{t.share}</Text>
        </Pressable>
        <Pressable
          onPress={() => router.replace("/(tabs)/discover")}
          style={({ pressed }) => [styles.endBtn, styles.endBtnIcon, pressed && styles.endBtnPressed]}
          testID="back-home"
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t.back_home}
        >
          <Ionicons name="home-outline" size={18} color={colors.onSurface} />
        </Pressable>
      </View>
      <GradientButton label={t.next_story} icon="arrow-forward" onPress={onNext} testID="next-story" />
    </ReaderSheet>,
  ];

  return (
    <Screen style={styles.container}>
      {/* Fondo notte: dal nero al blu-notte verso il basso, per profondità. */}
      <LinearGradient
        colors={[colors.surface, colors.surfaceDeep]}
        locations={[0.35, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <ImmersiveCover story={story} heightSV={coverH} maxHeight={Math.round(winH * 0.82)} />
      <View style={[styles.progressTrack, { top: insets.top, pointerEvents: "none" }]}>
        <Animated.View style={[styles.progressFillWrap, barStyle]}>
          <LinearGradient colors={[colors.cyan, colors.cyanSoft]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.progressFill} />
        </Animated.View>
      </View>
      <StoryAudioProvider storyId={story.id}>
        <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
          <GlassIconButton
            onPress={goBack}
            testID="back-button"
            accessibilityLabel={t.back}
            size={40}
          >
            <Ionicons name="arrow-back" size={18} color={colors.onSurface} />
          </GlassIconButton>
          {/* In alto solo "Salva", su ogni pagina. Mi piace e Condividi stanno
              alla fine, nella pagina "Da ricordare". */}
          <GlassIconButton
            onPress={() => toggle("bookmark")}
            testID="bookmark-button"
            accessibilityLabel={t.save_verb}
            size={40}
            active={bookmarked}
          >
            <Ionicons name={bookmarked ? "bookmark" : "bookmark-outline"} size={17} color={bookmarked ? colors.cyan : colors.onSurface} />
          </GlassIconButton>
        </View>

        <BookPager ref={pagerRef} pages={pages} page={page} onPageChange={changePage} testID="deep-dive-pager" />

        {/* Fermo sotto le pagine: solo la navigazione minimale. */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
          <ReaderNav
            count={pageCount}
            index={page}
            label={pageLabel}
            onPrev={() => goTo(page - 1)}
            // Sull'ultima pagina la freccia avanti porta alla prossima storia.
            onNext={() => goTo(page + 1)}
            onEndNext={onNext}
          />
        </View>
        {page === 1 ? (
          <CoachTip id="reader" text={t.tip_reader} icon="book-outline" style={{ top: tipTop }} />
        ) : null}
        <AudioSheet visible={audioOpen} onClose={() => setAudioOpen(false)} />
      </StoryAudioProvider>
      {/* Off-screen share card, captured as PNG on demand. */}
      <View style={styles.shareHidden}>
        <View ref={shareRef} collapsable={false}>
          <StoryShareCard story={story} />
        </View>
      </View>
    </Screen>
  );
}

// Copertina immersiva, fissa dietro le pagine: la foto (o la copertina di
// categoria per le mini lezioni) "respira" con uno zoom lentissimo e sfuma nel
// fondo pagina con un gradiente lungo e morbido. L'altezza è animata: la foto
// resta ferma (ritagliata dall'alto), si sposta solo il punto in cui svanisce.
const COVER_OVERLAP = 290;
function ImmersiveCover({ story, heightSV, maxHeight }: { story: Story; heightSV: SharedValue<number>; maxHeight: number }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const hasCover = !!story.hero_image_generated || (!isLesson(story) && !!story.hero_image);
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withRepeat(withTiming(1.07, { duration: 11000, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [scale]);
  const box = useAnimatedStyle(() => ({ height: heightSV.value }));
  const breathe = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={[styles.cover, box, { pointerEvents: "none" }]} testID="chapter-cover-bg">
      <Animated.View style={[styles.coverImage, { height: maxHeight }, breathe]}>
        {hasCover ? (
          <Image source={{ uri: heroUrl(story) }} style={StyleSheet.absoluteFill} contentFit="cover" transition={400} cachePolicy="memory-disk" />
        ) : (
          <LessonCover color={story.category_color} icon={story.category_icon} iconSize={72} showBadge={false} style={StyleSheet.absoluteFill} />
        )}
      </Animated.View>
      {/* Tinta notte: porta ogni foto verso la stessa temperatura blu-notte. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.nightTint }]} />
      {/* Fusione cinematica: immagine → immagine scurita → immagine + nero →
          fondo pagina. Lunga e morbida, senza mai una linea netta. La parte
          bassa della foto resta percepibile dietro il titolo. */}
      <LinearGradient
        colors={[
          withAlpha(colors.surface, 0.30),
          withAlpha(colors.surface, 0),
          withAlpha(colors.surface, 0.10),
          withAlpha(colors.surface, 0.30),
          withAlpha(colors.surface, 0.52),
          withAlpha(colors.surface, 0.72),
          withAlpha(colors.surface, 0.88),
          withAlpha(colors.surface, 0.97),
          colors.surface,
        ]}
        locations={[0, 0.16, 0.36, 0.50, 0.62, 0.74, 0.85, 0.94, 1]}
        style={StyleSheet.absoluteFill}
      />
      {/* Luce ambientale del colore della categoria che sale dal basso: è la
          "luce dell'immagine" che illumina il vetro dei controlli. */}
      <LinearGradient
        colors={["transparent", withAlpha(story.category_color, 0.10)]}
        locations={[0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

// Foglio di lettura: contenuto trasparente ancorato in basso, sopra la
// navigazione. Comunica al lettore dove comincia (y), così la copertina fissa
// sfuma esattamente dietro il titolo, anche quando il testo è breve.
function ReaderSheet({
  index, minTop, glowColor, onContentTop, onPageLayout, onContentLayout, contentStyle, children, testID,
}: {
  index: number;
  minTop: number;
  glowColor?: string;
  onContentTop: (index: number, y: number) => void;
  onPageLayout?: (e: LayoutChangeEvent) => void;
  onContentLayout?: (e: LayoutChangeEvent) => void;
  contentStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
  testID?: string;
}) {
  const styles = useStyles();
  return (
    <View style={[styles.pageFill, styles.readerPage, { paddingTop: minTop }]} onLayout={onPageLayout} testID={testID}>
      <View
        style={[styles.readerInner, contentStyle]}
        onLayout={(e) => { onContentTop(index, e.nativeEvent.layout.y); onContentLayout?.(e); }}
      >
        {/* Sorgente di luce diffusa dietro categoria e titolo: profondità. */}
        {glowColor ? <AmbientGlow color={glowColor} alpha={0.14} size={260} style={{ top: -30, left: -40 }} /> : null}
        {children}
      </View>
    </View>
  );
}

// One chapter per page: category, big title over the cover's fade, then the
// body. Niente scroll e niente testo tagliato: il capitolo viene misurato e,
// se non entra nello spazio disponibile, la scala tipografica scende a passi
// fino a farlo entrare per intero. Il contenuto resta invisibile finché la
// misura non è stabile, così non si vede il testo "saltare" mentre si adatta.
const MIN_FIT = 0.68;
const FIT_STEP = 0.05;
function ChapterPage({
  chapter, story, minTop, minutesLabel, onContentTop, onListen,
}: { chapter: Chapter; story: Story; minTop: number; minutesLabel: string; onContentTop: (y: number) => void; onListen: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [fit, setFit] = useState(1);
  const [ready, setReady] = useState(false);
  const availH = useRef(0);
  const usedH = useRef(0);

  const check = () => {
    if (!availH.current || !usedH.current) return;
    if (usedH.current > availH.current + 1 && fit > MIN_FIT + 0.001) {
      setFit((f) => Math.max(MIN_FIT, +(f - FIT_STEP).toFixed(2)));
    } else {
      setReady(true);
    }
  };

  // Safety net: if a size change doesn't trigger a new layout pass, reveal anyway.
  useEffect(() => {
    const id = setTimeout(() => setReady(true), 400);
    return () => clearTimeout(id);
  }, [fit]);

  const compact = fit < 0.9;
  const bodySize = Math.round(17 * fit);
  const titleSize = Math.round(36 * Math.max(fit, 0.8));
  return (
    <ReaderSheet
      index={chapter.number}
      minTop={minTop}
      glowColor={story.category_color}
      onContentTop={(_, y) => onContentTop(y)}
      onPageLayout={(e) => { availH.current = e.nativeEvent.layout.height - minTop - spacing.lg; check(); }}
      onContentLayout={(e) => { usedH.current = e.nativeEvent.layout.height; check(); }}
      contentStyle={{ gap: compact ? spacing.sm + 2 : spacing.md + 4, opacity: ready ? 1 : 0 }}
      testID={`deep-dive-page-chapter-${chapter.number}`}
    >
      <View style={styles.metaRow}>
        <CategoryTag name={story.category_name} icon={story.category_icon} color={story.category_color} />
        <View style={styles.metaSpacer} />
        <MetaInline icon="time-outline" label={minutesLabel} />
        <AudioTrigger onPress={onListen} testID={`audio-trigger-${chapter.number}`} />
      </View>
      <HighlightedTitle
        title={chapter.title}
        highlight={story.highlight_words}
        highlightColor={colors.cyan}
        style={[styles.readerTitle, { fontSize: titleSize, lineHeight: Math.round(titleSize * 1.12) }]}
      />
      <Text style={[styles.readerBody, { fontSize: bodySize, lineHeight: Math.round(bodySize * 1.76) }]}>{chapter.body}</Text>
    </ReaderSheet>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  progressTrack: {
    position: "absolute", left: 0, right: 0, height: 2, zIndex: 30,
    backgroundColor: colors.track,
  },
  progressFillWrap: { height: 2, overflow: "hidden", boxShadow: `0px 0px 8px ${colors.cyanGlow}` as any },
  progressFill: { flex: 1, height: 2 },
  pageFill: { flex: 1 },
  topBar: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 20,
    paddingHorizontal: spacing.lg,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  roundBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: colors.scrim,
    alignItems: "center", justifyContent: "center",
  },
  roundBtnPressed: { backgroundColor: colors.surfaceTertiary },
  shareHidden: { position: "absolute", left: -4000, top: 0, width: SHARE_CARD_WIDTH, pointerEvents: "none" },

  // Copertina fissa dietro le pagine.
  cover: { position: "absolute", top: 0, left: 0, right: 0, overflow: "hidden" },
  coverImage: { position: "absolute", top: 0, left: 0, right: 0 },

  // Pagine di lettura: trasparenti, contenuto ancorato in basso.
  readerPage: { paddingHorizontal: spacing.xl, justifyContent: "flex-end", paddingBottom: spacing.lg },
  readerInner: { gap: spacing.md + 4 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  metaSpacer: { flex: 1, minWidth: spacing.xs },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  eyebrow: { fontFamily: typography.bodyBold, fontSize: 11, letterSpacing: 2 },
  // Titolo: grande, bold, emerge dalla parte bassa dell'immagine (ombra
  // morbida per staccarlo dalla foto senza velarla).
  readerTitle: {
    color: colors.textWarm, fontFamily: typography.displayBold, fontSize: 36, lineHeight: 40, letterSpacing: -0.8,
    textShadowColor: withAlpha(colors.surface, 0.55), textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 14,
  },
  // Corpo: bianco caldo, respira, vive direttamente sul fondo scuro.
  readerBody: {
    color: colors.textWarmSecondary, fontFamily: typography.body, fontSize: 17, lineHeight: 30, letterSpacing: 0.1,
    textShadowColor: withAlpha(colors.surface, 0.45), textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 8,
  },
  ctaRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm + 2, marginTop: spacing.xs },
  ctaMain: { flex: 1 },

  endActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  endBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    minHeight: 46, paddingHorizontal: spacing.sm, borderRadius: radius.pill,
    backgroundColor: colors.glassBgLit, borderWidth: 1, borderColor: colors.glassBorder,
    boxShadow: `0px 6px 16px ${colors.glassShadow}` as any,
  },
  endBtnIcon: { flexGrow: 0, flexShrink: 0, flexBasis: 44, width: 44, paddingHorizontal: 0 },
  endBtnActive: { borderColor: colors.error + "66" },
  endBtnPressed: { backgroundColor: colors.glassBg, borderColor: colors.cyan + "66" },
  endBtnLabel: { flexShrink: 1, color: colors.textWarm, fontFamily: typography.bodyMedium, fontSize: 13.5 },
  footer: { paddingTop: spacing.sm, paddingHorizontal: spacing.xl, backgroundColor: "transparent" },
}));
