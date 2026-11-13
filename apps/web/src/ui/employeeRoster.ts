import type { Activity } from '@office/protocol';
import type { EmployeeSource, ReplicatedEmployee } from '../net';
import { presenceLabel } from '../game/hud/activityLabel';

/** One row of the online employee list (REQ-UI-003). */
export type RosterEntry = {
  readonly sessionId: string;
  readonly name: string;
  /** Shared activity label, the same text the nameplate shows ("Reconnecting…" while held). */
  readonly label: string;
  /** False while the server holds a disconnected employee's reservation. */
  readonly connected: boolean;
  readonly isLocal: boolean;
};

type Tracked = { employee: ReplicatedEmployee; entry: RosterEntry; unsubscribe: () => void };

function entryFor(sessionId: string, e: ReplicatedEmployee, isLocal: boolean): RosterEntry {
  const connected = e.connected !== false;
  return {
    sessionId,
    name: e.name,
    label: presenceLabel(e.activity as Activity, connected),
    connected,
    isLocal,
  };
}

const sameEntry = (a: RosterEntry, b: RosterEntry) =>
  a.name === b.name && a.label === b.label && a.connected === b.connected;

/** Local player first, then by name, then by session id for a stable order. */
function compare(a: RosterEntry, b: RosterEntry): number {
  if (a.isLocal !== b.isLocal) return a.isLocal ? -1 : 1;
  return a.name.localeCompare(b.name) || (a.sessionId < b.sessionId ? -1 : 1);
}

/**
 * Employee list derived from room state, shaped for `useSyncExternalStore`: the snapshot
 * keeps its identity until an employee joins, leaves, or changes name, label or connection.
 * Position-only patches (every movement tick) therefore never notify or re-render.
 */
export class EmployeeRoster {
  private readonly tracked = new Map<string, Tracked>();
  private snapshot: readonly RosterEntry[] = [];
  private readonly listeners = new Set<() => void>();
  private unsubscribe: (() => void)[] = [];

  constructor(
    source: EmployeeSource,
    private readonly localSessionId: string,
  ) {
    this.bind(source);
  }

  /**
   * REQ-NET-005: after a reconnect the room handle is new; rebuild the list from its full
   * state. Listeners stay subscribed and are notified once.
   */
  rebind(source: EmployeeSource): void {
    this.unbind();
    this.bind(source);
    this.publish();
  }

  private bind(source: EmployeeSource): void {
    const localSessionId = this.localSessionId;
    this.unsubscribe = [
      source.onAdd((sessionId, employee) => {
        this.tracked.get(sessionId)?.unsubscribe();
        const tracked: Tracked = {
          employee,
          entry: entryFor(sessionId, employee, sessionId === localSessionId),
          unsubscribe: source.onChange(employee, () => this.refresh(sessionId)),
        };
        this.tracked.set(sessionId, tracked);
        this.publish();
      }),
      source.onRemove((sessionId) => {
        const tracked = this.tracked.get(sessionId);
        if (!tracked) return;
        tracked.unsubscribe();
        this.tracked.delete(sessionId);
        this.publish();
      }),
    ];
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): readonly RosterEntry[] => this.snapshot;

  /** Employees in the room, including any whose reconnect reservation is running. */
  get count(): number {
    return this.snapshot.length;
  }

  dispose(): void {
    this.unbind();
    this.listeners.clear();
  }

  private unbind(): void {
    for (const off of this.unsubscribe) off();
    this.unsubscribe = [];
    for (const tracked of this.tracked.values()) tracked.unsubscribe();
    this.tracked.clear();
  }

  private refresh(sessionId: string): void {
    const tracked = this.tracked.get(sessionId);
    if (!tracked) return;
    const next = entryFor(sessionId, tracked.employee, sessionId === this.localSessionId);
    if (sameEntry(next, tracked.entry)) return;
    tracked.entry = next;
    this.publish();
  }

  private publish(): void {
    this.snapshot = [...this.tracked.values()].map((t) => t.entry).sort(compare);
    for (const listener of [...this.listeners]) listener();
  }
}
