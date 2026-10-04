import { useRef, useState } from 'react'
import type { User } from 'firebase/auth'
import type { Activity, Task, TaskDraft } from '../types'
import { createBackup, parseBackup } from '../utils/backup'
import { TaskManager } from '../components/TaskManager'

interface Props {
  user: User
  activities: Activity[]
  tasks: Task[]
  merge: (items: Activity[]) => Promise<void>
  mergeTasks: (items: Task[], replaceExisting: boolean) => Promise<number>
  createTask: (draft: TaskDraft) => Promise<boolean>
  updateTask: (id: string, draft: TaskDraft) => Promise<boolean>
  removeTask: (id: string) => Promise<boolean>
  logOut: () => Promise<void>
  busy: boolean
}

export function Settings({
  user,
  activities,
  tasks,
  merge,
  mergeTasks,
  createTask,
  updateTask,
  removeTask,
  logOut,
  busy,
}: Props) {
  const picker = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const [replaceTasks, setReplaceTasks] = useState(false)
  function exportData() {
    const blob = new Blob(
      [JSON.stringify(createBackup(activities, tasks), null, 2)],
      {
        type: 'application/json',
      },
    )
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
      if (backup.tasks) await mergeTasks(backup.tasks, replaceTasks)
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
      <TaskManager
        tasks={tasks}
        create={createTask}
        update={updateTask}
        remove={removeTask}
        busy={busy}
      />
      <section className="card section-card settings-card">
        <h2>Your data</h2>
        <p className="muted">
          Download a JSON backup of activities and tasks, or merge one back into
          this account. Existing IDs are kept.
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
        <label className="import-option">
          <input
            type="checkbox"
            checked={replaceTasks}
            onChange={(event) => setReplaceTasks(event.target.checked)}
          />
          Replace matching tasks with versions from the backup
        </label>
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
