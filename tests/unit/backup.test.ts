import { describe, expect, it } from 'vitest'
import { createBackup, parseBackup } from '../../src/utils/backup'

describe('backup validation', () => {
  it('exports and accepts a valid empty backup', () => {
    const backup = createBackup([])
    expect(parseBackup(JSON.stringify(backup)).version).toBe(1)
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
})
