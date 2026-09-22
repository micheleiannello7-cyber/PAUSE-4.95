// PAUSE — Story audio player: shared React context (owns the expo-audio
// player + all cross-component state). Split out of the monolithic file for
// clarity; behaviour is identical to the previous single-file version.

import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from "expo-audio";
import { SharedValue, useSharedValue } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";

import { api, getApiLang, ttsUrl, voiceSampleUrl, VoiceId, FREE_VOICE } from "@/src/api";
import { usePremiumFlag } from "@/src/premium";
import { useUserId } from "@/src/session";
import { useAudioPrefs, getSavedPosition, savePosition, clearPosition } from "@/src/audio-prefs";
import { OFFLINE_SUPPORTED, offlineKey, getOfflineUri, downloadOffline, removeOffline } from "@/src/offline-audio";

import { FREE_MAX_SPEED, FULL_HEIGHT, OfflineState, Panel, RESUME_MIN_SECONDS } from "./constants";

export type Ctx = {
  playing: boolean;
  duration: number;
  position: number;
  progress: number;
  isLoaded: boolean;
  buffering: boolean;
  isPremium: boolean;
  rate: number;
  setRate: (v: number) => void;
  voice: VoiceId;
  setVoice: (v: VoiceId) => void;
  playSample: (v: VoiceId) => void;
  panel: Panel;
  setPanel: (p: Panel | ((prev: Panel) => Panel)) => void;
  togglePlay: () => void;
  skip: (delta: number) => void;
  preview: boolean;
  resumeFrom: number | null;
  offline: OfflineState;
  download: () => void;
  removeDownload: () => void;
  cardScreenYSV: SharedValue<number>;
  cardHeightSV: SharedValue<number>;
};

const AudioCtx = createContext<Ctx | null>(null);

export function useAudio(): Ctx {
  const ctx = useContext(AudioCtx);
  if (!ctx) throw new Error("Audio components must be used inside <StoryAudioProvider>");
  return ctx;
}

