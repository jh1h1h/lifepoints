import {
  CATEGORIES,
  CATEGORY_CAP,
  type Activity,
  type Category,
} from '../types'
import { belongsToWeek } from './date'

export function groupActivitiesByCategory(
  activities: Activity[],
): Record<Category, Activity[]> {
  const groups = Object.fromEntries(
    CATEGORIES.map((category) => [category, [] as Activity[]]),
  ) as unknown as Record<Category, Activity[]>
  for (const activity of activities) groups[activity.category].push(activity)
  return groups
}

export function getEffectivePoints(rawPoints: number): number {
  return Math.min(Math.max(rawPoints, 0), CATEGORY_CAP)
}

export function calculateCategoryScore(
  activities: Activity[],
  category: Category,
): number {
  return getEffectivePoints(
    activities
      .filter((activity) => activity.category === category)
      .reduce((sum, activity) => sum + activity.configuredPoints, 0),
  )
}

export function getWeeklyCategoryBreakdown(
  activities: Activity[],
  week: Date,
): Record<Category, number> {
  const weekly = activities.filter((activity) =>
    belongsToWeek(activity.timestamp, week),
  )
  return Object.fromEntries(
    CATEGORIES.map((category) => [
      category,
      calculateCategoryScore(weekly, category),
    ]),
  ) as Record<Category, number>
}

export function calculateWeeklyScore(
  activities: Activity[],
  week: Date,
): number {
  return Object.values(getWeeklyCategoryBreakdown(activities, week)).reduce(
    (sum, points) => sum + points,
    0,
  )
}
