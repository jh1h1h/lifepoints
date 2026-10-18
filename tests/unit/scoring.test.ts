import { describe, expect, it } from 'vitest'
import type { Activity, Category } from '../../src/types'
import {
  calculateCategoryRawScore,
  calculateCategoryScore,
  calculateWeeklyScore,
  getWeeklyCategoryBreakdown,
  getWeeklyCategoryRawBreakdown,
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
  it('counts a previous-week copy only in last week while retaining the original', () => {
    const original = activity()
    const previousWeek = new Date(week)
    previousWeek.setDate(previousWeek.getDate() - 7)
    const copy = {
      ...original,
      activityId: `previous_week_${original.activityId}`,
      timestamp: previousWeek.toISOString(),
    }
    const entries = [original, copy]
    expect(calculateWeeklyScore(entries, week)).toBe(0)
    expect(getWeeklyCategoryRawBreakdown(entries, week).growth).toBe(0)
    expect(calculateWeeklyScore(entries, previousWeek)).toBe(5)
    expect(entries).toContain(original)
  })
  it('starts at zero and scores a single activity', () => {
    expect(calculateWeeklyScore([], week)).toBe(0)
    expect(calculateCategoryScore([activity()], 'growth')).toBe(5)
  })
  it('caps five and six five-point activities at 25 without changing raw data', () => {
    const five = Array.from({ length: 5 }, () => activity())
    const six = [...five, activity()]
    expect(calculateCategoryScore(five, 'growth')).toBe(25)
    expect(calculateCategoryScore(six, 'growth')).toBe(25)
    expect(calculateCategoryRawScore(six, 'growth')).toBe(30)
    expect(getWeeklyCategoryRawBreakdown(six, week).growth).toBe(30)
    expect(calculateWeeklyScore(six, week)).toBe(25)
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
  it('adds fractional values accurately and recognizes a decimal cap', () => {
    const small = Array.from({ length: 10 }, () => activity('growth', 0.3))
    expect(calculateCategoryScore(small, 'growth')).toBe(3)
    expect(calculateCategoryRawScore(small, 'growth')).toBe(3)
    const capped = Array.from({ length: 100 }, () => activity('growth', 0.25))
    expect(calculateCategoryScore(capped, 'growth')).toBe(25)
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
