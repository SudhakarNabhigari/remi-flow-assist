import { describe, expect, it } from "vitest";

import { InterruptController } from "./interrupt";
import { matchesWakePhrase, stripWakePhrase } from "./stt";

/**
 * ACCEPTANCE TEST — "interrupt and recover under delayed tool work".
 * Mirrors the runtime pipeline: v1 starts a slow tool, the user interrupts,
 * v2 becomes authoritative, and the late v1 result must be rejected.
 */
describe("interrupt + recovery engine", () => {
  it("rejects a stale tool result that returns after an interruption", async () => {
    const controller = new InterruptController();
    const v1 = controller.createRequest("I need a hotel in Goa tomorrow.");
    const spoken: string[] = [];

    const slowTool = new Promise<string>((resolve) => setTimeout(() => resolve("hotel results"), 60));

    // User barges in while the tool is still running.
    controller.detectInterrupt("user_spoke_during_active_turn");
    const v2 = controller.acceptLatestInstruction("Wait! Not a hotel. I need a duplex villa.");

    const late = await slowTool;
    const decision = controller.validateResult(v1.conversationVersion, "stay_lookup");
    if (decision.accepted) spoken.push(late);

    expect(decision.accepted).toBe(false);
    expect(decision.reason).toBe("stale_version");
    expect(spoken).toHaveLength(0);
    expect(v2.conversationVersion).toBe(2);
    expect(controller.currentVersion).toBe(2);
    expect(controller.currentRequest?.text).toContain("duplex villa");
    expect(controller.stats.staleResultsRejected).toBe(1);
    expect(controller.log.some((e) => e.eventType === "STALE_RESULT_REJECTED")).toBe(true);
    expect(controller.log.some((e) => e.eventType === "VERSION_INVALIDATED")).toBe(true);
  });

  it("accepts the newest result and aborts fenced work", () => {
    const controller = new InterruptController();
    const v1 = controller.createRequest("hotel");
    const signal = controller.signalFor(v1.conversationVersion);
    controller.detectInterrupt("test");
    const v2 = controller.acceptLatestInstruction("duplex villa");

    expect(signal?.aborted).toBe(true);
    expect(controller.validateResult(v2.conversationVersion, "agent_reply").accepted).toBe(true);
  });

  it("never applies the same task twice", () => {
    const controller = new InterruptController();
    const ticket = controller.createRequest("book it");
    expect(controller.markApplied(ticket.taskId)).toBe(true);
    expect(controller.markApplied(ticket.taskId)).toBe(false);
    expect(controller.stats.duplicateActions).toBe(1);
  });

  it("reports metrics only from observed values", () => {
    const controller = new InterruptController();
    expect(controller.stats.audioStopLatencies).toHaveLength(0);
    controller.recordAudioStopLatency(12);
    expect(controller.stats.audioStopLatencies).toEqual([12]);
  });
});

describe("wake phrase matching", () => {
  it("matches any configured nickname", () => {
    expect(matchesWakePhrase("hey remi, what's up", "Remi")).toBe(true);
    expect(matchesWakePhrase("Hey Sam!", "Sam")).toBe(true);
    expect(matchesWakePhrase("okay nova play music", "Nova")).toBe(true);
    expect(matchesWakePhrase("hello jarvis", "Jarvis")).toBe(true);
    expect(matchesWakePhrase("hey remi", "Sam")).toBe(false);
  });

  it("strips the wake phrase from the instruction", () => {
    expect(stripWakePhrase("Hey Sam, book a villa", "Sam")).toBe("book a villa");
    expect(stripWakePhrase("Hey Remi", "Remi")).toBe("");
  });
});
