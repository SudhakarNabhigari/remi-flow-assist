import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2 } from "lucide-react";

import { AppShell } from "@/components/rimeflow/AppShell";
import { getRimeStatus } from "@/lib/rimeflow/voice.functions";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About RimeFlow — real-time interruption handling" },
      {
        name: "description",
        content:
          "How RimeFlow handles barge-in, version fencing, stale-result rejection and multilingual Rime speech.",
      },
      { property: "og:title", content: "About RimeFlow" },
      { property: "og:description", content: "Barge-in, version fencing and multilingual Rime speech, explained." },
    ],
  }),
  component: () => (
    <AppShell>
      <AboutPage />
    </AppShell>
  ),
});

const FEATURES = [
  ["Instant barge-in", "The first word you speak stops Remi's audio immediately."],
  ["Version fencing", "Every turn carries a conversation version; older work is cancelled."],
  ["Stale-result rejection", "Late tool or model results from an old turn are never spoken."],
  ["Multilingual", "English, Telugu and Hindi speech in and out."],
  ["Rime-first speech", "Rime is the primary voice; any fallback is clearly disclosed."],
  ["Persistent memory", "Settings and conversation history are saved to your account."],
];

function AboutPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["rime-status"],
    queryFn: () => getRimeStatus(),
  });

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">
        About <span className="text-gradient-blue">RimeFlow</span>
      </h1>
      <p className="mt-3 max-w-xl text-sm text-muted-foreground">
        RimeFlow is a real-time voice assistant built for the Rime Hackathon. Remi listens continuously,
        speaks with Rime, and reacts the instant you change your mind mid-sentence.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {FEATURES.map(([title, body], index) => (
          <div
            key={title}
            className="animate-fade-in rounded-2xl border border-border bg-card p-5 shadow-elegant"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <CheckCircle2 className="h-5 w-5 text-primary" />
            <p className="mt-3 text-sm font-semibold">{title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{body}</p>
          </div>
        ))}
      </div>

      <section className="mt-10 rounded-2xl border border-border bg-card p-6 shadow-elegant">
        <h2 className="text-lg font-semibold">Rime connection</h2>
        {isLoading ? (
          <Loader2 className="mt-4 h-5 w-5 animate-spin text-primary" />
        ) : (
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <Row label="API key configured" value={data?.configured ? "Yes" : "No"} />
            <Row label="Model" value={String(data?.model ?? "—")} />
            <Row label="Default speaker" value={String(data?.speaker ?? "—")} />
            <Row label="Language" value={String(data?.language ?? "—")} />
          </dl>
        )}
        {!isLoading && !data?.configured && (
          <p className="mt-4 text-xs text-warning">
            No Rime API key is configured yet. Speech runs on the disclosed fallback voice until
            RIME_API_KEY is added.
          </p>
        )}
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted px-4 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium">{value}</dd>
    </div>
  );
}
