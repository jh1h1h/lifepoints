import { CATEGORIES, type Activity, type Category } from '../types'

export interface Backup {
  version: 1
  exportedAt: string
  activities: Activity[]
}

export function createBackup(activities: Activity[]): Backup {
  return { version: 1, exportedAt: new Date().toISOString(), activities }
}

export function parseBackup(text: string): Backup {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('The file is not valid JSON.')
  }
  if (!parsed || typeof parsed !== 'object')
    throw new Error('The backup must be a JSON object.')
  const backup = parsed as Record<string, unknown>
  if (
    backup.version !== 1 ||
    typeof backup.exportedAt !== 'string' ||
    !Number.isFinite(Date.parse(backup.exportedAt)) ||
    !Array.isArray(backup.activities)
  )
    throw new Error('Unsupported or malformed backup.')
  const ids = new Set<string>()
  for (const value of backup.activities) {
    if (!value || typeof value !== 'object')
      throw new Error('The backup contains an invalid activity.')
    const item = value as Record<string, unknown>
    for (const field of [
      'activityId',
      'taskId',
      'taskName',
      'taskDescription',
      'timestamp',
      'createdAt',
      'updatedAt',
    ]) {
      if (typeof item[field] !== 'string' || !item[field])
        throw new Error(`Invalid activity ${field}.`)
    }
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(item.activityId as string))
      throw new Error('Invalid activity ID.')
    if (typeof item.note !== 'string' || item.note.length > 2000)
      throw new Error('Invalid activity note.')
    if (!CATEGORIES.includes(item.category as Category))
      throw new Error('Invalid activity category.')
    if (
      !Number.isSafeInteger(item.configuredPoints) ||
      (item.configuredPoints as number) <= 0
    )
      throw new Error('Invalid activity points.')
    if (
      !Number.isFinite(Date.parse(item.timestamp as string)) ||
      !Number.isFinite(Date.parse(item.createdAt as string)) ||
      !Number.isFinite(Date.parse(item.updatedAt as string))
    )
      throw new Error('Invalid activity date.')
    if (ids.has(item.activityId as string))
      throw new Error('Duplicate activity ID in backup.')
    ids.add(item.activityId as string)
  }
  return backup as unknown as Backup
}
