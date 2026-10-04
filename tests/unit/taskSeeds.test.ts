import { describe, expect, it } from 'vitest'
import {
  initialTasksForEmail,
  PERSONAL_SEED,
  TEMPLATE_SEED,
} from '../../src/data/taskSeeds'

describe('first-login task seeds', () => {
  it('preserves the current personal list for the specified Google account', () => {
    expect(initialTasksForEmail('CJH.T01SNAKE@gmail.com')).toBe(PERSONAL_SEED)
    expect(PERSONAL_SEED).toHaveLength(22)
    expect(PERSONAL_SEED.find((task) => task.id === 'growth_2')).toMatchObject({
      name: 'Focused session/driving',
      points: 2.5,
    })
    expect(PERSONAL_SEED.find((task) => task.id === 'life_10')?.points).toBe(
      0.3,
    )
  })
  it('gives other users a distinct editable starter template', () => {
    expect(initialTasksForEmail('someone@example.com')).toBe(TEMPLATE_SEED)
    expect(initialTasksForEmail(null)).toBe(TEMPLATE_SEED)
    expect(TEMPLATE_SEED).toHaveLength(16)
    expect(TEMPLATE_SEED.some((task) => task.name === 'Go to work')).toBe(false)
    for (const seeds of [PERSONAL_SEED, TEMPLATE_SEED]) {
      expect(new Set(seeds.map((task) => task.id)).size).toBe(seeds.length)
    }
  })
})
