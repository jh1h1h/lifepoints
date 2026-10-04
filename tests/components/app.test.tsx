import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { User } from 'firebase/auth'
import { Dashboard } from '../../src/pages/Dashboard'
import { History } from '../../src/pages/History'
import { Settings } from '../../src/pages/Settings'
import type { Activity, ActivityInput } from '../../src/types'

vi.mock('../../src/components/HistoryCharts', () => ({
  HistoryCharts: () => <div>Charts</div>,
}))

function TestDashboard({ initial = [] }: { initial?: Activity[] }) {
  const [activities, setActivities] = useState(initial)
  async function add(input: ActivityInput) {
    setActivities((current) => [
      {
        ...input,
        activityId: String(current.length + 1),
        userId: 'u',
        createdAt: input.timestamp,
        updatedAt: input.timestamp,
      },
      ...current,
    ])
    return true
  }
  async function remove(id: string) {
    setActivities((current) => current.filter((item) => item.activityId !== id))
  }
  async function editNote(id: string, note: string) {
    setActivities((current) =>
      current.map((item) =>
        item.activityId === id ? { ...item, note } : item,
      ),
    )
  }
  return (
    <Dashboard
      activities={activities}
      add={add}
      remove={remove}
      editNote={editNote}
      busy={false}
    />
  )
}

let nextId = 0
function entry(points = 5, note = ''): Activity {
  const timestamp = new Date().toISOString()
  return {
    activityId: String(++nextId),
    userId: 'u',
    taskId: 'growth_learning',
    taskName: 'Focused learning session',
    taskDescription: 'Description',
    category: 'growth',
    configuredPoints: points,
    timestamp,
    note,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

describe('dashboard', () => {
  it('shows empty scores and quick-add tasks', () => {
    render(<TestDashboard />)
    expect(
      screen.getByLabelText('Weekly score 0 out of 100'),
    ).toHaveTextContent('0 / 100')
    expect(screen.getAllByText('0 / 25')).toHaveLength(4)
    expect(
      screen.getByRole('button', {
        name: /Add Focused learning session, 5 points/,
      }),
    ).toBeVisible()
  })
  it('adds, displays, edits, and deletes an activity', async () => {
    render(<TestDashboard />)
    fireEvent.click(
      screen.getByRole('button', {
        name: /Add Focused learning session, 5 points/,
      }),
    )
    await waitFor(() =>
      expect(screen.getByLabelText('Weekly score 5 out of 100')).toBeVisible(),
    )
    expect(screen.getByText('5 / 25')).toBeVisible()
    expect(
      screen.getAllByText('Focused learning session').length,
    ).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Edit note' }))
    fireEvent.change(screen.getByLabelText('Note'), {
      target: { value: 'A useful lesson' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(screen.getByText('A useful lesson')).toBeVisible(),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() =>
      expect(screen.getByLabelText('Weekly score 0 out of 100')).toBeVisible(),
    )
  })
  it('adds an activity with an optional note', async () => {
    render(<TestDashboard />)
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Add Focused learning session with a note',
      }),
    )
    fireEvent.change(screen.getByLabelText('Optional note'), {
      target: { value: 'Practised a new skill' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add +5' }))
    await waitFor(() =>
      expect(screen.getByText('Practised a new skill')).toBeVisible(),
    )
  })
  it('shows non-color cap treatment at 25', () => {
    render(<TestDashboard initial={Array.from({ length: 5 }, () => entry())} />)
    const progress = screen.getByRole('progressbar', { name: 'Growth score' })
    expect(progress).toHaveAttribute('aria-valuenow', '25')
    expect(progress).toHaveClass('capped')
    expect(screen.getByText('Cap reached · striped')).toBeVisible()
  })
})

describe('history and settings', () => {
  it('shows range controls and empty state', () => {
    render(
      <History
        activities={[]}
        remove={async () => {}}
        editNote={async () => {}}
        busy={false}
      />,
    )
    expect(screen.getByRole('button', { name: '4 weeks' })).toBeVisible()
    expect(screen.getByRole('button', { name: '12 weeks' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'All time' })).toBeVisible()
    expect(screen.getByText(/No history yet/)).toBeVisible()
  })
  it('has account sign-out and backup controls', () => {
    render(
      <Settings
        user={{ displayName: 'Test User', email: 'test@example.com' } as User}
        activities={[]}
        merge={async () => {}}
        logOut={async () => {}}
        busy={false}
      />,
    )
    const account = screen.getByText('Account').closest('section')!
    expect(
      within(account).getByRole('button', { name: 'Sign out' }),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Export JSON' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Import JSON' })).toBeVisible()
  })
})
