import { Callbacks } from '@colyseus/sdk';
import type { OfficeRoomHandle } from './connection';

/** The replicated employee fields a remote view reads; a live schema instance in practice. */
export type ReplicatedEmployee = {
  readonly name: string;
  readonly avatarId: string;
  readonly x: number;
  readonly z: number;
  readonly heading: number;
  readonly activity: string;
  /** Seat held ('' = none); a seated employee is drawn on the seat socket. */
  readonly seatId: string;
};

/** Add / remove / change notifications for `room.state.employees`; each returns an unsubscribe. */
export type EmployeeSource = {
  /** Also reports employees already in the state when subscribing. */
  onAdd(handler: (sessionId: string, employee: ReplicatedEmployee) => void): () => void;
  onRemove(handler: (sessionId: string) => void): () => void;
  /** Fires once per received patch that changed this employee. */
  onChange(employee: ReplicatedEmployee, handler: () => void): () => void;
};

/** Adapts the joined room's schema callbacks (@colyseus/sdk 0.18 `Callbacks`). */
export function employeeSource(room: OfficeRoomHandle): EmployeeSource {
  const callbacks = Callbacks.get(room);
  return {
    onAdd: (handler) =>
      callbacks.onAdd('employees', (employee, key) => handler(key, employee), true),
    onRemove: (handler) => callbacks.onRemove('employees', (_employee, key) => handler(key)),
    onChange: (employee, handler) => callbacks.onChange(employee as object, handler),
  };
}
