import { CATEGORIES, type Activity, type Category, type Task } from '../types'

export interface Backup {
  version: 1 | 2
  exportedAt: string
  activities: Activity[]
  tasks?: Task[]
}

export function createBackup(activities: Activity[], tasks: Task[]): Backup {
  return { version: 2, exportedAt: new Date().toISOString(), activities, tasks }
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
    (backup.version !== 1 && backup.version !== 2) ||
    typeof backup.exportedAt !== 'string' ||
    !Number.isFinite(Date.parse(backup.exportedAt)) ||
    !Array.isArray(backup.activities) ||
    (backup.version === 2 && !Array.isArray(backup.tasks))
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
      'timestamp',
      'createdAt',
      'updatedAt',
    ]) {
      if (typeof item[field] !== 'string' || !item[field])
        throw new Error(`Invalid activity ${field}.`)
    }
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(item.activityId as string))
      throw new Error('Invalid activity ID.')
    if (typeof item.taskDescription !== 'string')
      throw new Error('Invalid activity taskDescription.')
    if (typeof item.note !== 'string' || item.note.length > 2000)
      throw new Error('Invalid activity note.')
    if (!CATEGORIES.includes(item.category as Category))
      throw new Error('Invalid activity category.')
    if (
      typeof item.configuredPoints !== 'number' ||
      !Number.isFinite(item.configuredPoints) ||
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
  if (backup.version === 2) {
    const taskIds = new Set<string>()
    for (const value of backup.tasks as unknown[]) {
      if (!value || typeof value !== 'object')
        throw new Error('The backup contains an invalid task.')
      const item = value as Record<string, unknown>
      if (
        typeof item.id !== 'string' ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(item.id)
      )
        throw new Error('Invalid task ID.')
      if (taskIds.has(item.id)) throw new Error('Duplicate task ID in backup.')
      taskIds.add(item.id)
      if (!CATEGORIES.includes(item.category as Category))
        throw new Error('Invalid task category.')
      if (
        typeof item.name !== 'string' ||
        !item.name.trim() ||
        item.name.length > 120
      )
        throw new Error('Invalid task name.')
      if (
        typeof item.description !== 'string' ||
        item.description.length > 1000
      )
        throw new Error('Invalid task description.')
      if (typeof item.icon !== 'string' || !item.icon.trim())
        throw new Error('Invalid task icon.')
      if (typeof item.note !== 'string' || item.note.length > 2000)
        throw new Error('Invalid task note.')
      if (
        typeof item.points !== 'number' ||
        !Number.isFinite(item.points) ||
        item.points <= 0
      )
        throw new Error('Invalid task points.')
      if (
        item.weeklyLimit !== undefined &&
        item.weeklyLimit !== null &&
        (typeof item.weeklyLimit !== 'number' ||
          !Number.isInteger(item.weeklyLimit) ||
          item.weeklyLimit < 1 ||
          item.weeklyLimit > 999)
      )
        throw new Error('Invalid task weekly limit.')
      if (
        typeof item.order !== 'number' ||
        !Number.isFinite(item.order) ||
        item.order < 0
      )
        throw new Error('Invalid task order.')
      if (
        typeof item.createdAt !== 'string' ||
        !Number.isFinite(Date.parse(item.createdAt)) ||
        typeof item.updatedAt !== 'string' ||
        !Number.isFinite(Date.parse(item.updatedAt))
      )
        throw new Error('Invalid task date.')
    }
  }
  return backup as unknown as Backup
}
