import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/rimeflow/AppShell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { LANGUAGES, VOICE_CATEGORIES, type LanguageCode } from "@/lib/rimeflow/config";
import { useRimeFlow } from "@/lib/rimeflow/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — RimeFlow voice preferences" },
      { name: "description", content: "Choose Remi's nickname, language, voice style, speed and accessibility options." },
      { property: "og:title", content: "Settings — RimeFlow" },
      { property: "og:description", content: "Nickname, language, voice style, speech speed and accessibility." },
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

function SettingsPage() {
  const { settings, updateSettings } = useRimeFlow();

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-12">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="mt-2 text-sm text-muted-foreground">Everything here is saved to your account.</p>
      </div>

      <Section title="Assistant nickname" description="Say this word to wake the assistant.">
        <Label htmlFor="nickname" className="sr-only">
          Nickname
        </Label>
        <Input
          id="nickname"
          value={settings.nickname}
          onChange={(e) => void updateSettings({ nickname: e.target.value })}
          className="max-w-xs"
        />
      </Section>

      <Section title="Language" description="Speech recognition and replies switch instantly.">
        <div className="flex flex-wrap gap-3">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              type="button"
              onClick={() => void updateSettings({ language: lang.code as LanguageCode })}
              className={cn(
                "rounded-xl border px-4 py-3 text-left transition-all duration-200 hover:-translate-y-0.5",
                settings.language === lang.code
                  ? "border-primary bg-secondary shadow-sm"
                  : "border-border bg-card",
              )}
            >
              <p className="text-sm font-semibold">{lang.label}</p>
              <p className="text-xs text-muted-foreground">{lang.nativeLabel}</p>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Voice style" description="Rime voice category used for spoken replies.">
        <div className="grid gap-3 sm:grid-cols-2">
          {VOICE_CATEGORIES.map((voice) => (
            <button
              key={voice.id}
              type="button"
              onClick={() => void updateSettings({ voiceCategory: voice.id })}
              className={cn(
                "rounded-xl border p-4 text-left transition-all duration-200 hover:-translate-y-0.5",
                settings.voiceCategory === voice.id
                  ? "border-primary bg-secondary shadow-sm"
                  : "border-border bg-card",
              )}
            >
              <p className="text-sm font-semibold">{voice.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">{voice.description}</p>
            </button>
          ))}
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
            hint="Require the nickname before responding."
            checked={settings.wakeWordEnabled}
            onChange={(v) => void updateSettings({ wakeWordEnabled: v })}
          />
          <Toggle
            label="Continuous listening"
            hint="Keep the microphone open between turns."
            checked={settings.autoListening}
            onChange={(v) => void updateSettings({ autoListening: v })}
          />
          <Toggle
            label="Reduced motion"
            hint="Calm the orb and waveform animations."
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
