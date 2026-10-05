import { describe, expect, it } from 'vitest'
import { TEMPLATE_SEED } from '../../src/data/taskSeeds'
import type { Activity, Task } from '../../src/types'
import { taskLimitReached, weeklyTaskUses } from '../../src/utils/taskLimits'

const week = new Date(2026, 9, 7, 12)
const task: Task = {
  ...TEMPLATE_SEED[0],
  note: '',
  order: 0,
  createdAt: week.toISOString(),
  updatedAt: week.toISOString(),
}

function activity(timestamp: Date, taskId = task.id): Activity {
  return {
    activityId: crypto.randomUUID(),
    userId: 'owner',
    taskId,
    taskName: task.name,
    taskDescription: task.description,
    category: task.category,
    configuredPoints: task.points,
    timestamp: timestamp.toISOString(),
    note: '',
    createdAt: timestamp.toISOString(),
    updatedAt: timestamp.toISOString(),
  }
}

describe('task weekly limits', () => {
  it('defaults to unlimited and counts raw logs rather than capped points', () => {
    const activities = Array.from({ length: 6 }, () => activity(week))
    expect(taskLimitReached(task, activities, week)).toBe(false)
    expect(weeklyTaskUses(activities, task.id, week)).toBe(6)
    expect(
      taskLimitReached({ ...task, weeklyLimit: 6 }, activities, week),
    ).toBe(true)
  })

  it('counts only the matching task in the local Monday to Sunday week', () => {
    const sunday = new Date(2026, 9, 11, 23, 59, 59)
    const monday = new Date(2026, 9, 12, 0, 0, 0)
    const activities = [
      activity(sunday),
      activity(monday),
      activity(sunday, 'another-task'),
    ]
    expect(weeklyTaskUses(activities, task.id, week)).toBe(1)
    expect(
      taskLimitReached({ ...task, weeklyLimit: 1 }, activities, week),
    ).toBe(true)
    expect(weeklyTaskUses(activities, task.id, monday)).toBe(1)
  })
})
