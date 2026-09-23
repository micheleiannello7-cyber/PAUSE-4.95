import React, { useState } from "react";
import { View, Text, ScrollView, ActivityIndicator, Pressable, useWindowDimensions, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";
import MaterialDesignIcons from "@react-native-vector-icons/material-design-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";

import * as Haptics from "expo-haptics";

import { api } from "@/src/api";
import { makeStyles, useTheme, spacing, typography, radius, withAlpha } from "@/src/theme";
import { getOrCreateUserId, setOnboarded } from "@/src/session";
import { CategoryGrid, toggleInterest } from "@/src/components/category-grid";
import { PagerDots } from "@/src/components/pager";
import { useI18n } from "@/src/i18n";

type Mode = "stories" | "lessons";
// Ritardo tra un elemento e il successivo nell'animazione a cascata dell'intro.
const STAGGER = 110;

// Blocco alto dell'intro (logo + cielo notturno + titolo), ritagliato dal mock
// approvato dall'utente. Dimensioni native del PNG, per l'aspect ratio.
const INTRO_HERO = require("../assets/images/intro-hero.png");
const INTRO_HERO_W = 601;
const INTRO_HERO_H = 394;
// Sfondo del mock (blu notte): l'intro è una schermata brand, uguale in ogni tema.
const INTRO_BG = "#000516";

export default function Onboarding() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: winH, width: winW } = useWindowDimensions();
  const [step, setStep] = useState(0);
  const [screenH, setScreenH] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modes, setModes] = useState<Set<Mode>>(new Set<Mode>(["stories"]));
  const [saving, setSaving] = useState(false);
  const { t } = useI18n();
  const styles = useStyles();
  const { colors } = useTheme();
  const { data: categories, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["categories"],
    queryFn: api.categories,
  });

  const canContinue = selected.size > 0 && modes.size > 0;

  const toggleMode = (m: Mode) => {
    setModes((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      // never let the user end with nothing selected
      if (next.size === 0) next.add(m);
      return next;
    });
  };

  const onContinue = async () => {
    if (!canContinue) return;
    setSaving(true);
    try {
      const uid = await getOrCreateUserId();
      await api.setInterests(uid, Array.from(selected));
      await api.setContentModes(uid, Array.from(modes));
      await setOnboarded();
      router.replace("/(tabs)/discover");
    } finally {
      setSaving(false);
    }
  };

  // -------------------------------------------------------- STEP 0 — intro
  // Replica fedele del mock fornito dall'utente: il blocco alto (logo, cielo
  // notturno con la persona, titolo e sottotitoli) è l'immagine originale del
  // mock; sotto, le tre card "Come funziona", la frase finale e la CTA.
  if (step === 0) {
    const features: { icon: (size: number) => React.ReactNode; title: string; desc: string; gradient: [string, string] }[] = [
      { icon: (n) => <Ionicons name="color-wand-outline" size={n} color="#FFFFFF" />, title: t.onb_intro_1_t, desc: t.onb_intro_1_d, gradient: ["#7C3AED", "#3B82F6"] },
      { icon: (n) => <MaterialDesignIcons name="brain" size={n} color="#FFFFFF" />, title: t.onb_intro_2_t, desc: t.onb_intro_2_d, gradient: ["#2563EB", "#06B6D4"] },
      { icon: (n) => <Ionicons name="bookmark-outline" size={n} color="#FFFFFF" />, title: t.onb_intro_3_t, desc: t.onb_intro_3_d, gradient: ["#9333EA", "#7C3AED"] },
    ];
    // Tutto in UNA schermata, senza scroll, su qualsiasi telefono: si misura
    // l'altezza reale e si distribuisce lo spazio. Prima si comprimono le card
    // (fino a un minimo leggibile), poi, se non basta, si accorcia l'immagine.
    const avail = (screenH || winH) - insets.top - insets.bottom;
    const FIXED = 34 + 58 + 56 + 26 + 12 + 12; // label · frase · CTA · pallini · padding
    const GAP = 10;
    let heroH = Math.min(Math.round(winW * (INTRO_HERO_H / INTRO_HERO_W)), Math.round(avail * 0.4));
    let cardH = Math.floor((avail - heroH - FIXED - 2 * GAP) / 3);
    if (cardH < 64) {
      heroH = Math.max(150, heroH - (64 - cardH) * 3);
      cardH = Math.floor((avail - heroH - FIXED - 2 * GAP) / 3);
    }
    cardH = Math.max(56, Math.min(84, cardH));
    const iconSz = Math.max(36, Math.min(52, cardH - 26));
    const small = cardH < 70;
    return (
      <View
        style={styles.introScreen}
        testID="onboarding-intro"
        onLayout={(e) => { const h = Math.round(e.nativeEvent.layout.height); if (h && h !== screenH) setScreenH(h); }}
      >
        <View style={{ paddingTop: insets.top }}>
          <Animated.View entering={FadeInDown.duration(500)}>
            <Image source={INTRO_HERO} style={{ width: winW, height: heroH }} contentFit="cover" testID="onboarding-hero" />
          </Animated.View>
        </View>

        <View style={styles.introBody}>
          <View>
            <Animated.View entering={FadeInUp.delay(STAGGER).duration(450)} style={styles.howRow}>
              <Text style={styles.howLabel}>{t.onb_intro_how}</Text>
              <LinearGradient colors={["#22D3EE", "#22D3EE00"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.howLine} />
            </Animated.View>
            <View style={{ gap: GAP }}>
              {features.map((f, i) => (
                <Animated.View
                  key={i}
                  entering={FadeInUp.delay(STAGGER * (2 + i)).duration(450)}
                  style={[styles.featureRow, { height: cardH }]}
                  testID={`onb-step-${i + 1}`}
                >
                  <LinearGradient colors={f.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.featureIcon, { width: iconSz, height: iconSz, borderRadius: Math.round(iconSz * 0.3) }]}>
                    {f.icon(small ? 20 : 24)}
                  </LinearGradient>
                  <View style={styles.featureTexts}>
                    <Text style={[styles.featureTitle, small && styles.featureTitleSmall]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{f.title}</Text>
                    <Text style={[styles.featureDesc, small && styles.featureDescSmall]} numberOfLines={1}>{f.desc}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
                </Animated.View>
              ))}
            </View>
          </View>

          <Animated.View entering={FadeInUp.delay(STAGGER * 5).duration(450)} style={styles.tagRow}>
            <LinearGradient colors={["#22D3EE00", "#22D3EE"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.tagLine} />
            <View style={styles.tagTexts}>
              <Text style={styles.tagA}>{t.onb_intro_foot_a}</Text>
              <Text style={styles.tagB}>{t.onb_intro_foot_b}</Text>
            </View>
            <LinearGradient colors={["#22D3EE", "#22D3EE00"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.tagLine} />
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(STAGGER * 6).duration(450)} style={{ paddingBottom: insets.bottom + spacing.sm }}>
            <Pressable
              onPress={() => setStep(1)}
              testID="onboarding-intro-continue"
              accessibilityRole="button"
              style={({ pressed }) => [styles.introCta, pressed && { opacity: 0.9 }]}
            >
              <LinearGradient colors={["#A855F7", "#3B82F6", "#22D3EE"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
              <Text style={styles.introCtaText}>{t.onb_intro_cta}</Text>
              <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
            </Pressable>
            <PagerDots count={2} index={0} color="#3B82F6" style={styles.dotsBelow} testID="onboarding-dots" />
          </Animated.View>
        </View>
      </View>
    );
  }

  // ------------------------------------------------ STEP 1 — content + topics
  return (
    <View style={[styles.container, { paddingTop: insets.top }]} testID="onboarding-topics">
      {isLoading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.xxxl }} testID="onboarding-loading" />
      ) : isError || !categories ? (
        <View style={styles.errorWrap} testID="onboarding-error">
          <Ionicons name="cloud-offline-outline" size={44} color={colors.muted} />
          <Text style={styles.errorTitle}>{t.load_error}</Text>
          <Text style={styles.errorText}>{t.load_error_sub}</Text>
          <Pressable
            onPress={() => refetch()}
            style={({ pressed }) => [styles.retryBtn, { opacity: pressed ? 0.7 : 1 }]}
            testID="onboarding-retry"
          >
            {isFetching ? (
              <ActivityIndicator color={colors.brand} size="small" />
            ) : (
              <>
                <Ionicons name="refresh" size={16} color={colors.brand} />
                <Text style={styles.retryText}>{t.retry}</Text>
              </>
            )}
          </Pressable>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <Pressable onPress={() => setStep(0)} style={styles.backLink} testID="onboarding-back" hitSlop={8}>
            <Ionicons name="arrow-back" size={18} color={colors.muted} />
            <Text style={styles.backLinkText}>{t.back}</Text>
          </Pressable>

          {/* Single, prominent title — one clear hierarchy */}
          <Text style={styles.stepTitle}>{t.onb_content_q}</Text>

          {/* Content toggles: curiosities / mini lessons, individually or both */}
          <View style={styles.modeRow}>
            <ModeToggle
              icon="bulb-outline"
              label={t.onb_toggle_stories}
              active={modes.has("stories")}
              onPress={() => toggleMode("stories")}
              styles={styles}
              colors={colors}
              testID="onboarding-mode-stories"
            />
            <ModeToggle
              icon="school-outline"
              label={t.onb_toggle_lessons}
              active={modes.has("lessons")}
              onPress={() => toggleMode("lessons")}
              styles={styles}
              colors={colors}
              testID="onboarding-mode-lessons"
            />
          </View>

          <Text style={styles.sectionLabel}>{t.onb_interests_label}</Text>
          <Text style={styles.subtitle}>{t.onb_subtitle}</Text>
          <CategoryGrid
            compact
            categories={categories}
            selected={selected}
            modes={Array.from(modes)}
            onToggle={(id) => setSelected((prev) => toggleInterest(prev, id))}
          />
        </ScrollView>
      )}

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <PagerDots count={2} index={1} style={styles.dots} testID="onboarding-dots" />
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            onContinue();
          }}
          disabled={!canContinue || saving}
          testID="onboarding-continue"
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.ctaBtn,
            { opacity: canContinue ? 1 : 0.45 },
            canContinue && styles.ctaBtnActive,
            pressed && styles.ctaPressed,
          ]}
        >
          {saving ? (
            <ActivityIndicator color={colors.cyan} />
          ) : (
            <>
              <Text style={styles.ctaText}>{t.onb_cta}</Text>
              <Ionicons name="arrow-forward" size={18} color={colors.cyan} />
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function ModeToggle({
  icon, label, hint, active, onPress, styles, colors, testID,
}: {
  icon: string; label: string; hint?: string; active: boolean; onPress: () => void;
  styles: any; colors: any; testID: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="switch"
      accessibilityState={{ checked: active }}
      style={[styles.modeCard, active && { borderColor: colors.brand, backgroundColor: colors.brand + "12" }]}
    >
      <View style={styles.modeTop}>
        <View style={[styles.modeOrb, { backgroundColor: (active ? colors.brand : colors.muted) + "1A" }]}>
          <Ionicons name={icon as any} size={18} color={active ? colors.brand : colors.muted} />
        </View>
        <Ionicons
          name={active ? "checkmark-circle" : "ellipse-outline"}
          size={20}
          color={active ? colors.brand : colors.borderStrong}
        />
      </View>
      <Text style={[styles.modeLabel, active && { color: colors.onSurface }]}>{label}</Text>
      {hint ? <Text style={styles.modeHint}>{hint}</Text> : null}
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.lg },
  // ---- intro (colori fissi: replica del mock, identica in ogni tema) ----
  introScreen: { flex: 1, backgroundColor: INTRO_BG },
  introBody: { flex: 1, paddingHorizontal: spacing.xl, justifyContent: "space-between", paddingTop: spacing.md },
  howRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.sm + 2, height: 20 },
  howLabel: { color: "#22D3EE", fontFamily: typography.bodyBold, fontSize: 14, letterSpacing: 2 },
  howLine: { width: 80, height: 1.5, borderRadius: 1 },
  featureRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
    borderRadius: 20, paddingHorizontal: spacing.md,
  },
  featureIcon: { alignItems: "center", justifyContent: "center" },
  featureTexts: { flex: 1, gap: 1 },
  featureTitle: { color: "#FFFFFF", fontFamily: typography.bodyBold, fontSize: 15 },
  featureTitleSmall: { fontSize: 14 },
  featureDesc: { color: "rgba(255,255,255,0.72)", fontFamily: typography.body, fontSize: 13, lineHeight: 17 },
  featureDescSmall: { fontSize: 12, lineHeight: 15 },
  tagRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, height: 58 },
  tagLine: { flex: 1, height: 1 },
  tagTexts: { alignItems: "center" },
  tagA: { color: "rgba(255,255,255,0.85)", fontFamily: typography.body, fontSize: 14, lineHeight: 20 },
  tagB: { color: "#22D3EE", fontFamily: typography.bodyBold, fontSize: 15, lineHeight: 20 },
  introCta: {
    height: 56, borderRadius: 28, overflow: "hidden",
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.md,
  },
  introCtaText: { color: "#FFFFFF", fontFamily: typography.bodyBold, fontSize: 17 },
  dotsBelow: { alignSelf: "center", marginTop: spacing.md, height: 10 },
  backLink: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.md },
  backLinkText: { color: colors.muted, fontFamily: typography.bodyMedium, fontSize: 14 },
  sectionLabel: { color: colors.muted, fontFamily: typography.bodyBold, fontSize: 11, letterSpacing: 1.6, marginBottom: spacing.xs },
  stepTitle: { color: colors.onSurface, fontFamily: typography.displayBold, fontSize: 28, lineHeight: 34, marginBottom: spacing.lg },
  modeRow: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.xl },
  modeCard: {
    flex: 1, gap: 6, padding: spacing.md, borderRadius: radius.lg,
    backgroundColor: colors.surfaceSecondary, borderWidth: 1.5, borderColor: colors.border,
  },
  modeTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modeOrb: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  modeLabel: { color: colors.onSurfaceSecondary, fontFamily: typography.bodyBold, fontSize: 15, marginTop: 2 },
  modeHint: { color: colors.brand, fontFamily: typography.bodyMedium, fontSize: 10, letterSpacing: 0.3 },
  title: { color: colors.onSurface, fontFamily: typography.displayBold, fontSize: 22, lineHeight: 27, marginBottom: spacing.xs },
  subtitle: { color: colors.muted, fontFamily: typography.body, fontSize: 13, lineHeight: 18, marginBottom: spacing.lg },
  dots: { alignSelf: "center", marginBottom: spacing.md },
  ctaBtn: {
    minHeight: 56, borderRadius: radius.lg, overflow: "hidden",
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    backgroundColor: colors.artworkSurface,
    borderWidth: 1.5, borderColor: colors.glassBorderStrong,
  },
  ctaBtnActive: {
    borderColor: withAlpha(colors.cyan, 0.67),
    boxShadow: `0px 0px 14px ${colors.cyanGlow}` as any,
  },
  ctaPressed: { opacity: 0.86, transform: [{ scale: 0.99 }] },
  ctaText: { color: colors.onGradient, fontFamily: typography.bodyBold, fontSize: 16 },
  footer: {
    paddingHorizontal: spacing.xl, paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1, borderTopColor: colors.divider,
  },
  errorWrap: {
    flex: 1, alignItems: "center", justifyContent: "center",
    paddingHorizontal: spacing.xl, gap: spacing.md,
  },
  errorTitle: { color: colors.onSurface, fontFamily: typography.displayBold, fontSize: 18, textAlign: "center" },
  errorText: { color: colors.muted, fontFamily: typography.body, fontSize: 14, textAlign: "center", lineHeight: 20 },
  retryBtn: {
    marginTop: spacing.sm, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    minHeight: 48, paddingHorizontal: spacing.xl,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.brand,
  },
  retryText: { color: colors.brand, fontFamily: typography.bodyBold, fontSize: 15 },
}));
