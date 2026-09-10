import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  History as HistoryIcon,
  Loader2,
  Trash2,
  Share2,
  Check,
  AlertTriangle,
} from "lucide-react";
import { useState } from "react";

import { AppShell } from "@/components/rimeflow/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useRimeFlow } from "@/lib/rimeflow/store";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "Conversation history — RimeFlow" },
      {
        name: "description",
        content:
          "Every RimeFlow voice turn, with interruptions and recovery outcomes.",
      },
      { property: "og:title", content: "Conversation history — RimeFlow" },
      {
        property: "og:description",
        content:
          "Review past voice turns, interruptions and recovery outcomes.",
      },
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
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [sharedId, setSharedId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
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

  const deleteConversation = async (id: string) => {
    const confirmed = window.confirm(
      "Delete this conversation permanently?",
    );

    if (!confirmed) return;

    setDeletingId(id);

    const { error } = await supabase
      .from("conversations")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    setDeletingId(null);

    if (error) {
      window.alert(`Unable to delete conversation: ${error.message}`);
      return;
    }

    await queryClient.invalidateQueries({
      queryKey: ["conversations", userId],
    });
  };

  const shareConversation = async (row: any) => {
    const interruptedSection = row.was_interrupted
      ? `\n\nINTERRUPTION:\n${row.interrupted_text ?? "Interrupted during this turn."}\nRecovery: ${row.recovery_status ?? "unknown"}`
      : "";

    const text = [
      "RimeFlow Conversation",
      `Date: ${new Date(row.created_at).toLocaleString()}`,
      "",
      `You: ${row.request_text}`,
      "",
      `Remi: ${row.response_text ?? "No response recorded."}`,
      interruptedSection,
    ].join("");

    try {
      if (navigator.share) {
        await navigator.share({
          title: "RimeFlow Conversation",
          text,
        });
      } else {
        await navigator.clipboard.writeText(text);
        setSharedId(row.id);
        window.setTimeout(() => setSharedId(null), 2000);
      }
    } catch {
      // User cancelled native sharing; do nothing.
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Conversation history
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your most recent voice turns with Remi.
          </p>
        </div>

        <div className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
          {data?.length ?? 0} conversations
        </div>
      </div>

      {isLoading && (
        <div className="mt-10 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}

      {error && (
        <div className="mt-8 rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
          Unable to load conversation history.
        </div>
      )}

      {!isLoading && !error && (data?.length ?? 0) === 0 && (
        <div className="mt-10 rounded-2xl border border-border bg-card p-10 text-center shadow-elegant">
          <HistoryIcon className="mx-auto h-8 w-8 text-primary" />
          <p className="mt-3 text-sm text-muted-foreground">
            No conversations yet. Say hello on the Home page.
          </p>
        </div>
      )}

      <ul className="mt-8 space-y-5">
        {data?.map((row, index) => {
          const wasInterrupted = Boolean(row.was_interrupted);

          return (
            <li
              key={row.id}
              className="animate-fade-in rounded-2xl border border-border bg-card p-5 shadow-elegant"
              style={{
                animationDelay: `${Math.min(index, 8) * 40}ms`,
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <span>
                    {new Date(row.created_at).toLocaleString()}
                  </span>
                  <span>· {row.language}</span>
                  <span>
                    · {row.voice_provider ?? "no audio"}
                  </span>
                </div>

                {wasInterrupted && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-warning">
                    <AlertTriangle className="h-3 w-3" />
                    Interrupted
                  </span>
                )}
              </div>

              <div className="mt-5 rounded-xl border border-border/70 bg-background/50 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  You
                </p>
                <p className="mt-2 text-sm font-medium">
                  {row.request_text}
                </p>
              </div>

              <div className="mt-3 rounded-xl border border-border/70 bg-background/50 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Remi
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {row.response_text ?? "No response recorded."}
                </p>
              </div>

              {wasInterrupted && (
                <div className="mt-3 rounded-xl border border-warning/30 bg-warning/5 p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-warning">
                    <AlertTriangle className="h-4 w-4" />
                    Interruption point
                  </div>

                  <p className="mt-2 text-sm font-medium">
                    The original response was interrupted when the user said:
                  </p>

                  <p className="mt-2 rounded-lg border border-warning/20 bg-background/50 p-3 text-sm text-warning">
                    “{row.interrupted_text ?? "Interrupted text not recorded."}”
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full border border-border px-2.5 py-1">
                      Recovery: {row.recovery_status ?? "unknown"}
                    </span>
                    <span className="rounded-full border border-border px-2.5 py-1">
                      Version: {row.conversation_version}
                    </span>
                  </div>
                </div>
              )}

              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => void shareConversation(row)}
                  className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-medium transition hover:bg-muted"
                >
                  {sharedId === row.id ? (
                    <>
                      <Check className="h-4 w-4" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Share2 className="h-4 w-4" />
                      Share
                    </>
                  )}
                </button>

                <button
                  type="button"
                  disabled={deletingId === row.id}
                  onClick={() => void deleteConversation(row.id)}
                  className="inline-flex items-center gap-2 rounded-xl border border-destructive/30 px-3 py-2 text-xs font-medium text-destructive transition hover:bg-destructive/10 disabled:opacity-50"
                >
                  {deletingId === row.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Delete
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
