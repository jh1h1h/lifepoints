import {
  CATEGORIES,
  CATEGORY_CAP,
  CATEGORY_COLORS,
  type Activity,
  type Category,
} from '../types'
import { getWeekKey, getWeekLabel, weeksThroughNow } from './date'
import {
  getWeeklyCategoryBreakdown,
  getWeeklyCategoryRawBreakdown,
} from './scoring'

export interface WeekChartRow {
  key: string
  label: string
  week: Date
  total: number
  categories: Record<
    Category,
    {
      value: number
      rawValue: number
      isCapped: boolean
      appearance: 'striped' | 'solid'
    }
  >
}

export const OVERALL_AXIS_MAX = 100
export const CATEGORY_AXIS_MAX = CATEGORY_CAP

const patterns = new WeakMap<
  CanvasRenderingContext2D,
  Map<string, CanvasPattern | string>
>()

export function buildHistoryRows(
  activities: Activity[],
  range: 4 | 12 | 'all',
  now = new Date(),
): WeekChartRow[] {
  return weeksThroughNow(activities, range, now).map((week) => {
    const scores = getWeeklyCategoryBreakdown(activities, week)
    const rawScores = getWeeklyCategoryRawBreakdown(activities, week)
    const categories = Object.fromEntries(
      CATEGORIES.map((category) => {
        const value = scores[category]
        const rawValue = rawScores[category]
        const isCapped = value === CATEGORY_CAP
        return [
          category,
          {
            value,
            rawValue,
            isCapped,
            appearance: isCapped ? 'striped' : 'solid',
          },
        ]
      }),
    ) as WeekChartRow['categories']
    return {
      key: getWeekKey(week),
      label: getWeekLabel(week),
      week,
      total: CATEGORIES.reduce((sum, category) => sum + scores[category], 0),
      categories,
    }
  })
}

export function getCategoryAxisMax(
  rows: WeekChartRow[],
  category: Category,
): number {
  const highest = Math.max(
    CATEGORY_CAP,
    ...rows.map((row) => row.categories[category].rawValue),
  )
  return Math.ceil(highest / 5) * 5
}

export function stripePattern(
  context: CanvasRenderingContext2D,
  color: string,
): CanvasPattern | string {
  const cached = patterns.get(context)?.get(color)
  if (cached) return cached
  const canvas = document.createElement('canvas')
  canvas.width = 10
  canvas.height = 10
  const brush = canvas.getContext('2d')
  if (!brush) return color
  brush.fillStyle = color
  brush.fillRect(0, 0, 10, 10)
  brush.strokeStyle = 'rgba(255,255,255,.58)'
  brush.lineWidth = 2
  brush.beginPath()
  brush.moveTo(-2, 8)
  brush.lineTo(8, -2)
  brush.moveTo(2, 12)
  brush.lineTo(12, 2)
  brush.stroke()
  const pattern = context.createPattern(canvas, 'repeat') ?? color
  const colorPatterns =
    patterns.get(context) ?? new Map<string, CanvasPattern | string>()
  colorPatterns.set(color, pattern)
  patterns.set(context, colorPatterns)
  return pattern
}

export function chartFill(
  context: CanvasRenderingContext2D,
  category: Category,
  capped: boolean,
): CanvasPattern | string {
  return capped
    ? stripePattern(context, CATEGORY_COLORS[category])
    : CATEGORY_COLORS[category]
}
