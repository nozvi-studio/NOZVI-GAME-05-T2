import type { Activity } from '@office/protocol';

/** Marker for an employee whose connection dropped and whose reservation is running. */
export const RECONNECTING_LABEL = 'Reconnecting…';

/** Status text for a replicated employee: the reconnecting marker wins over the activity. */
export function presenceLabel(activity: Activity, connected: boolean | undefined): string {
  return connected === false ? RECONNECTING_LABEL : activityLabel(activity);
}

/** Nameplate status text for an activity; shared by the local player and remote avatars. */
export function activityLabel(activity: Activity): string {
  switch (activity) {
    case 'working':
      return 'Working';
    case 'drinking':
      return 'Break';
    case 'resting':
      return 'Resting';
    default:
      return 'Online';
  }
}
