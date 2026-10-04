import { describe, expect, it, vi } from 'vitest'
import type { Activity, Category } from '../../src/types'
import {
  CATEGORY_AXIS_MAX,
  OVERALL_AXIS_MAX,
  buildHistoryRows,
  chartFill,
} from '../../src/utils/history'
import { chartOptions } from '../../src/utils/chartOptions'

const now = new Date(2026, 8, 30)
let nextId = 0
function activity(category: Category, points: number, date = now): Activity {
  return {
    activityId: String(++nextId),
    userId: 'u',
    taskId: 't',
    taskName: 'Task',
    taskDescription: 'Description',
    category,
    configuredPoints: points,
    timestamp: date.toISOString(),
    note: '',
    createdAt: date.toISOString(),
    updatedAt: date.toISOString(),
  }
}

describe('history chart data', () => {
  it('includes all four categories and zeroes for absent values', () => {
    const row = buildHistoryRows([], 4, now).at(-1)!
    expect(Object.keys(row.categories)).toEqual([
      'growth',
      'people',
      'life',
      'play',
    ])
    expect(row.categories.people.value).toBe(0)
  })
  it('caps category and total values and marks only capped bars as striped', () => {
    const entries: Activity[] = ['growth', 'people', 'life', 'play'].flatMap(
      (category) => [
        activity(category as Category, 20),
        activity(category as Category, 10),
      ],
    )
    const row = buildHistoryRows(entries, 4, now).at(-1)!
    expect(row.categories.growth).toEqual({
      value: 25,
      isCapped: true,
      appearance: 'striped',
    })
    expect(row.total).toBe(100)
    const uncapped = buildHistoryRows([activity('growth', 12)], 4, now).at(-1)!
    expect(uncapped.categories.growth).toEqual({
      value: 12,
      isCapped: false,
      appearance: 'solid',
    })
    expect(uncapped.total).toBe(12)
  })
  it('uses fixed chart limits and pattern only at 25', () => {
    expect(OVERALL_AXIS_MAX).toBe(100)
    expect(CATEGORY_AXIS_MAX).toBe(25)
    expect(chartOptions(OVERALL_AXIS_MAX, true).scales?.y?.max).toBe(100)
    expect(chartOptions(CATEGORY_AXIS_MAX, false).scales?.y?.max).toBe(25)
    const pattern = {} as CanvasPattern
    const context = {
      createPattern: vi.fn(() => pattern),
    } as unknown as CanvasRenderingContext2D
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
    })) as unknown as typeof original
    expect(chartFill(context, 'growth', false)).toBe('#426f60')
    expect(chartFill(context, 'growth', true)).toBe(pattern)
    HTMLCanvasElement.prototype.getContext = original
  })
  it('changes week count for 4, 12, and all-time ranges', () => {
    const earlier = new Date(2026, 4, 1)
    const entries = [activity('growth', 5, earlier)]
    expect(buildHistoryRows(entries, 4, now)).toHaveLength(4)
    expect(buildHistoryRows(entries, 12, now)).toHaveLength(12)
    expect(buildHistoryRows(entries, 'all', now).length).toBeGreaterThan(12)
  })
})
