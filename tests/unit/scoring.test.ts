import { describe, expect, it } from 'vitest'
import type { Activity, Category } from '../../src/types'
import {
  calculateCategoryScore,
  calculateWeeklyScore,
  getWeeklyCategoryBreakdown,
  groupActivitiesByCategory,
} from '../../src/utils/scoring'

const week = new Date(2026, 8, 28)
let nextId = 0
function activity(
  category: Category = 'growth',
  points = 5,
  day = new Date(2026, 8, 28),
): Activity {
  return {
    activityId: String(++nextId),
    userId: 'u',
    taskId: 'task',
    taskName: 'Original name',
    taskDescription: 'Original description',
    category,
    configuredPoints: points,
    timestamp: day.toISOString(),
    note: '',
    createdAt: day.toISOString(),
    updatedAt: day.toISOString(),
  }
}

describe('weekly scoring', () => {
  it('starts at zero and scores a single activity', () => {
    expect(calculateWeeklyScore([], week)).toBe(0)
    expect(calculateCategoryScore([activity()], 'growth')).toBe(5)
  })
  it('caps five and six five-point activities at 25 without changing raw data', () => {
    const five = Array.from({ length: 5 }, () => activity())
    const six = [...five, activity()]
    expect(calculateCategoryScore(five, 'growth')).toBe(25)
    expect(calculateCategoryScore(six, 'growth')).toBe(25)
    expect(six).toHaveLength(6)
    expect(six.every((item) => item.configuredPoints === 5)).toBe(true)
  })
  it('caps every category and the total', () => {
    const entries: Activity[] = ['growth', 'people', 'life', 'play'].flatMap(
      (category) =>
        Array.from({ length: 6 }, () => activity(category as Category)),
    )
    expect(calculateWeeklyScore(entries, week)).toBe(100)
    expect(Object.values(getWeeklyCategoryBreakdown(entries, week))).toEqual([
      25, 25, 25, 25,
    ])
  })
  it('groups activities by category', () => {
    const groups = groupActivitiesByCategory([
      activity('life'),
      activity('life'),
      activity('play'),
    ])
    expect(groups.life).toHaveLength(2)
    expect(groups.play).toHaveLength(1)
    expect(groups.growth).toHaveLength(0)
  })
  it('keeps a logged snapshot when task metadata changes', () => {
    const stored = activity()
    const task = { name: 'New name', points: 8 }
    expect(stored.taskName).toBe('Original name')
    expect(stored.configuredPoints).toBe(5)
    expect(task.points).toBe(8)
  })
})
