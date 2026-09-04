import {
  Link,
  useRouterState,
} from "@tanstack/react-router";
import {
  Activity,
  AudioLines,
  History,
  Home,
  Info,
  LogOut,
  Settings,
} from "lucide-react";
import {
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import {
  speakLine,
  unlockSpokenLine,
} from "@/lib/rimeflow/speakLine";
import { useRimeFlow } from "@/lib/rimeflow/store";
import { cn } from "@/lib/utils";

import { AuthScreen } from "./AuthScreen";
import { CinematicOverlay } from "./CinematicOverlay";

const NAV = [
  {
    to: "/",
    label: "Home",
    icon: Home,
  },
  {
    to: "/history",
    label: "History",
    icon: History,
  },
  {
    to: "/coordinator",
    label: "Coordinator",
    icon: Activity,
  },
  {
    to: "/settings",
    label: "Settings",
    icon: Settings,
  },
  {
    to: "/about",
    label: "About",
    icon: Info,
  },
] as const;

export function AppShell({
  children,
}: {
  children: ReactNode;
}) {
  const {
    session,
    loading,
    displayName,
    settings,
    signOut,
  } = useRimeFlow();

  const pathname =
    useRouterState({
      select: (s) =>
        s.location.pathname,
    });

  const [
    showWelcome,
    setShowWelcome,
  ] = useState(false);

  const userId =
    session?.user.id ?? null;

  /*
   * Show welcome once per signed-in session.
   */
  useEffect(() => {
    if (!userId || loading) return;

    const key =
      `rimeflow:welcomed:${userId}`;

    if (
      sessionStorage.getItem(key)
    ) {
      return;
    }

    sessionStorage.setItem(
      key,
      "1",
    );

    setShowWelcome(true);
  }, [userId, loading]);

  /*
   * While auth is loading.
   */
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stage">
        <div className="h-14 w-14 rounded-full bg-orb shadow-orb animate-orb-pulse" />
      </div>
    );
  }

  /*
   * Logged out.
   */
  if (!session) {
    return <AuthScreen />;
  }

  const nickname =
    settings.nickname.trim() ||
    displayName ||
    "Remi";

  return (
    <div className="flex min-h-screen bg-stage">
      <aside className="sticky top-0 flex h-screen w-[86px] shrink-0 flex-col items-center gap-2 bg-sidebar-gradient py-6 text-sidebar-foreground md:w-64 md:items-stretch md:px-4">
        <div className="mb-6 flex items-center gap-3 md:px-2">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sidebar-accent">
            <AudioLines className="h-5 w-5" />
          </div>

          <div className="hidden md:block">
            <p className="text-base font-bold leading-tight">
              RimeFlow
            </p>

            <p className="text-xs opacity-75">
              Voice assistant
            </p>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map(
            ({
              to,
              label,
              icon: Icon,
            }) => {
              const active =
                to === "/"
                  ? pathname === "/"
                  : pathname.startsWith(
                      to,
                    );

              return (
                <Link
                  key={to}
                  to={to}
                  className={cn(
                    "flex items-center justify-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all duration-200 md:justify-start",
                    active
                      ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                      : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:translate-x-0.5",
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" />

                  <span className="hidden md:inline">
                    {label}
                  </span>
                </Link>
              );
            },
          )}
        </nav>

        <div className="mt-auto w-full">
          <p className="mb-2 hidden truncate px-3 text-xs opacity-75 md:block">
            {displayName}
          </p>

          <Button
            variant="ghost"
            onClick={() =>
              void signOut()
            }
            className="w-full justify-center gap-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground md:justify-start"
          >
            <LogOut className="h-4 w-4" />

            <span className="hidden md:inline">
              Sign out
            </span>
          </Button>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        {children}
      </main>

      {showWelcome && (
        <CinematicOverlay
          title="WELCOME TO RIME VOICE AGENT"
          subtitle={`${displayName}, your microphone is arming now. Just say "hey ${settings.nickname}"`}
          reducedMotion={
            settings.reducedMotion
          }
          onSpeak={async () => {
            unlockSpokenLine();

            return speakLine(
              `Welcome to Rime Voice Agent, ${displayName}. Say hey ${nickname} any time to start talking.`,
              {
                voiceCategory:
                  settings.voiceCategory,
                speed:
                  settings.speechSpeed,
                language:
                  settings.language,
              },
            );
          }}
          onDone={() =>
            setShowWelcome(false)
          }
        />
      )}
    </div>
  );
}