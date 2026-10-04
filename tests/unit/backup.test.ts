import { describe, expect, it } from 'vitest'
import { createBackup, parseBackup } from '../../src/utils/backup'
import { TEMPLATE_SEED } from '../../src/data/taskSeeds'

describe('backup validation', () => {
  it('exports and accepts a valid empty backup', () => {
    const backup = createBackup([], [])
    expect(parseBackup(JSON.stringify(backup)).version).toBe(2)
  })
  it('rejects malformed data', () => {
    expect(() => parseBackup('{')).toThrow('valid JSON')
    expect(() =>
      parseBackup('{"version":2,"exportedAt":"2026-01-01","activities":[]}'),
    ).toThrow()
  })
  it('rejects invalid categories and points', () => {
    const entry = {
      activityId: 'a',
      userId: 'u',
      taskId: 't',
      taskName: 'Task',
      taskDescription: 'Description',
      category: 'bad',
      configuredPoints: 5,
      timestamp: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      note: '',
    }
    expect(() =>
      parseBackup(
        JSON.stringify({
          version: 1,
          exportedAt: new Date().toISOString(),
          activities: [entry],
        }),
      ),
    ).toThrow('category')
    expect(() =>
      parseBackup(
        JSON.stringify({
          version: 1,
          exportedAt: new Date().toISOString(),
          activities: [{ ...entry, category: 'growth', configuredPoints: 0 }],
        }),
      ),
    ).toThrow('points')
    const fractional = {
      ...entry,
      category: 'growth',
      taskDescription: '',
      configuredPoints: 0.3,
    }
    expect(
      parseBackup(
        JSON.stringify({
          version: 1,
          exportedAt: new Date().toISOString(),
          activities: [fractional],
        }),
      ).activities[0].configuredPoints,
    ).toBe(0.3)
  })
  it('exports tasks, validates them, and accepts legacy activity-only backups', () => {
    const now = new Date().toISOString()
    const task = {
      ...TEMPLATE_SEED[0],
      note: 'Remember this',
      order: 0,
      createdAt: now,
      updatedAt: now,
    }
    const backup = createBackup([], [task])
    expect(parseBackup(JSON.stringify(backup)).tasks?.[0].note).toBe(
      'Remember this',
    )
    expect(() =>
      parseBackup(
        JSON.stringify({ ...backup, tasks: [{ ...task, points: 0 }] }),
      ),
    ).toThrow('task points')
    expect(() =>
      parseBackup(
        JSON.stringify({ ...backup, tasks: [{ ...task, category: 'wrong' }] }),
      ),
    ).toThrow('task category')
    expect(
      parseBackup(
        JSON.stringify({ version: 1, exportedAt: now, activities: [] }),
      ).tasks,
    ).toBeUndefined()
  })
})
