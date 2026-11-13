import type { Activity } from '@office/protocol';

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
