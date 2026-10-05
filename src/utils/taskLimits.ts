import type { Activity, Task } from '../types'
import { belongsToWeek } from './date'

export function weeklyTaskUses(
  activities: Activity[],
  taskId: string,
  week = new Date(),
): number {
  return activities.filter(
    (activity) =>
      activity.taskId === taskId && belongsToWeek(activity.timestamp, week),
  ).length
}

export function taskLimitReached(
  task: Task,
  activities: Activity[],
  week = new Date(),
): boolean {
  return (
    task.weeklyLimit != null &&
    weeklyTaskUses(activities, task.id, week) >= task.weeklyLimit
  )
}
