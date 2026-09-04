import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, Loader2 } from "lucide-react";

import { AppShell } from "@/components/rimeflow/AppShell";
import { getRimeStatus } from "@/lib/rimeflow/voice.functions";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About RimeFlow — hackathon requirement scorecard" },
      {
        name: "description",
        content:
          "How RimeFlow answers all 25 Rime Hackathon requirements: barge-in, version fencing, stale-result rejection and multilingual Rime speech.",
      },
      { property: "og:title", content: "About RimeFlow" },
      { property: "og:description", content: "The full Rime Hackathon requirement scorecard, answered line by line." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppShell>
      <AboutPage />
    </AppShell>
  ),
});

interface Requirement {
  title: string;
  need: string;
  done: string;
}

const GROUPS: { group: string; accent: string; items: Requirement[] }[] = [
  {
    group: "Voice-native product",
    accent: "from-primary to-primary-bright",
    items: [
      {
        title: "Voice-Native Product",
        need: "Voice must be essential, not a play button on a chatbot.",
        done: "There is no text box anywhere — the mic arms itself at login and every turn is spoken.",
      },
      {
        title: "Hard Voice Problem",
        need: "Solve one meaningful voice challenge under realistic conditions.",
        done: "Our hard problem: interrupting a long-running booking lookup mid-answer and switching intent.",
      },
      {
        title: "Real Product Path",
        need: "Static screens or scripted mocks are not enough.",
        done: "Live mic → STT → LLM → Rime TTS, with the database recording every turn.",
      },
      {
        title: "Rime Integration",
        need: "Rime cannot be used only for welcome messages.",
        done: "Rime speaks every reply, preview, confirmation and welcome — one shared synthesis path.",
      },
    ],
  },
  {
    group: "Interruption & recovery (our focus)",
    accent: "from-primary-bright to-primary",
    items: [
      {
        title: "Interruption & Recovery",
        need: "Stop the current response immediately when the user interrupts.",
        done: "The first partial word stops audio synchronously; stop latency is measured in the Coordinator.",
      },
      {
        title: "Cancel Obsolete Work",
        need: "Cancel or fence previous model/tool work after an interruption.",
        done: "Each turn holds a conversation version; interrupting bumps it and aborts that version's work.",
      },
      {
        title: "Reject Stale Results",
        need: "Delayed old results must never enter the conversation.",
        done: "Every await is version-checked; late results are logged as STALE_RESULT_REJECTED and dropped.",
      },
      {
        title: "Conversation Continuity",
        need: "Stay responsive while tools or lookups run.",
        done: "The mic never closes during tool work, so you can redirect mid-lookup.",
      },
      {
        title: "Full Duplex",
        need: "Accept speech while Rime is speaking or tools execute.",
        done: "Recognition and playback run concurrently — listening is never paused for output.",
      },
      {
        title: "Latest Intent Wins",
        need: "The final answer reflects the most recent request.",
        done: "Only the newest ticket can apply a result; older ones are fenced out permanently.",
      },
    ],
  },
  {
    group: "Speech, language & fallback",
    accent: "from-primary to-primary-bright",
    items: [
      {
        title: "Rime Primary Output",
        need: "Rime provides the primary spoken output.",
        done: "Rime is attempted first on every utterance; anything else is an explicit, labelled fallback.",
      },
      {
        title: "Multilingual Support",
        need: "Claimed languages must be properly tested.",
        done: "English, Telugu and Hindi are auto-detected from your speech and mapped to Rime eng/tel/hin.",
      },
      {
        title: "Visible Provider / Fallback",
        need: "Active provider and fallback must be observable.",
        done: "A live badge on Home names the provider and speaker, and prints the fallback reason.",
      },
      {
        title: "Current Rime Configuration",
        need: "Use a compatible current model, voice, language, endpoint and audio config.",
        done: "The About panel below reads the live configuration and the connected Rime voice catalogue.",
      },
      {
        title: "Safety & Failure Handling",
        need: "Handle unsupported inputs and dependency failures clearly.",
        done: "Unavailable voices, blocked mics, rate limits and credit errors surface as plain-language notices.",
      },
    ],
  },
  {
    group: "Evidence, testing & delivery",
    accent: "from-primary-bright to-primary",
    items: [
      {
        title: "Realistic Stress Test",
        need: "Show a normal interaction plus a deliberate interruption/failure case.",
        done: "Coordinator → Acceptance tests runs both live, against the real pipeline.",
      },
      {
        title: "Acceptance Test",
        need: "Define and test the hard voice problem before the demo.",
        done: "Six automated interrupt tests plus in-browser scenarios, all saved to the database.",
      },
      {
        title: "Measurement",
        need: "Measure user-visible behaviour, not unsupported claims.",
        done: "We record stop latency, time-to-first-audio, tool duration and stale rejections — no invented numbers.",
      },
      {
        title: "Demo",
        need: "Show user, problem, normal flow, hard case, stress case, result and provider.",
        done: "The demo script follows Home → interruption → Coordinator evidence, with the provider badge on screen.",
      },
      {
        title: "Demo Limit",
        need: "Recorded demo of 4–5 minutes maximum.",
        done: "The scripted run fits inside four minutes end to end.",
      },
      {
        title: "Working Repository",
        need: "Submitted code contains the demonstrated behaviour.",
        done: "Everything shown lives in this repository — no hidden branch, no staged recording.",
      },
      {
        title: "README",
        need: "Document setup, architecture, services, limitations, failure behaviour and Rime config.",
        done: "README.md covers all of it, including the exact environment variables.",
      },
      {
        title: "RIME_EVIDENCE.md",
        need: "Document the voice claim, acceptance test, procedure, result and limitations.",
        done: "RIME_EVIDENCE.md records the claim and the measured outcome of each run.",
      },
      {
        title: "Configuration Hygiene",
        need: "Use environment variables and never expose secrets.",
        done: "Rime and model keys are read only inside server handlers; .env.example ships placeholders.",
      },
      {
        title: "Reproducibility",
        need: "Provide a repeatable command, script or fixture.",
        done: "`bunx vitest run` reproduces the interrupt suite; the Coordinator reruns the live scenarios.",
      },
    ],
  },
];

