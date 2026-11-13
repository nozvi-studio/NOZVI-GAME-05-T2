import { officeLayout, type Activity, type PlayerState, type Vec3 } from '@office/protocol';

/** A desk or sofa seat socket from the office layout. */
export type SeatSocket = {
  id: string;
  kind: 'desk' | 'sofa';
  position: Vec3;
  /** Degrees, as in the layout. */
  rotY: number;
  interactionPoint: Vec3;
};

const SOCKETS: ReadonlyMap<string, SeatSocket> = new Map<string, SeatSocket>([
  ...officeLayout.workstations.map((w): [string, SeatSocket] => [
    w.seat.id,
    { ...w.seat, kind: 'desk', interactionPoint: w.interactionPoint },
  ]),
  ...officeLayout.sofaSeats.map((s): [string, SeatSocket] => [s.id, { ...s, kind: 'sofa' }]),
]);

/** The socket of a replicated `seatId`, or null for '' and unknown ids. */
export function seatSocket(seatId: string): SeatSocket | null {
  return SOCKETS.get(seatId) ?? null;
}

/** The pose an employee on `socket` has (heading in radians), as the server sets it. */
export function seatPose(socket: SeatSocket): PlayerState {
  return {
    x: socket.position[0],
    z: socket.position[2],
    heading: (socket.rotY * Math.PI) / 180,
  };
}

const ACTIVITIES: ReadonlySet<string> = new Set<Activity>([
  'idle',
  'walking',
  'sitting',
  'working',
  'resting',
  'drinking',
  'waving',
]);

/** A replicated activity string as an `Activity`; unknown values read as idle. */
export function toActivity(value: string): Activity {
  return ACTIVITIES.has(value) ? (value as Activity) : 'idle';
}
