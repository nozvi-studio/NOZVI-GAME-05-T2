import { schema, t, type SchemaType } from '@colyseus/schema';

/**
 * Replicated employee. Built with `schema()` instead of decorators so the same module
 * compiles under tsx (server) and Vite (web) without legacy decorator settings.
 * Positions are float64 so reconciliation compares exactly what the server computed.
 */
export const EmployeeState = schema(
  {
    name: t.string(),
    avatarId: t.string(),
    x: t.float64(),
    z: t.float64(),
    heading: t.float64(),
    /** An `Activity` value from `activity.ts`. */
    activity: t.string().default('idle'),
    /** Empty string when not seated. */
    seatId: t.string().default(''),
    /** False while the server holds the slot for a reconnect. */
    connected: t.boolean().default(true),
    /** Last input sequence number the server applied for this employee. */
    lastSeq: t.uint32().default(0),
  },
  'EmployeeState',
);
export type EmployeeState = SchemaType<typeof EmployeeState>;

/** Room state; employees are keyed by Colyseus sessionId. */
export const OfficeState = schema(
  {
    employees: t.map(EmployeeState),
  },
  'OfficeState',
);
export type OfficeState = SchemaType<typeof OfficeState>;
