import { describe, expect, it } from 'vitest'
import {
  belongsToWeek,
  getEndOfWeek,
  getStartOfWeek,
  getWeekKey,
  groupActivitiesByWeek,
} from '../../src/utils/date'
import type { Activity } from '../../src/types'

function item(date: Date): Activity {
  return {
    activityId: String(date.getTime()),
    userId: 'u',
    taskId: 't',
    taskName: 'Task',
    taskDescription: 'Description',
    category: 'growth',
    configuredPoints: 5,
    note: '',
    timestamp: date.toISOString(),
    createdAt: date.toISOString(),
    updatedAt: date.toISOString(),
  }
}

describe('local Monday weeks', () => {
  it('includes Monday midnight through Sunday night, then starts a new week', () => {
    const monday = new Date(2026, 8, 28, 0, 0, 0)
    const sunday = new Date(2026, 9, 4, 23, 59, 59)
    const next = new Date(2026, 9, 5, 0, 0, 0)
    expect(belongsToWeek(monday, monday)).toBe(true)
    expect(belongsToWeek(sunday, monday)).toBe(true)
    expect(belongsToWeek(next, monday)).toBe(false)
    expect(getStartOfWeek(sunday).getTime()).toBe(monday.getTime())
    expect(getEndOfWeek(monday).getMilliseconds()).toBe(999)
  })
  it('uses local midnight, including timezone offsets', () => {
    const original = process.env.TZ
    process.env.TZ = 'America/New_York'
    try {
      const date = new Date(2026, 8, 30, 1)
      const start = getStartOfWeek(date)
      expect(start.getDay()).toBe(1)
      expect(start.getHours()).toBe(0)
      expect(start.toISOString()).toBe('2026-09-28T04:00:00.000Z')
      expect(belongsToWeek(new Date('2026-10-05T03:59:59.999Z'), date)).toBe(
        true,
      )
      expect(belongsToWeek(new Date('2026-10-05T04:00:00.000Z'), date)).toBe(
        false,
      )
    } finally {
      process.env.TZ = original
    }
  })
  it('uses the ISO week-year across December and January', () => {
    expect(getWeekKey(new Date(2020, 11, 31))).toBe('2020-W53')
    expect(getWeekKey(new Date(2021, 0, 1))).toBe('2020-W53')
    expect(getWeekKey(new Date(2021, 0, 4))).toBe('2021-W01')
    expect(getWeekKey(new Date(2026, 8, 28))).toBe('2026-W40')
  })
  it('groups across weeks', () => {
    const grouped = groupActivitiesByWeek([
      item(new Date(2026, 8, 28)),
      item(new Date(2026, 9, 4)),
      item(new Date(2026, 9, 5)),
    ])
    expect(grouped['2026-W40']).toHaveLength(2)
    expect(grouped['2026-W41']).toHaveLength(1)
  })
})