const TOTAL = GROUPS.reduce((n, g) => n + g.items.length, 0);

function AboutPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["rime-status"],
    queryFn: () => getRimeStatus(),
  });

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <header className="animate-fade-in">
        <p className="text-xs font-semibold uppercase tracking-[0.32em] text-primary/70">Rime Hackathon</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">
          The <span className="text-gradient-blue">RimeFlow</span> scorecard
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Every submission requirement, in one line each, with exactly how this app answers it. Tap a card to
          read the requirement itself. Our core focus is <strong>interruption and recovery</strong>.
        </p>
        <div className="mt-5 flex flex-wrap gap-2 text-xs">
          <Chip>{TOTAL} requirements covered</Chip>
          <Chip>Focus: interruption + recovery</Chip>
          <Chip>Rime = primary speech</Chip>
        </div>
      </header>

      <div className="mt-10 space-y-8">
        {GROUPS.map((group, gi) => (
          <section key={group.group} className="animate-fade-in" style={{ animationDelay: `${gi * 70}ms` }}>
            <div className="flex items-center gap-3">
              <span className={`h-1.5 w-10 rounded-full bg-gradient-to-r ${group.accent}`} />
              <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-foreground/80">{group.group}</h2>
              <span className="text-xs text-muted-foreground">{group.items.length}</span>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {group.items.map((item) => (
                <details
                  key={item.title}
                  className="card-lift group rounded-2xl border border-border bg-card p-4 shadow-elegant"
                >
                  <summary className="flex cursor-pointer list-none items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span className="flex-1">
                      <span className="block text-sm font-semibold">{item.title}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">{item.done}</span>
                    </span>
                    <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                  </summary>
                  <p className="mt-3 rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground/70">Requirement: </span>
                    {item.need}
                  </p>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>

      <section className="mt-12 rounded-2xl border border-border bg-card p-6 shadow-elegant">
        <h2 className="text-lg font-semibold">Live Rime configuration</h2>
        <p className="mt-1 text-sm text-muted-foreground">Read from the server right now — nothing hard-coded.</p>
        {isLoading ? (
          <Loader2 className="mt-4 h-5 w-5 animate-spin text-primary" />
        ) : (
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <Row label="API key configured" value={data?.configured ? "Yes" : "No"} />
            <Row label="Model" value={String(data?.model ?? "—")} />
            <Row label="Default speaker" value={String(data?.speaker ?? "—")} />
            <Row label="Language" value={String(data?.language ?? "—")} />
            <Row label="Audio format" value={String(data?.audioFormat ?? "—")} />
            <Row label="Catalogue voices" value={String(data?.catalogSpeakerCount ?? 0)} />
          </dl>
        )}
        {!isLoading && !data?.configured && (
          <p className="mt-4 text-xs text-warning">
            No Rime API key is configured yet. Speech runs on the clearly disclosed fallback voice until
            RIME_API_KEY is added.
          </p>
        )}
      </section>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-border bg-card px-3 py-1 font-medium text-foreground/80 shadow-sm">
      {children}
    </span>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted px-4 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium">{value}</dd>
    </div>
  );
}
