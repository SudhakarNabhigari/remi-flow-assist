import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/rimeflow/AppShell";
import { CoordinatorNav } from "@/components/rimeflow/CoordinatorNav";
import { supabase } from "@/integrations/supabase/client";
import { useRimeFlow } from "@/lib/rimeflow/store";

export const Route = createFileRoute("/coordinator/evidence")({
  head: () => ({
    meta: [
      { title: "Evidence log — RimeFlow coordinator" },
      {
        name: "description",
        content:
          "Timestamped evidence trail of every RimeFlow voice event: requests, interruptions, fencing, stale rejections and recoveries.",
      },
      { property: "og:title", content: "RimeFlow evidence log" },
      {
        property: "og:description",
        content: "A raw, timestamped audit trail of the assistant's interruption handling.",
      },
    ],
  }),
  component: EvidenceRoute,
});

interface EventRow {
  id: string;
  created_at: string;
  event_type: string;
  request_id: string | null;
  conversation_version: number | null;
  metadata: unknown;
}

const TONE: Record<string, string> = {
  INTERRUPTION_DETECTED: "text-warning border-warning/40 bg-warning/10",
  STALE_RESULT_REJECTED: "text-destructive border-destructive/30 bg-destructive/5",
  ERROR: "text-destructive border-destructive/30 bg-destructive/5",
  COMPLETED: "text-primary border-primary/30 bg-primary/5",
};

function EvidenceRoute() {
  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="text-3xl font-bold tracking-tight">Evidence log</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The 200 most recent events, newest first — exactly as they were recorded.
        </p>
        <div className="mt-8" />
        <CoordinatorNav />
        <Evidence />
      </div>
    </AppShell>
  );
}

function Evidence() {
  const { userId } = useRimeFlow();
  const [rows, setRows] = useState<EventRow[] | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("voice_events")
        .select("id, created_at, event_type, request_id, conversation_version, metadata")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (!cancelled) setRows((data as EventRow[] | null) ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!rows) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (rows.length === 0)
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
        No events recorded yet.
      </div>
    );

  return (
    <ol className="space-y-2">
      {rows.map((row, i) => (
        <li
          key={row.id}
          style={{ animationDelay: `${Math.min(i, 20) * 25}ms` }}
          className={`animate-fade-in rounded-xl border px-4 py-3 text-sm ${
            TONE[row.event_type] ?? "border-border bg-card text-foreground/80"
          }`}
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-semibold tracking-tight">{row.event_type}</span>
            <span className="text-xs opacity-70">{new Date(row.created_at).toLocaleTimeString()}</span>
            {row.conversation_version != null && (
              <span className="text-xs opacity-70">v{row.conversation_version}</span>
            )}
            {row.request_id && <span className="font-mono text-[11px] opacity-60">{row.request_id}</span>}
          </div>
          {row.metadata != null && JSON.stringify(row.metadata) !== "{}" && (
            <pre className="mt-2 overflow-x-auto rounded-lg bg-background/60 p-2 font-mono text-[11px] opacity-80">
              {JSON.stringify(row.metadata)}
            </pre>
          )}
        </li>
      ))}
    </ol>
  );
}
