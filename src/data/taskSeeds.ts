import type { Category, TaskDraft } from '../types'

export interface TaskSeed extends Omit<TaskDraft, 'note'> {
  id: string
}

type Row = [string, Category, string, string, number, string]

function toSeeds(rows: Row[]): TaskSeed[] {
  return rows.map(([id, category, name, description, points, icon]) => ({
    id,
    category,
    name,
    description,
    points,
    weeklyLimit: null,
    icon,
  }))
}

// Used only if this account has never had a Firestore task list.
export const PERSONAL_SEED = toSeeds([
  ['growth_1', 'growth', 'Go to work', '', 5, 'book-open'],
  ['growth_2', 'growth', 'Focused session/driving', '', 2.5, 'book-open'],
  ['growth_3', 'growth', 'Unfocused session', '', 1.5, 'book-open'],
  [
    'people_1',
    'people',
    'Meaningful conversation',
    'Have a thoughtful conversation with someone.',
    5,
    'users',
  ],
  [
    'people_2',
    'people',
    'Meet a friend',
    'Spend time in person with a friend.',
    10,
    'users',
  ],
  ['people_3', 'people', 'Pool', '', 1, 'users'],
  ['people_4', 'people', 'Plan something', '', 5, 'users'],
  ['life_1', 'life', 'Clean floor x2', '', 1, 'activity'],
  ['life_2', 'life', 'Wash bottle', '', 1, 'activity'],
  ['life_3', 'life', 'Backup comp', '', 1, 'activity'],
  ['life_4', 'life', 'Wear braces', '', 0.5, 'activity'],
  ['life_5', 'life', '2.5 bottle water', '', 1, 'activity'],
  ['life_6', 'life', 'nouknof', '2/day', 2, 'activity'],
  ['life_7', 'life', 'Pushup situp', '', 1, 'activity'],
  ['life_8', 'life', 'Exercise', '', 3, 'activity'],
  ['life_9', 'life', 'Table tennis', '', 0.5, 'activity'],
  ['life_10', 'life', 'Brush teeth', '', 0.3, 'activity'],
  ['life_11', 'life', 'Small chore', '', 1, 'activity'],
  ['life_12', 'life', 'Big chore', '', 2, 'activity'],
  [
    'play_1',
    'play',
    'Try something new',
    'Try an unfamiliar activity or idea.',
    25,
    'heart',
  ],
  ['play_2', 'play', 'Guitar session >30min', '', 12.5, 'heart'],
  ['play_3', 'play', 'Plan smth new', '', 12.5, 'heart'],
])

export const TEMPLATE_SEED = toSeeds([
  [
    'growth_learning',
    'growth',
    'Focused learning session',
    'Spend focused time learning or practising a skill.',
    5,
    'book-open',
  ],
  [
    'growth_project',
    'growth',
    'Work on a personal project',
    'Make meaningful progress on a personal project.',
    5,
    'hammer',
  ],
  [
    'growth_milestone',
    'growth',
    'Finish a meaningful milestone',
    'Complete a substantial step toward a goal.',
    8,
    'flag',
  ],
  [
    'growth_small',
    'growth',
    'Small learning action',
    'Take a small step to learn something useful.',
    2,
    'spark',
  ],
  [
    'people_conversation',
    'people',
    'Meaningful conversation',
    'Have a thoughtful conversation with someone.',
    5,
    'message',
  ],
  [
    'people_friend',
    'people',
    'Meet a friend',
    'Spend time in person with a friend.',
    5,
    'users',
  ],
  [
    'people_checkin',
    'people',
    'Thoughtful check-in',
    'Reach out and check in with someone.',
    2,
    'heart',
  ],
  [
    'people_quality',
    'people',
    'Spend substantial quality time together',
    'Spend unhurried quality time together.',
    8,
    'coffee',
  ],
  [
    'life_movement',
    'life',
    'Exercise or meaningful movement',
    'Move your body in a way that supports your health.',
    5,
    'activity',
  ],
  [
    'life_admin',
    'life',
    'Handle an important admin task',
    'Take care of an important practical obligation.',
    5,
    'clipboard',
  ],
  [
    'life_tidy',
    'life',
    'Tidy or organize something important',
    'Improve a space or system you use.',
    2,
    'home',
  ],
  [
    'life_significant',
    'life',
    'Complete a significant life task',
    'Finish a substantial personal responsibility.',
    8,
    'check',
  ],
  [
    'play_try',
    'play',
    'Try something new',
    'Try an unfamiliar activity or idea.',
    5,
    'compass',
  ],
  [
    'play_explore',
    'play',
    'Explore somewhere new',
    'Visit a place you have not explored before.',
    5,
    'map',
  ],
  [
    'play_small',
    'play',
    'Small fun or creative activity',
    'Make a little room for play or creativity.',
    2,
    'palette',
  ],
  [
    'play_novel',
    'play',
    'Significant novel experience',
    'Spend meaningful time on a new experience.',
    8,
    'sun',
  ],
])

export function initialTasksForEmail(email: string | null): TaskSeed[] {
  return email?.trim().toLowerCase() === 'cjh.t01snake@gmail.com'
    ? PERSONAL_SEED
    : TEMPLATE_SEED
}
