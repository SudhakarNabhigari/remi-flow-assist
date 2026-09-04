import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { History as HistoryIcon, Loader2 } from "lucide-react";

import { AppShell } from "@/components/rimeflow/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useRimeFlow } from "@/lib/rimeflow/store";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "Conversation history — RimeFlow" },
      { name: "description", content: "Every RimeFlow voice turn, with interruptions and recovery outcomes." },
      { property: "og:title", content: "Conversation history — RimeFlow" },
      { property: "og:description", content: "Review past voice turns, interruptions and recovery outcomes." },
    ],
  }),
  component: () => (
    <AppShell>
      <HistoryPage />
    </AppShell>
  ),
});

function HistoryPage() {
  const { userId } = useRimeFlow();
  const { data, isLoading } = useQuery({
    queryKey: ["conversations", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Conversation history</h1>
      <p className="mt-2 text-sm text-muted-foreground">Your most recent voice turns with Remi.</p>

      {isLoading && (
        <div className="mt-10 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}

      {!isLoading && (data?.length ?? 0) === 0 && (
        <div className="mt-10 rounded-2xl border border-border bg-card p-10 text-center shadow-elegant">
          <HistoryIcon className="mx-auto h-8 w-8 text-primary" />
          <p className="mt-3 text-sm text-muted-foreground">No conversations yet. Say hello on the Home page.</p>
        </div>
      )}

      <ul className="mt-8 space-y-4">
        {data?.map((row, index) => (
          <li
            key={row.id}
            className="animate-fade-in rounded-2xl border border-border bg-card p-5 shadow-elegant"
            style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
          >
            <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
              <span>{new Date(row.created_at).toLocaleString()}</span>
              <span>· {row.language}</span>
              <span>· {row.voice_provider ?? "no audio"}</span>
              {row.was_interrupted && <span className="text-warning">· interrupted</span>}
            </div>
            <p className="mt-3 text-sm font-medium">{row.request_text}</p>
            <p className="mt-2 text-sm text-muted-foreground">{row.response_text ?? "—"}</p>
            {row.interrupted_text && (
              <p className="mt-2 text-xs text-warning">Superseded: “{row.interrupted_text}”</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
