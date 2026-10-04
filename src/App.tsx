import { lazy, Suspense, useEffect, useState } from 'react'
import { BarChart3, House, Settings as SettingsIcon } from 'lucide-react'
import { Dashboard } from './pages/Dashboard'
import { useAuth } from './hooks/useAuth'
import { useActivities } from './hooks/useActivities'
import { useCurrentTime } from './hooks/useCurrentTime'
import { firebaseConfigured } from './services/firebase'

type Page = 'dashboard' | 'history' | 'settings'
const History = lazy(async () => ({
  default: (await import('./pages/History')).History,
}))
const Settings = lazy(async () => ({
  default: (await import('./pages/Settings')).Settings,
}))

export default function App() {
  const [page, setPage] = useState<Page>('dashboard')
  const now = useCurrentTime()
  const {
    user,
    loading: authLoading,
    error: authError,
    signIn,
    logOut,
  } = useAuth()
  const {
    activities,
    loading,
    busy,
    message,
    setMessage,
    undoId,
    add,
    remove,
    editNote,
    merge,
    undo,
  } = useActivities(user?.uid)
  useEffect(() => {
    if (
      !['Activity added.', 'Activity deleted.', 'Note saved.'].includes(
        message,
      ) &&
      !/^Imported \d+ activities\.$/.test(message)
    )
      return
    const timeout = window.setTimeout(() => setMessage(''), 5000)
    return () => window.clearTimeout(timeout)
  }, [message, setMessage])
  if (!firebaseConfigured)
    return (
      <main className="setup-state card">
        <h1>Firebase setup needed</h1>
        <p>
          Configure the Firebase environment variables to use LifePoints. See
          the README for setup steps.
        </p>
      </main>
    )
  if (authLoading)
    return (
      <main className="setup-state card" aria-live="polite">
        <h1>LifePoints</h1>
        <p>Checking your account…</p>
      </main>
    )
  if (!user)
    return (
      <main className="sign-in">
        <div className="card sign-in-card">
          <div className="logo-mark">L</div>
          <p className="eyebrow">A calmer way to track progress</p>
          <h1>LifePoints</h1>
          <p>
            Keep a simple record of meaningful moments across growth, people,
            life, and play.
          </p>
          <button className="primary" onClick={signIn}>
            Continue with Google
          </button>
          {authError && (
            <p className="error" role="alert">
              {authError}
            </p>
          )}
        </div>
      </main>
    )
  const nav: { id: Page; label: string; icon: typeof House }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: House },
    { id: 'history', label: 'History', icon: BarChart3 },
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
  ]
  return (
    <>
      <header className="site-header">
        <div className="container header-inner">
          <div className="brand">
            <span className="logo-mark small">L</span> LifePoints
          </div>
          <nav aria-label="Main navigation">
            {nav.map((item) => (
              <button
                className={page === item.id ? 'active' : ''}
                aria-current={page === item.id ? 'page' : undefined}
                onClick={() => setPage(item.id)}
                key={item.id}
              >
                <item.icon aria-hidden="true" size={19} />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        </div>
      </header>
      {loading ? (
        <main className="container page">
          <p className="loading">Loading your activities…</p>
        </main>
      ) : page === 'dashboard' ? (
        <Dashboard
          activities={activities}
          add={add}
          remove={remove}
          editNote={editNote}
          busy={busy}
          now={now}
        />
      ) : (
        <Suspense
          fallback={
            <main className="container page">
              <p className="loading">Loading screen…</p>
            </main>
          }
        >
          {page === 'history' ? (
            <History
              activities={activities}
              remove={remove}
              editNote={editNote}
              busy={busy}
              now={now}
            />
          ) : (
            <Settings
              user={user}
              activities={activities}
              merge={merge}
              logOut={logOut}
              busy={busy}
            />
          )}
        </Suspense>
      )}
      <div className="status-area" aria-live="polite">
        {message && (
          <div className="status" role="status">
            <span>{message}</span>
            {undoId && message === 'Activity added.' && (
              <button onClick={undo}>Undo</button>
            )}
            <button aria-label="Dismiss message" onClick={() => setMessage('')}>
              ×
            </button>
          </div>
        )}
      </div>
    </>
  )
}
