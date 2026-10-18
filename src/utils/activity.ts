import type { Activity } from '../types'

export function previousWeekCopyId(activityId: string): string {
  return `previous_week_${activityId}`
}

// The original stays in the recent log; its previous-week copy earns the points.
export function scoredActivities(activities: Activity[]): Activity[] {
  const ids = new Set(activities.map((activity) => activity.activityId))
  return activities.filter(
    (activity) => !ids.has(previousWeekCopyId(activity.activityId)),
  )
}
