import { useRef, useState } from 'react'
import type { User } from 'firebase/auth'
import type { Activity } from '../types'
import { createBackup, parseBackup } from '../utils/backup'

interface Props {
  user: User
  activities: Activity[]
  merge: (items: Activity[]) => Promise<void>
  logOut: () => Promise<void>
  busy: boolean
}

export function Settings({ user, activities, merge, logOut, busy }: Props) {
  const picker = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  function exportData() {
    const blob = new Blob([JSON.stringify(createBackup(activities), null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `lifepoints-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  async function importData(file?: File) {
    if (!file) return
    setError('')
    try {
      const backup = parseBackup(await file.text())
      await merge(backup.activities)
    } catch (failure) {
      setError((failure as Error).message)
    }
    if (picker.current) picker.current.value = ''
  }
  return (
    <main className="container page">
      <div className="page-title">
        <p className="eyebrow">Preferences & data</p>
        <h1>Settings</h1>
      </div>
      <section className="card section-card settings-card">
        <h2>Account</h2>
        <p>
          Signed in as <strong>{user.displayName || user.email}</strong>
        </p>
        <p className="muted">{user.email}</p>
        <button onClick={logOut}>Sign out</button>
      </section>
      <section className="card section-card settings-card">
        <h2>Your data</h2>
        <p className="muted">
          Download a JSON backup, or merge one back into this account. Existing
          activity IDs are kept.
        </p>
        <div className="settings-actions">
          <button onClick={exportData}>Export JSON</button>
          <input
            ref={picker}
            type="file"
            accept="application/json,.json"
            className="visually-hidden"
            aria-label="Choose backup JSON"
            onChange={(event) => void importData(event.target.files?.[0])}
          />
          <button disabled={busy} onClick={() => picker.current?.click()}>
            Import JSON
          </button>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <p className="muted">{activities.length} activities in this account.</p>
      </section>
    </main>
  )
}
