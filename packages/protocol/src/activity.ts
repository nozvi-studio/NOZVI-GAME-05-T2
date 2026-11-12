export type Activity =
  'idle' | 'walking' | 'sitting' | 'working' | 'resting' | 'drinking' | 'waving';
export type ActivityEvent =
  | { type: 'move' }
  | { type: 'stop' }
  | { type: 'sit'; kind: 'desk' | 'sofa' }
  | { type: 'toggleWork' }
  | { type: 'stand' }
  | { type: 'drink' }
  | { type: 'wave' }
  | { type: 'actionDone' };

const SEATED: ReadonlySet<Activity> = new Set(['sitting', 'working', 'resting']);
const FREE: ReadonlySet<Activity> = new Set(['idle', 'walking']);

export const isSeated = (a: Activity): boolean => SEATED.has(a);
export const statusFor = (a: Activity): 'online' | 'working' =>
  a === 'working' ? 'working' : 'online';

export function nextActivity(a: Activity, e: ActivityEvent): Activity {
  switch (e.type) {
    case 'move':
      return isSeated(a) ? a : 'walking';
    case 'stop':
      return a === 'walking' ? 'idle' : a;
    case 'sit':
      return FREE.has(a) ? (e.kind === 'desk' ? 'sitting' : 'resting') : a;
    case 'toggleWork':
      return a === 'sitting' ? 'working' : a === 'working' ? 'sitting' : a;
    case 'stand':
      return isSeated(a) ? 'idle' : a;
    case 'drink':
      return FREE.has(a) ? 'drinking' : a;
    case 'wave':
      return FREE.has(a) ? 'waving' : a;
    case 'actionDone':
      return a === 'drinking' || a === 'waving' ? 'idle' : a;
  }
}
