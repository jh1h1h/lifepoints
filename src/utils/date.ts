import type { Activity } from '../types'

export function getStartOfWeek(date = new Date()): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  return start
}

export function getEndOfWeek(date = new Date()): Date {
  const end = getStartOfWeek(date)
  end.setDate(end.getDate() + 7)
  end.setMilliseconds(end.getMilliseconds() - 1)
  return end
}

export function getWeekKey(date: Date): string {
  const monday = getStartOfWeek(date)
  const thursday = new Date(monday)
  thursday.setDate(monday.getDate() + 3)
  const year = thursday.getFullYear()
  const firstThursday = new Date(year, 0, 4)
  const firstMonday = getStartOfWeek(firstThursday)
  const days = Math.round(
    (Date.UTC(monday.getFullYear(), monday.getMonth(), monday.getDate()) -
      Date.UTC(
        firstMonday.getFullYear(),
        firstMonday.getMonth(),
        firstMonday.getDate(),
      )) /
      86400000,
  )
  return `${year}-W${String(Math.floor(days / 7) + 1).padStart(2, '0')}`
}

export function getWeekLabel(date: Date): string {
  const start = getStartOfWeek(date)
  const end = getEndOfWeek(date)
  const first = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(start)
  const last = new Intl.DateTimeFormat(
    undefined,
    start.getMonth() === end.getMonth()
      ? { day: 'numeric' }
      : { month: 'short', day: 'numeric' },
  ).format(end)
  return `${first} – ${last}`
}

export function belongsToWeek(timestamp: string | Date, week: Date): boolean {
  const date = new Date(timestamp)
  return date >= getStartOfWeek(week) && date <= getEndOfWeek(week)
}

export function groupActivitiesByWeek(
  activities: Activity[],
): Record<string, Activity[]> {
  return activities.reduce<Record<string, Activity[]>>((groups, activity) => {
    const key = getWeekKey(new Date(activity.timestamp))
    ;(groups[key] ??= []).push(activity)
    return groups
  }, {})
}

export function weeksThroughNow(
  activities: Activity[],
  range: 4 | 12 | 'all',
  now = new Date(),
): Date[] {
  const current = getStartOfWeek(now)
  let count = range === 'all' ? 1 : range
  if (range === 'all' && activities.length) {
    const earliest = activities.reduce(
      (min, activity) => Math.min(min, new Date(activity.timestamp).getTime()),
      current.getTime(),
    )
    const cursor = new Date(earliest)
    cursor.setHours(12, 0, 0, 0)
    const first = getStartOfWeek(cursor)
    count = 0
    for (
      const day = new Date(first);
      day <= current;
      day.setDate(day.getDate() + 7)
    )
      count++
  }
  return Array.from({ length: count }, (_, index) => {
    const week = new Date(current)
    week.setDate(week.getDate() - 7 * (count - index - 1))
    return week
  })
}
