import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from '../../src/App'

vi.mock('../../src/services/firebase', () => ({ firebaseConfigured: true }))
vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    error: '',
    signIn: vi.fn(),
    logOut: vi.fn(),
  }),
}))
vi.mock('../../src/hooks/useActivities', () => ({
  useActivities: () => ({
    activities: [],
    loading: false,
    busy: false,
    message: '',
    setMessage: vi.fn(),
    undoId: null,
    add: vi.fn(),
    remove: vi.fn(),
    editNote: vi.fn(),
    merge: vi.fn(),
    undo: vi.fn(),
  }),
}))

describe('authentication gate', () => {
  it('shows Google sign-in and hides private navigation while logged out', () => {
    render(<App />)
    expect(
      screen.getByRole('button', { name: 'Continue with Google' }),
    ).toBeVisible()
    expect(
      screen.queryByRole('navigation', { name: 'Main navigation' }),
    ).not.toBeInTheDocument()
  })
})
