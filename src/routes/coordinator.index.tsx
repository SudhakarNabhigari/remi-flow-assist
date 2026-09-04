import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Activity, CheckCircle2, ShieldAlert, Timer, Zap } from "lucide-react";

import { AppShell } from "@/components/rimeflow/AppShell";
import { CoordinatorNav } from "@/components/rimeflow/CoordinatorNav";
import { supabase } from "@/integrations/supabase/client";
import { useRimeFlow } from "@/lib/rimeflow/store";

export const Route = createFileRoute("/coordinator/")({
  head: () => ({
    meta: [
      { title: "Coordinator — RimeFlow interruption metrics" },
      {
        name: "description",
        content:
          "Live interruption-handling metrics for RimeFlow: interruptions detected, stale results rejected, and recovery outcomes.",
      },
      { property: "og:title", content: "RimeFlow Coordinator" },
      {
        property: "og:description",
        content: "Real interruption, fencing and recovery metrics recorded from live voice sessions.",
      },
    ],
  }),
  component: CoordinatorRoute,
});

function CoordinatorRoute() {
  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="text-3xl font-bold tracking-tight">Coordinator</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Every number here is counted from events actually recorded during your voice sessions.
        </p>
        <div className="mt-8" />
        <CoordinatorNav />
        <Overview />
      </div>
    </AppShell>
  );
}

interface Counts {
  total: number;
  interruptions: number;
  handled: number;
  staleRejected: number;
  recovered: number;
  completed: number;
  errors: number;
}

function Overview() {
  const { userId } = useRimeFlow();
  const [counts, setCounts] = useState<Counts | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("voice_events")
        .select("event_type")
        .eq("user_id", userId)
        .limit(5000);
      if (cancelled) return;
      const rows = data ?? [];
      const n = (t: string) => rows.filter((r) => r.event_type === t).length;
      setCounts({
        total: rows.length,
        interruptions: n("INTERRUPTION_DETECTED"),
        handled: n("GENERATION_CANCELLED") + n("TOOL_FENCED"),
        staleRejected: n("STALE_RESULT_REJECTED"),
        recovered: n("RECOVERED"),
        completed: n("COMPLETED"),
        errors: n("ERROR"),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!counts) {
    return <p className="text-sm text-muted-foreground">Loading recorded events…</p>;
  }

  if (counts.total === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
        <Activity className="mx-auto h-8 w-8 text-primary/60" />
        <p className="mt-3 font-medium">No sessions recorded yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Talk to Remi on the Home page — interruptions and recoveries will show up here.
        </p>
      </div>
    );
  }

  const rate =
    counts.interruptions > 0
      ? Math.round((Math.min(counts.handled, counts.interruptions) / counts.interruptions) * 100)
      : null;

  const cards = [
    { label: "Voice events recorded", value: counts.total, icon: Activity },
    { label: "Interruptions detected", value: counts.interruptions, icon: Zap },
    { label: "Stale results rejected", value: counts.staleRejected, icon: ShieldAlert },
    { label: "Recoveries", value: counts.recovered, icon: Timer },
    { label: "Completed turns", value: counts.completed, icon: CheckCircle2 },
    { label: "Errors", value: counts.errors, icon: ShieldAlert },
  ];

  return (
    <div className="space-y-6">
      {rate !== null && (
        <div className="rounded-2xl bg-sidebar-gradient p-6 text-sidebar-foreground shadow-orb">
          <p className="text-sm opacity-80">Interruptions fenced or cancelled</p>
          <p className="mt-1 text-5xl font-bold">{rate}%</p>
          <p className="mt-2 text-xs opacity-75">
            {counts.interruptions} interruption(s) detected, {counts.handled} cancel/fence action(s) taken.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(({ label, value, icon: Icon }) => (
          <div
            key={label}
            className="rounded-2xl border border-border bg-card p-5 transition-transform duration-200 hover:-translate-y-0.5"
          >
            <Icon className="h-5 w-5 text-primary" />
            <p className="mt-3 text-3xl font-bold">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
