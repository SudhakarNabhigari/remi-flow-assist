import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check, Loader2, Play, Square } from "lucide-react";
import { useState } from "react";

import { AppShell } from "@/components/rimeflow/AppShell";
import { CinematicOverlay } from "@/components/rimeflow/CinematicOverlay";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { playChime } from "@/lib/rimeflow/ambience";
import { LANGUAGES, VOICE_CATEGORIES, getVoiceCategory, type LanguageCode } from "@/lib/rimeflow/config";
import { speakLine, stopSpokenLine } from "@/lib/rimeflow/speakLine";
import { useRimeFlow } from "@/lib/rimeflow/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — RimeFlow voice preferences" },
      { name: "description", content: "Choose Remi's nickname, language, voice style, speed and accessibility options." },
      { property: "og:title", content: "Settings — RimeFlow" },
      { property: "og:description", content: "Nickname, language, voice style, speech speed and accessibility." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppShell>
      <SettingsPage />
    </AppShell>
  ),
});

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="animate-fade-in rounded-2xl border border-border bg-card p-6 shadow-elegant">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

interface OverlayState {
  title: string;
  subtitle: string;
  line: string;
  voiceCategory: string;
  goHome: boolean;
}

function SettingsPage() {
  const { settings, updateSettings } = useRimeFlow();
  const navigate = useNavigate();

  const [nicknameDraft, setNicknameDraft] = useState(settings.nickname);
  const [voiceDraft, setVoiceDraft] = useState(settings.voiceCategory);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<OverlayState | null>(null);

  const nicknameChanged = nicknameDraft.trim().length > 0 && nicknameDraft.trim() !== settings.nickname;
  const voiceChanged = voiceDraft !== settings.voiceCategory;

  const confirmNickname = async () => {
    const name = nicknameDraft.trim();
    if (!name) return;
    playChime();
    await updateSettings({ nickname: name });
    setOverlay({
      title: `HEY WELCOME TO ${name.toUpperCase()}`,
      subtitle: `Your assistant now answers to “hey ${name}”. Taking you home…`,
      line: `Hey! Welcome to ${name}. Just say hey ${name} and I will be listening.`,
      voiceCategory: settings.voiceCategory,
      goHome: true,
    });
  };

  const previewVoice = async (id: string) => {
    const voice = getVoiceCategory(id);
    stopSpokenLine();
    setPreviewing(id);
    try {
      await speakLine(voice.previewLine, {
        voiceCategory: voice.id,
        speed: settings.speechSpeed,
        language: settings.language,
      });
    } finally {
      setPreviewing(null);
    }
  };

  const confirmVoice = async () => {
    const voice = getVoiceCategory(voiceDraft);
    playChime();
    await updateSettings({ voiceCategory: voice.id });
    setOverlay({
      title: `${voice.badge.toUpperCase()} VOICE ACTIVATED`,
      subtitle: voice.description,
      line: voice.introLine,
      voiceCategory: voice.id,
      goHome: false,
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-12">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Settings</h1>
        <p className="mt-2 text-sm text-muted-foreground">Everything here is saved to your account.</p>
      </div>

      <Section title="Assistant nickname" description="Say “hey” plus this word to wake the assistant.">
        <Label htmlFor="nickname" className="sr-only">
          Nickname
        </Label>
        <div className="flex flex-wrap items-center gap-3">
          <Input
            id="nickname"
            value={nicknameDraft}
            onChange={(e) => setNicknameDraft(e.target.value)}
            className="max-w-xs"
          />
          <Button onClick={() => void confirmNickname()} disabled={!nicknameChanged} className="card-lift">
            <Check className="mr-2 h-4 w-4" />
            Confirm
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Current wake phrase: <span className="font-semibold text-foreground">“hey {settings.nickname}”</span>
        </p>
      </Section>

      <Section title="Language" description="Auto-detected from your speech — this is just the starting point.">
        <div className="flex flex-wrap gap-3">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              type="button"
              onClick={() => void updateSettings({ language: lang.code as LanguageCode })}
              className={cn(
                "card-lift rounded-xl border px-4 py-3 text-left",
                settings.language === lang.code ? "border-primary bg-secondary shadow-sm" : "border-border bg-card",
              )}
            >
              <p className="text-sm font-semibold">{lang.label}</p>
              <p className="text-xs text-muted-foreground">{lang.nativeLabel}</p>
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          If you speak Telugu, Remi replies in Telugu. Hindi in, Hindi out. No switching needed.
        </p>
      </Section>

      <Section title="Voice" description="Preview any voice, then confirm to hear it introduce itself.">
        <div className="grid gap-3 sm:grid-cols-2">
          {VOICE_CATEGORIES.map((voice) => {
            const selected = voiceDraft === voice.id;
            return (
              <div
                key={voice.id}
                className={cn(
                  "card-lift rounded-xl border p-4",
                  selected ? "border-primary bg-secondary shadow-sm" : "border-border bg-card",
                )}
              >
                <button type="button" onClick={() => setVoiceDraft(voice.id)} className="w-full text-left">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{voice.label}</p>
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                      {voice.badge}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{voice.description}</p>
                </button>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3 w-full"
                  onClick={() => (previewing === voice.id ? stopSpokenLine() : void previewVoice(voice.id))}
                >
                  {previewing === voice.id ? (
                    <>
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      Playing preview
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-3.5 w-3.5" />
                      Preview voice
                    </>
                  )}
                </Button>
                {settings.voiceCategory === voice.id && (
                  <p className="mt-2 text-center text-[11px] font-medium text-primary">Currently active</p>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button onClick={() => void confirmVoice()} disabled={!voiceChanged} className="card-lift">
            <Check className="mr-2 h-4 w-4" />
            Confirm voice
          </Button>
          <Button variant="ghost" size="sm" onClick={() => stopSpokenLine()}>
            <Square className="mr-2 h-3.5 w-3.5" />
            Stop audio
          </Button>
        </div>
      </Section>

      <Section title="Speech speed" description={`Currently ${settings.speechSpeed.toFixed(2)}x`}>
        <Slider
          value={[settings.speechSpeed]}
          min={0.5}
          max={2}
          step={0.05}
          onValueChange={([value]) => void updateSettings({ speechSpeed: value ?? 1 })}
          className="max-w-md"
        />
      </Section>

      <Section title="Behaviour & accessibility" description="Wake word, continuous listening and motion.">
        <div className="space-y-4">
          <Toggle
            label="Wake word"
            hint="Require “hey <nickname>” before responding."
            checked={settings.wakeWordEnabled}
            onChange={(v) => void updateSettings({ wakeWordEnabled: v })}
          />
          <Toggle
            label="Auto-ready microphone"
            hint="Arm the mic automatically after login and keep it open between turns."
            checked={settings.autoListening}
            onChange={(v) => void updateSettings({ autoListening: v })}
          />
          <Toggle
            label="Reduced motion"
            hint="Calm the orb, waveform and cinematic animations."
            checked={settings.reducedMotion}
            onChange={(v) => void updateSettings({ reducedMotion: v })}
          />
          <Toggle
            label="High contrast"
            hint="Stronger contrast for text and controls."
            checked={settings.highContrast}
            onChange={(v) => void updateSettings({ highContrast: v })}
          />
        </div>
      </Section>

      {overlay && (
        <CinematicOverlay
          title={overlay.title}
          subtitle={overlay.subtitle}
          reducedMotion={settings.reducedMotion}
          onSpeak={() =>
            speakLine(overlay.line, {
              voiceCategory: overlay.voiceCategory,
              speed: settings.speechSpeed,
              language: settings.language,
            })
          }
          onDone={() => {
            setOverlay(null);
            if (overlay.goHome) void navigate({ to: "/" });
          }}
        />
      )}
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-muted px-4 py-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}
