export const CATEGORIES = ['growth', 'people', 'life', 'play'] as const
export type Category = (typeof CATEGORIES)[number]
export const CATEGORY_NAMES: Record<Category, string> = {
  growth: 'Growth',
  people: 'People',
  life: 'Life',
  play: 'Play / Novelty',
}
export const CATEGORY_COLORS: Record<Category, string> = {
  growth: '#426f60',
  people: '#826182',
  life: '#426c91',
  play: '#aa713b',
}
export const CATEGORY_CAP = 25
export const WEEK_CAP = 100

export interface Task {
  id: string
  category: Category
  name: string
  description: string
  points: number
  weeklyLimit: number | null
  icon: string
  note: string
  order: number
  createdAt: string
  updatedAt: string
}

export type TaskDraft = Pick<
  Task,
  | 'category'
  | 'name'
  | 'description'
  | 'points'
  | 'weeklyLimit'
  | 'icon'
  | 'note'
>

export interface Activity {
  activityId: string
  userId: string
  taskId: string
  taskName: string
  taskDescription: string
  category: Category
  configuredPoints: number
  timestamp: string
  note: string
  createdAt: string
  updatedAt: string
}

export type ActivityInput = Omit<
  Activity,
  'activityId' | 'userId' | 'createdAt' | 'updatedAt'
>
