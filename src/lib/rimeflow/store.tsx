import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { supabase } from "@/integrations/supabase/client";

import { DEFAULT_NICKNAME, type LanguageCode } from "./config";

export interface RimeFlowSettings {
  nickname: string;
  language: LanguageCode;
  voiceCategory: string;
  wakeWordEnabled: boolean;
  autoListening: boolean;
  speechSpeed: number;
  reducedMotion: boolean;
  highContrast: boolean;
}

const DEFAULT_SETTINGS: RimeFlowSettings = {
  nickname: DEFAULT_NICKNAME,
  language: "en",
  voiceCategory: "female",
  wakeWordEnabled: true,
  autoListening: true,
  speechSpeed: 1,
  reducedMotion: false,
  highContrast: false,
};

interface StoreValue {
  session: Session | null;
  userId: string | null;
  displayName: string;
  settings: RimeFlowSettings;
  loading: boolean;
  updateSettings: (patch: Partial<RimeFlowSettings>) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const StoreContext = createContext<StoreValue | null>(null);

export function RimeFlowProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [displayName, setDisplayName] = useState("Friend");
  const [settings, setSettings] = useState<RimeFlowSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (uid: string) => {
    const [{ data: profile }, { data: row }] = await Promise.all([
      supabase.from("profiles").select("display_name").eq("id", uid).maybeSingle(),
      supabase.from("user_settings").select("*").eq("user_id", uid).maybeSingle(),
    ]);
    if (profile?.display_name) setDisplayName(profile.display_name);
    if (row) {
      setSettings({
        nickname: row.nickname,
        language: row.language as LanguageCode,
        voiceCategory: row.voice_category,
        wakeWordEnabled: row.wake_word_enabled,
        autoListening: row.auto_listening,
        speechSpeed: Number(row.speech_speed),
        reducedMotion: row.reduced_motion,
        highContrast: row.high_contrast,
      });
    } else {
      await supabase.from("user_settings").insert({ user_id: uid });
    }
  }, []);

  useEffect(() => {
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next?.user) {
        void loadProfile(next.user.id);
      } else {
        setDisplayName("Friend");
        setSettings(DEFAULT_SETTINGS);
      }
    });
    void supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session?.user) await loadProfile(data.session.user.id);
      setLoading(false);
    });
    return () => subscription.subscription.unsubscribe();
  }, [loadProfile]);

  const updateSettings = useCallback(
    async (patch: Partial<RimeFlowSettings>) => {
      setSettings((prev) => ({ ...prev, ...patch }));
      const uid = session?.user.id;
      if (!uid) return;
      await supabase.from("user_settings").upsert({
        user_id: uid,
        ...(patch.nickname !== undefined ? { nickname: patch.nickname } : {}),
        ...(patch.language !== undefined ? { language: patch.language } : {}),
        ...(patch.voiceCategory !== undefined ? { voice_category: patch.voiceCategory } : {}),
        ...(patch.wakeWordEnabled !== undefined ? { wake_word_enabled: patch.wakeWordEnabled } : {}),
        ...(patch.autoListening !== undefined ? { auto_listening: patch.autoListening } : {}),
        ...(patch.speechSpeed !== undefined ? { speech_speed: patch.speechSpeed } : {}),
        ...(patch.reducedMotion !== undefined ? { reduced_motion: patch.reducedMotion } : {}),
        ...(patch.highContrast !== undefined ? { high_contrast: patch.highContrast } : {}),
        updated_at: new Date().toISOString(),
      });
    },
    [session],
  );

  const signOut = useCallback(async () => {
    window.speechSynthesis?.cancel();
    await supabase.auth.signOut();
  }, []);

  const refresh = useCallback(async () => {
    if (session?.user) await loadProfile(session.user.id);
  }, [loadProfile, session]);

  const value = useMemo<StoreValue>(
    () => ({
      session,
      userId: session?.user.id ?? null,
      displayName,
      settings,
      loading,
      updateSettings,
      signOut,
      refresh,
    }),
    [session, displayName, settings, loading, updateSettings, signOut, refresh],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useRimeFlow(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error("useRimeFlow must be used inside RimeFlowProvider");
  return value;
}
