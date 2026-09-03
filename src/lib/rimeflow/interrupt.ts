import type { VoiceEvent, VoiceEventType } from "./events";

/**
 * InterruptController — the heart of RimeFlow's hard voice problem.
 *
 * It owns the authoritative conversation version. Any async work (LLM, tool,
 * TTS) captures the version it was created under; when the user interrupts, the
 * version is bumped and every older result is fenced out: it can never be
 * spoken, applied, or allowed to overwrite the newer request.
 *
 * This module is intentionally free of DOM/browser APIs so it is unit-testable.
 */

export interface RequestTicket {
  requestId: string;
  taskId: string;
  conversationVersion: number;
  timestamp: number;
  text: string;
}

export interface StaleDecision {
  accepted: boolean;
  reason?: "stale_version" | "cancelled";
}

type Listener = (event: VoiceEvent) => void;

let counter = 0;
function uid(prefix: string): string {
  counter += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${counter}_${rand}`;
}

export class InterruptController {
  private version = 1;
  private current: RequestTicket | null = null;
  private aborts = new Map<number, AbortController>();
  private listeners = new Set<Listener>();
  private events: VoiceEvent[] = [];

  /** Counters used by the metrics page. Only real, observed values. */
  public stats = {
    interruptions: 0,
    interruptionsHandled: 0,
    staleResultsRejected: 0,
    staleResultsLeaked: 0,
    duplicateActions: 0,
    completedRequests: 0,
    failedRequests: 0,
    audioStopLatencies: [] as number[],
    timeToFirstAudio: [] as number[],
    toolDurations: [] as number[],
  };

  private appliedTasks = new Set<string>();

  get currentVersion(): number {
    return this.version;
  }

  get currentRequest(): RequestTicket | null {
    return this.current;
  }

  get log(): VoiceEvent[] {
    return this.events;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(eventType: VoiceEventType, metadata: Record<string, unknown> = {}): VoiceEvent {
    const event: VoiceEvent = {
      eventId: uid("evt"),
      timestamp: Date.now(),
      requestId: this.current?.requestId ?? null,
      conversationVersion: this.version,
      eventType,
      metadata,
    };
    this.events = [...this.events.slice(-499), event];
    this.listeners.forEach((l) => l(event));
    return event;
  }

  /** Create the new authoritative request for the latest user instruction. */
  createRequest(text: string): RequestTicket {
    const ticket: RequestTicket = {
      requestId: uid("req"),
      taskId: uid("task"),
      conversationVersion: this.version,
      timestamp: Date.now(),
      text,
    };
    this.current = ticket;
    this.aborts.set(ticket.conversationVersion, new AbortController());
    this.emit("REQUEST_CREATED", { text, taskId: ticket.taskId });
    return ticket;
  }

  signalFor(version: number): AbortSignal | undefined {
    return this.aborts.get(version)?.signal;
  }

  /**
   * detectInterrupt — the user spoke while older work was still active.
   * Bumps the authoritative version and fences all previous work.
   */
  detectInterrupt(reason: string, meta: Record<string, unknown> = {}): number {
    this.stats.interruptions += 1;
    this.emit("INTERRUPTION_DETECTED", { reason, ...meta });
    this.invalidateConversation();
    this.cancelGeneration();
    return this.version;
  }

  /** invalidateConversation — the old version can no longer touch state. */
  invalidateConversation(): number {
    const old = this.version;
    this.version += 1;
    this.emit("VERSION_INVALIDATED", { invalidatedVersion: old, newVersion: this.version });
    this.aborts.set(this.version, new AbortController());
    return this.version;
  }

  /** cancelGeneration / cancelOrFenceTool — abort what can be aborted, fence the rest. */
  cancelGeneration(): void {
    for (const [version, controller] of this.aborts) {
      if (version < this.version && !controller.signal.aborted) {
        controller.abort();
        this.emit("TOOL_CANCELLED", { cancelledVersion: version });
      }
    }
  }

  cancelOrFenceTool(version: number): void {
    const controller = this.aborts.get(version);
    if (controller && !controller.signal.aborted) controller.abort();
  }

  acceptLatestInstruction(text: string): RequestTicket {
    const ticket = this.createRequest(text);
    this.stats.interruptionsHandled += 1;
    this.emit("NEW_REQUEST_ACCEPTED", { text });
    return ticket;
  }

  /**
   * Gate every async result. Returns accepted:false for anything produced under
   * an older conversation version — that result is never spoken or applied.
   */
  validateResult(version: number, label: string): StaleDecision {
    if (version !== this.version) {
      this.stats.staleResultsRejected += 1;
      this.emit("STALE_RESULT_REJECTED", { rejectedVersion: version, currentVersion: this.version, label });
      return { accepted: false, reason: "stale_version" };
    }
    return { accepted: true };
  }

  rejectStaleResult(version: number, label: string): boolean {
    return !this.validateResult(version, label).accepted;
  }

  /** Late results from an old version are logged for the evidence trail, never applied. */
  reconcileLateResult(version: number, label: string, metadata: Record<string, unknown> = {}): void {
    this.emit("TOOL_COMPLETED", { version, label, applied: version === this.version, ...metadata });
  }

  /** Idempotency fence: the same task can only ever be applied once. */
  markApplied(taskId: string): boolean {
    if (this.appliedTasks.has(taskId)) {
      this.stats.duplicateActions += 1;
      return false;
    }
    this.appliedTasks.add(taskId);
    return true;
  }

  recordAudioStopLatency(ms: number): void {
    this.stats.audioStopLatencies.push(ms);
  }

  recordTimeToFirstAudio(ms: number): void {
    this.stats.timeToFirstAudio.push(ms);
  }

  recordToolDuration(ms: number): void {
    this.stats.toolDurations.push(ms);
  }

  recordCompleted(): void {
    this.stats.completedRequests += 1;
  }

  recordFailure(): void {
    this.stats.failedRequests += 1;
  }

  /** Counted only if a stale payload actually reached the speaker/state. */
  recordStaleLeak(): void {
    this.stats.staleResultsLeaked += 1;
  }

  reset(): void {
    this.version = 1;
    this.current = null;
    this.aborts.clear();
    this.appliedTasks.clear();
    this.events = [];
  }
}

export function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}