export function StoryAudioProvider({
  storyId, preview = false, autoplay = false, onFinished, children,
}: {
  storyId: string;
  preview?: boolean;
  autoplay?: boolean;
  onFinished?: () => void;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const userId = useUserId();
  const isPremium = usePremiumFlag();
  const [prefs, updatePrefs] = useAudioPrefs();
  const lang = getApiLang();

  // Free listeners always get Nova at ≤1.5× even if prefs were set while premium.
  const voice: VoiceId = isPremium ? prefs.voice : FREE_VOICE;
  const rate = isPremium ? prefs.rate : Math.min(prefs.rate, FREE_MAX_SPEED);

  const offKey = offlineKey(storyId, lang, voice);
  const [localUri, setLocalUri] = useState<string | null>(() => getOfflineUri(offKey));
  useEffect(() => { setLocalUri(getOfflineUri(offKey)); }, [offKey]);

  const source = useMemo(
    () => ({ uri: localUri ?? ttsUrl(storyId, { voice, preview }) }),
    [storyId, voice, preview, localUri],
  );

  const player = useAudioPlayer(source);
  const status = useAudioPlayerStatus(player);
  const samplePlayer = useAudioPlayer();
  const [starting, setStarting] = useState(false);
  const [panel, setPanel] = useState<Panel>("none");
  const [resumeFrom, setResumeFrom] = useState<number | null>(null);
  const [offline, setOffline] = useState<OfflineState>(
    !OFFLINE_SUPPORTED || preview ? "unsupported" : localUri ? "ready" : "none",
  );

  const firstSourceRef = useRef(true);
  useEffect(() => {
    if (firstSourceRef.current) { firstSourceRef.current = false; return; }
    try { player.replace(source); } catch {}
  }, [player, source]);

  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: isPremium, // background listening is a Premium perk
      allowsRecording: false,
    }).catch(() => {});
  }, [isPremium]);

  useEffect(() => () => {
    try { player.pause(); } catch {}
    try { samplePlayer.pause(); } catch {}
  }, [player, samplePlayer]);

  useEffect(() => {
    try { player.setPlaybackRate(rate, "high"); } catch {}
  }, [player, rate, source]);

  const isLoaded = status.isLoaded;
  const duration = isLoaded && isFinite(status.duration) ? status.duration : 0;
  const position = isLoaded ? status.currentTime : 0;
  const playing = !!status.playing;
  const buffering = starting || !isLoaded;
  const progress = duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0;

  // --- Exact resume (Premium) ---------------------------------------------
  const restoredRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isLoaded || duration <= 0 || preview) return;
    const key = `${storyId}|${lang}`;
    if (restoredRef.current === key) return;
    restoredRef.current = key;
    if (!isPremium) return;
    getSavedPosition(storyId, lang).then((saved) => {
      if (saved > RESUME_MIN_SECONDS && saved < duration - RESUME_MIN_SECONDS) {
        setResumeFrom(saved);
        try { player.seekTo(saved); } catch {}
      }
    });
  }, [isLoaded, duration, storyId, lang, isPremium, preview, player]);

  const posBucket = Math.floor(position / 3);
  useEffect(() => {
    if (preview || !playing || position < RESUME_MIN_SECONDS) return;
    savePosition(storyId, lang, position);
  }, [posBucket, playing, preview, storyId, lang, position]);

  // --- End of track --------------------------------------------------------
  const finishedRef = useRef(false);
  useEffect(() => {
    if (status.didJustFinish && !finishedRef.current) {
      finishedRef.current = true;
      if (!preview) clearPosition(storyId, lang);
      setResumeFrom(null);
      onFinished?.();
    }
    if (!status.didJustFinish && playing) finishedRef.current = false;
  }, [status.didJustFinish, playing, preview, storyId, lang, onFinished]);

  // --- Autoplay (playlist) -------------------------------------------------
  const autoRef = useRef(false);
  useEffect(() => {
    if (!autoplay || !isLoaded || autoRef.current) return;
    autoRef.current = true;
    try { player.play(); } catch {}
  }, [autoplay, isLoaded, player]);

  // --- Listening time → backend (flush every 30s and on unmount) -----------
  const listenedRef = useRef(0);
  const flush = useCallback(() => {
    if (!userId || listenedRef.current < 5 || preview) { listenedRef.current = 0; return; }
    const secs = Math.round(listenedRef.current);
    listenedRef.current = 0;
    api.listen(userId, storyId, secs).catch(() => {});
  }, [userId, storyId, preview]);
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      listenedRef.current += 1;
      if (listenedRef.current >= 30) flush();
    }, 1000);
    return () => clearInterval(id);
  }, [playing, flush]);
  useEffect(() => () => flush(), [flush]);

  const requirePremium = useCallback((fn: () => void) => {
    if (isPremium) fn();
    else router.push("/premium");
  }, [isPremium, router]);

  const setRate = (v: number) => {
    if (v > FREE_MAX_SPEED) return requirePremium(() => updatePrefs({ rate: v }));
    updatePrefs({ rate: v });
  };
  const setVoice = (v: VoiceId) => {
    if (v !== FREE_VOICE) return requirePremium(() => updatePrefs({ voice: v }));
    updatePrefs({ voice: v });
  };
  const playSample = (v: VoiceId) => {
    Haptics.selectionAsync().catch(() => {});
    try {
      samplePlayer.replace({ uri: voiceSampleUrl(v) });
      samplePlayer.play();
    } catch {}
  };

  const togglePlay = async () => {
    Haptics.selectionAsync().catch(() => {});
    if (playing) { player.pause(); return; }
    setStarting(true);
    try {
      if (duration > 0 && position >= duration - 0.2) await player.seekTo(0);
      setResumeFrom(null);
      player.play();
    } finally {
      setTimeout(() => setStarting(false), 500);
    }
  };

  const skip = (delta: number) => {
    Haptics.selectionAsync().catch(() => {});
    const target = Math.max(0, Math.min(duration || Number.MAX_SAFE_INTEGER, position + delta));
    player.seekTo(target);
  };

  const download = () => requirePremium(async () => {
    if (offline !== "none") return;
    setOffline("downloading");
    try {
      await downloadOffline(offKey, ttsUrl(storyId, { voice }));
      setOffline("ready");
    } catch {
      setOffline("none");
    }
  });
  const removeDownload = () => {
    removeOffline(offKey);
    setOffline("none");
    setLocalUri(null);
  };

  const cardScreenYSV = useSharedValue<number>(600);
  const cardHeightSV = useSharedValue<number>(FULL_HEIGHT);

  const value: Ctx = {
    playing, duration, position, progress, isLoaded, buffering, isPremium,
    rate, setRate, voice, setVoice, playSample,
    panel, setPanel, togglePlay, skip, preview, resumeFrom,
    offline, download, removeDownload, cardScreenYSV, cardHeightSV,
  };

  return <AudioCtx.Provider value={value}>{children}</AudioCtx.Provider>;
}
