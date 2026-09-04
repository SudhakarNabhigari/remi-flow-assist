import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, Loader2, PlayCircle, XCircle } from "lucide-react";

import { AppShell } from "@/components/rimeflow/AppShell";
import { CoordinatorNav } from "@/components/rimeflow/CoordinatorNav";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_TOOL_DELAY_MS } from "@/lib/rimeflow/config";
import { InterruptController } from "@/lib/rimeflow/interrupt";
import { useRimeFlow } from "@/lib/rimeflow/store";

export const Route = createFileRoute("/coordinator/tests")({
  head: () => ({
    meta: [
      { title: "Acceptance tests — RimeFlow coordinator" },
      {
        name: "description",
        content:
          "Run the RimeFlow acceptance scenarios live: interruption during a slow tool call, stale-result rejection and idempotent recovery.",
      },
      { property: "og:title", content: "RimeFlow acceptance tests" },
      {
        property: "og:description",
        content: "Live, in-browser verification of the interruption and recovery guarantees.",
      },
    ],
  }),
  component: TestsRoute,
});

interface Scenario {
  key: string;
  title: string;
  detail: string;
  run: (log: (line: string) => void) => Promise<boolean>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const SCENARIOS: Scenario[] = [
  {
    key: "interrupt_during_slow_tool",
    title: "Interrupt during a slow tool call",
    detail: `A tool takes ${DEFAULT_TOOL_DELAY_MS / 1000}s; the user speaks again mid-call.`,
    run: async (log) => {
      const c = new InterruptController();
      const first = c.createRequest("Find me a hotel in Hyderabad");
      const toolVersion = first.conversationVersion;
      log(`Request v${toolVersion} started, tool running…`);
      const tool = (async () => {
        await sleep(120);
        return "Hotel Aurora, ₹4,200";
      })();
      await sleep(30);
      c.detectInterrupt("user_spoke_while_tool_running");
      const second = c.acceptLatestInstruction("Actually, make it Chennai");
      log(`Interrupt detected → new authoritative version v${second.conversationVersion}`);
      const result = await tool;
      const decision = c.validateResult(toolVersion, "stay_lookup");
      c.reconcileLateResult(toolVersion, "stay_lookup", { result });
      log(decision.accepted ? "FAIL: old tool result was applied" : "Old tool result rejected as stale");
      return !decision.accepted && c.stats.interruptions === 1 && c.stats.staleResultsRejected === 1;
    },
  },
  {
    key: "latest_instruction_wins",
    title: "Latest instruction wins",
    detail: "Three rapid instructions — only the newest may reach the speaker.",
    run: async (log) => {
      const c = new InterruptController();
      const versions: number[] = [];
      for (const text of ["Weather in Delhi", "No — Mumbai", "Actually Goa"]) {
        if (c.currentRequest) c.detectInterrupt("barge_in");
        const t = c.createRequest(text);
        versions.push(t.conversationVersion);
        log(`Accepted "${text}" at v${t.conversationVersion}`);
      }
      const stale = versions.slice(0, -1).map((v) => c.validateResult(v, "llm").accepted);
      const latest = c.validateResult(versions[versions.length - 1]!, "llm").accepted;
      log(`Stale accepted: ${stale.filter(Boolean).length}, latest accepted: ${latest}`);
      return latest && stale.every((a) => !a);
    },
  },
  {
    key: "idempotent_recovery",
    title: "Idempotent recovery",
    detail: "A retried task must never be applied twice.",
    run: async (log) => {
      const c = new InterruptController();
      const t = c.createRequest("Book it");
      const first = c.markApplied(t.taskId);
      const second = c.markApplied(t.taskId);
      log(`First apply: ${first}, duplicate apply: ${second}`);
      return first && !second && c.stats.duplicateActions === 1;
    },
  },
  {
    key: "abort_signal_fencing",
    title: "In-flight work is aborted",
    detail: "Superseded versions get their AbortSignal fired.",
    run: async (log) => {
      const c = new InterruptController();
      const t = c.createRequest("Long story please");
      const signal = c.signalFor(t.conversationVersion);
      c.detectInterrupt("barge_in");
      log(`Signal aborted: ${signal?.aborted}`);
      return signal?.aborted === true;
    },
  },
];

type Status = "idle" | "running" | "pass" | "fail";

function TestsRoute() {
  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="text-3xl font-bold tracking-tight">Acceptance tests</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          These run the real coordinator code in your browser and save each result to your account.
        </p>
        <div className="mt-8" />
        <CoordinatorNav />
        <Runner />
      </div>
    </AppShell>
  );
}

function Runner() {
  const { userId } = useRimeFlow();
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [logs, setLogs] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);

  const runAll = async () => {
    setBusy(true);
    for (const scenario of SCENARIOS) {
      setStatus((s) => ({ ...s, [scenario.key]: "running" }));
      setLogs((l) => ({ ...l, [scenario.key]: [] }));
      const lines: string[] = [];
      const push = (line: string) => {
        lines.push(line);
        setLogs((l) => ({ ...l, [scenario.key]: [...lines] }));
      };
      let passed = false;
      const startedAt = performance.now();
      try {
        passed = await scenario.run(push);
      } catch (error) {
        push(error instanceof Error ? error.message : String(error));
      }
      const durationMs = Math.round(performance.now() - startedAt);
      setStatus((s) => ({ ...s, [scenario.key]: passed ? "pass" : "fail" }));
      if (userId) {
        await supabase.from("test_runs").insert({
          user_id: userId,
          test_key: scenario.key,
          status: passed ? "pass" : "fail",
          log: lines,
          metrics: { durationMs },
        });
      }
    }
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      <Button onClick={() => void runAll()} disabled={busy} size="lg">
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
        {busy ? "Running…" : "Run all scenarios"}
      </Button>

      {SCENARIOS.map((s) => {
        const st = status[s.key] ?? "idle";
        return (
          <div
            key={s.key}
            className="rounded-2xl border border-border bg-card p-5 transition-all duration-200 hover:shadow-sm"
          >
            <div className="flex items-start gap-3">
              {st === "pass" ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-primary" />
              ) : st === "fail" ? (
                <XCircle className="mt-0.5 h-5 w-5 text-destructive" />
              ) : st === "running" ? (
                <Loader2 className="mt-0.5 h-5 w-5 animate-spin text-primary" />
              ) : (
                <div className="mt-1 h-4 w-4 rounded-full border-2 border-border" />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{s.title}</p>
                <p className="text-sm text-muted-foreground">{s.detail}</p>
                {(logs[s.key]?.length ?? 0) > 0 && (
                  <ul className="mt-3 space-y-1 rounded-lg bg-background/60 p-3 font-mono text-[11px] text-foreground/75">
                    {logs[s.key]!.map((line, i) => (
                      <li key={i} className="animate-fade-in">
                        {line}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
