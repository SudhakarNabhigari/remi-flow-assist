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
import {
  LANGUAGES,
  VOICE_CATEGORIES,
  getVoiceCategory,
  type LanguageCode,
} from "@/lib/rimeflow/config";
import {
  speakLine,
  stopSpokenLine,
  unlockSpokenLine,
} from "@/lib/rimeflow/speakLine";
import { useRimeFlow } from "@/lib/rimeflow/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      {
        title: "Settings — RimeFlow voice preferences",
      },
      {
        name: "description",
        content:
          "Choose Remi's nickname, language, voice style, speed and accessibility options.",
      },
      {
        property: "og:title",
        content: "Settings — RimeFlow",
      },
      {
        property: "og:description",
        content:
          "Nickname, language, voice style, speech speed and accessibility.",
      },
      {
        property: "og:type",
        content: "website",
      },
      {
        name: "twitter:card",
        content: "summary_large_image",
      },
    ],
  }),

  component: () => (
    <AppShell>
      <SettingsPage />
    </AppShell>
  ),
});

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="animate-fade-in rounded-2xl border border-border bg-card p-6 shadow-elegant">
      <h2 className="text-lg font-semibold">
        {title}
      </h2>

      <p className="mt-1 text-sm text-muted-foreground">
        {description}
      </p>

      <div className="mt-5">
        {children}
      </div>
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
  const {
    settings,
    updateSettings,
  } = useRimeFlow();

  const navigate = useNavigate();

  const [
    nicknameDraft,
    setNicknameDraft,
  ] = useState(settings.nickname);

  const [
    voiceDraft,
    setVoiceDraft,
  ] = useState(settings.voiceCategory);

  const [
    previewing,
    setPreviewing,
  ] = useState<string | null>(null);

  const [
    overlay,
    setOverlay,
  ] = useState<OverlayState | null>(
    null,
  );

  const nicknameChanged =
    nicknameDraft.trim().length > 0 &&
    nicknameDraft.trim() !==
      settings.nickname;

  const voiceChanged =
    voiceDraft !== settings.voiceCategory;

  /*
   * ------------------------------------------------------------
   * NICKNAME
   * ------------------------------------------------------------
   */
  const confirmNickname = async () => {
    /*
     * Unlock browser audio immediately from
     * the actual Confirm button click.
     */
    unlockSpokenLine();

    const name =
      nicknameDraft.trim();

    if (!name) {
      return;
    }

    /*
     * Stop anything that might currently
     * be playing.
     */
    stopSpokenLine();

    /*
     * Small UI confirmation sound.
     */
    playChime();

    try {
      await updateSettings({
        nickname: name,
      });

      /*
       * Speak the new nickname through
       * the same Rime-first speech pipeline.
       */
      setOverlay({
        title: `HEY WELCOME TO ${name.toUpperCase()}`,

        subtitle:
          `Your assistant now answers to “hey ${name}”. Taking you home…`,

        line:
          `Hey! Welcome to ${name}. Just say hey ${name} and I will be listening.`,

        voiceCategory:
          settings.voiceCategory,

        goHome: true,
      });
    } catch (error) {
      console.error(
        "Nickname update failed:",
        error,
      );
    }
  };

  /*
   * ------------------------------------------------------------
   * VOICE PREVIEW
   * ------------------------------------------------------------
   */
  const previewVoice = async (
    id: string,
  ) => {
    /*
     * Preview button is a genuine user
     * gesture, so unlock audio FIRST.
     */
    unlockSpokenLine();

    const voice =
      getVoiceCategory(id);

    /*
     * Stop previous preview/audio.
     */
    stopSpokenLine();

    setPreviewing(id);

    try {
      await speakLine(
        voice.previewLine,
        {
          voiceCategory:
            voice.id,

          speed:
            settings.speechSpeed,

          language:
            settings.language,
        },
      );
    } catch (error) {
      console.error(
        "Voice preview failed:",
        error,
      );
    } finally {
      setPreviewing(null);
    }
  };

  /*
   * ------------------------------------------------------------
   * CONFIRM VOICE
   * ------------------------------------------------------------
   */
  const confirmVoice = async () => {
    /*
     * Unlock directly from the Confirm Voice
     * button click.
     */
    unlockSpokenLine();

    const voice =
      getVoiceCategory(
        voiceDraft,
      );

    /*
     * Stop previous speech.
     */
    stopSpokenLine();

    playChime();

    try {
      /*
       * Save selected voice category.
       */
      await updateSettings({
        voiceCategory: voice.id,
      });

      /*
       * Show cinematic introduction.
       * The overlay uses the same Rime-first
       * speech pipeline.
       */
      setOverlay({
        title:
          `${voice.badge.toUpperCase()} VOICE ACTIVATED`,

        subtitle:
          voice.description,

        line:
          voice.introLine,

        voiceCategory:
          voice.id,

        goHome: false,
      });
    } catch (error) {
      console.error(
        "Voice update failed:",
        error,
      );
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-12">

      {/* ------------------------------------------------------ */}
      {/* HEADER */}
      {/* ------------------------------------------------------ */}

      <div>
        <h1 className="text-3xl font-black tracking-tight">
          Settings
        </h1>

        <p className="mt-2 text-sm text-muted-foreground">
          Everything here is saved to your account.
        </p>
      </div>

      {/* ------------------------------------------------------ */}
      {/* NICKNAME */}
      {/* ------------------------------------------------------ */}

      <Section
        title="Assistant nickname"
        description="Say “hey” plus this word to wake the assistant."
      >
        <Label
          htmlFor="nickname"
          className="sr-only"
        >
          Nickname
        </Label>

        <div className="flex flex-wrap items-center gap-3">
          <Input
            id="nickname"
            value={nicknameDraft}
            onChange={(event) =>
              setNicknameDraft(
                event.target.value,
              )
            }
            placeholder="Enter assistant nickname"
            className="max-w-xs"
          />

          <Button
            onClick={() =>
              void confirmNickname()
            }
            disabled={!nicknameChanged}
            className="card-lift"
          >
            <Check className="mr-2 h-4 w-4" />
            Confirm
          </Button>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          Current wake phrase:{" "}

          <span className="font-semibold text-foreground">
            “hey {settings.nickname}”
          </span>
        </p>
      </Section>

      {/* ------------------------------------------------------ */}
      {/* LANGUAGE */}
      {/* ------------------------------------------------------ */}

      <Section
        title="Language"
        description="Auto-detected from your speech — this is just the starting point."
      >
        <div className="flex flex-wrap gap-3">
          {LANGUAGES.map(
            (lang) => (
              <button
                key={lang.code}
                type="button"
                onClick={() =>
                  void updateSettings({
                    language:
                      lang.code as LanguageCode,
                  })
                }
                className={cn(
                  "card-lift rounded-xl border px-4 py-3 text-left",
                  settings.language ===
                    lang.code
                    ? "border-primary bg-secondary shadow-sm"
                    : "border-border bg-card",
                )}
              >
                <p className="text-sm font-semibold">
                  {lang.label}
                </p>

                <p className="text-xs text-muted-foreground">
                  {lang.nativeLabel}
                </p>
              </button>
            ),
          )}
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          If you speak Telugu, Remi replies in Telugu.
          Hindi in, Hindi out. No switching needed.
        </p>
      </Section>

      {/* ------------------------------------------------------ */}
      {/* VOICE */}
      {/* ------------------------------------------------------ */}

      <Section
        title="Voice"
        description="Preview any voice, then confirm to hear it introduce itself."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {VOICE_CATEGORIES.map(
            (voice) => {
              const selected =
                voiceDraft ===
                voice.id;

              return (
                <div
                  key={voice.id}
                  className={cn(
                    "card-lift rounded-xl border p-4",
                    selected
                      ? "border-primary bg-secondary shadow-sm"
                      : "border-border bg-card",
                  )}
                >
                  {/* Voice selector */}
                  <button
                    type="button"
                    onClick={() =>
                      setVoiceDraft(
                        voice.id,
                      )
                    }
                    className="w-full text-left"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">
                        {voice.label}
                      </p>

                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                        {voice.badge}
                      </span>
                    </div>

                    <p className="mt-1 text-xs text-muted-foreground">
                      {voice.description}
                    </p>
                  </button>

                  {/* Preview */}
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3 w-full"
                    onClick={() => {
                      if (
                        previewing ===
                        voice.id
                      ) {
                        stopSpokenLine();
                        setPreviewing(
                          null,
                        );
                        return;
                      }

                      void previewVoice(
                        voice.id,
                      );
                    }}
                  >
                    {previewing ===
                    voice.id ? (
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

                  {/* Active indicator */}
                  {settings.voiceCategory ===
                    voice.id && (
                    <p className="mt-2 text-center text-[11px] font-medium text-primary">
                      Currently active
                    </p>
                  )}
                </div>
              );
            },
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {/* Confirm voice */}
          <Button
            onClick={() =>
              void confirmVoice()
            }
            disabled={!voiceChanged}
            className="card-lift"
          >
            <Check className="mr-2 h-4 w-4" />

            Confirm voice
          </Button>

          {/* Stop */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              stopSpokenLine()
            }
          >
            <Square className="mr-2 h-3.5 w-3.5" />

            Stop audio
          </Button>
        </div>
      </Section>

      {/* ------------------------------------------------------ */}
      {/* SPEECH SPEED */}
      {/* ------------------------------------------------------ */}

      <Section
        title="Speech speed"
        description={`Currently ${settings.speechSpeed.toFixed(2)}x`}
      >
        <Slider
          value={[
            settings.speechSpeed,
          ]}
          min={0.5}
          max={2}
          step={0.05}
          onValueChange={([
            value,
          ]) =>
            void updateSettings({
              speechSpeed:
                value ?? 1,
            })
          }
          className="max-w-md"
        />
      </Section>

      {/* ------------------------------------------------------ */}
      {/* BEHAVIOUR & ACCESSIBILITY */}
      {/* ------------------------------------------------------ */}

      <Section
        title="Behaviour & accessibility"
        description="Wake word, continuous listening and motion."
      >
        <div className="space-y-4">

          <Toggle
            label="Wake word"
            hint="Require “hey <nickname>” before responding."
            checked={
              settings.wakeWordEnabled
            }
            onChange={(value) =>
              void updateSettings({
                wakeWordEnabled:
                  value,
              })
            }
          />

          <Toggle
            label="Auto-ready microphone"
            hint="Arm the mic automatically after login and keep it open between turns."
            checked={
              settings.autoListening
            }
            onChange={(value) =>
              void updateSettings({
                autoListening:
                  value,
              })
            }
          />

          <Toggle
            label="Reduced motion"
            hint="Calm the orb, waveform and cinematic animations."
            checked={
              settings.reducedMotion
            }
            onChange={(value) =>
              void updateSettings({
                reducedMotion:
                  value,
              })
            }
          />

          <Toggle
            label="High contrast"
            hint="Stronger contrast for text and controls."
            checked={
              settings.highContrast
            }
            onChange={(value) =>
              void updateSettings({
                highContrast:
                  value,
              })
            }
          />

        </div>
      </Section>

      {/* ------------------------------------------------------ */}
      {/* CINEMATIC OVERLAY */}
      {/* ------------------------------------------------------ */}

      {overlay && (
        <CinematicOverlay
          title={overlay.title}
          subtitle={overlay.subtitle}
          reducedMotion={
            settings.reducedMotion
          }
          onSpeak={async () => {
            /*
             * Try to unlock audio again.
             */
            unlockSpokenLine();

            /*
             * Stop any previous audio before
             * starting the introduction.
             */
            stopSpokenLine();

            return speakLine(
              overlay.line,
              {
                voiceCategory:
                  overlay.voiceCategory,

                speed:
                  settings.speechSpeed,

                language:
                  settings.language,
              },
            );
          }}
          onDone={() => {
            setOverlay(null);

            if (overlay.goHome) {
              void navigate({
                to: "/",
              });
            }
          }}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* TOGGLE                                                                     */
/* -------------------------------------------------------------------------- */

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (
    value: boolean,
  ) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-muted px-4 py-3">

      <div>
        <p className="text-sm font-medium">
          {label}
        </p>

        <p className="text-xs text-muted-foreground">
          {hint}
        </p>
      </div>

      <Switch
        checked={checked}
        onCheckedChange={
          onChange
        }
        aria-label={label}
      />
    </div>
  );
}