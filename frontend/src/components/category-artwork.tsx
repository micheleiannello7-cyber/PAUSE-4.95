import { useState } from "react";
import { View, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Category, categoryArtworkUrl, categoryIllustrationUrl } from "@/src/api";
import { makeStyles, useTheme, withAlpha, radius } from "@/src/theme";
import { CategoryIcon } from "./category-icon";

// The approved original vector family remains untouched in category-icon.tsx.
// Switch this value to "line" to use that complete alternative across all tiles.
export const CATEGORY_VISUAL_MODE: "illustrated" | "line" = "illustrated";
const ART_VERSION = "glass-2026-09-v1";

export function CategoryArtwork({ category, testID, wide = false, compact = false, cornerRadius = radius.lg }: {
  category: Pick<Category, "id" | "color" | "illustration_generated">; testID: string; wide?: boolean; compact?: boolean; cornerRadius?: number;
}) {
  const uri = category.id === "all"
    ? categoryArtworkUrl("all", ART_VERSION)
    : categoryIllustrationUrl(category);
  return <Artwork key={`${CATEGORY_VISUAL_MODE}:${uri}`} category={category} uri={uri} testID={testID} wide={wide} compact={compact} cornerRadius={cornerRadius} />;
}

function Artwork({ category, uri, testID, wide, compact, cornerRadius }: {
  category: Pick<Category, "id" | "color">; uri: string | null; testID: string; wide: boolean; compact: boolean; cornerRadius: number;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const showImage = CATEGORY_VISUAL_MODE === "illustrated" && !!uri && !failed;
  const imageStyle = wide ? styles.bannerImage : [styles.image, compact && styles.compactImage];
  return (
    <View testID={testID} style={[styles.fill, { borderRadius: cornerRadius }]} accessibilityState={{ busy: showImage && !loaded }}>
      <LinearGradient colors={[category.color + "24", colors.artworkSurface]} style={StyleSheet.absoluteFill} />
      {(!showImage || !loaded) ? (
        <View style={wide ? [styles.bannerImage, styles.center] : styles.placeholder} testID={`${testID}-fallback`}>
          <CategoryIcon categoryId={category.id} color={category.color} highlightColor={colors.onGradient} size={compact ? 30 : 35} testID={`${testID}-line-icon`} />
        </View>
      ) : null}
      {showImage ? <Image
        testID={`${testID}-image`} source={{ uri: uri! }} style={imageStyle}
        contentFit="cover" cachePolicy="memory-disk" recyclingKey={uri} transition={0}
        onLoad={() => setLoaded(true)} onError={() => setFailed(true)}
      /> : null}
      {!wide ? <LinearGradient colors={[colors.artworkSurface, withAlpha(colors.artworkSurface, 0), withAlpha(colors.artworkSurface, 0), colors.artworkSurface]}
        locations={[0, 0.12, 0.88, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={imageStyle} /> : null}
      {wide ? <LinearGradient colors={[colors.artworkSurface, withAlpha(colors.artworkSurface, 0), withAlpha(colors.artworkSurface, 0)]}
        locations={[0, 0.28, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.bannerImage} /> : null}
      <LinearGradient
        colors={[withAlpha(colors.artworkSurface, 0), withAlpha(colors.artworkSurface, 0.05), withAlpha(colors.artworkSurface, 0.9), colors.artworkSurface]}
        locations={[0, 0.48, 0.83, 1]} style={StyleSheet.absoluteFill}
      />
      {wide ? <LinearGradient colors={[colors.artworkSurface, withAlpha(colors.artworkSurface, 0)]}
        start={{ x: 0.3, y: 0 }} end={{ x: 0.95, y: 0 }} style={StyleSheet.absoluteFill} /> : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  fill: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.artworkSurface, overflow: "hidden", pointerEvents: "none" },
  image: { position: "absolute", top: 2, left: "5%", width: "90%", aspectRatio: 1 },
  compactImage: { top: 0, left: "8%", width: "84%" },
  bannerImage: { position: "absolute", top: -8, right: 0, width: 112, height: 112 },
  center: { alignItems: "center", justifyContent: "center" },
  placeholder: { position: "absolute", top: 0, left: 0, right: 0, height: "68%", alignItems: "center", justifyContent: "center" },
}));