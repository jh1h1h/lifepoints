import { useState } from 'react'
import { CATEGORIES, CATEGORY_NAMES, type Task, type TaskDraft } from '../types'

const ICONS = [
  'book-open',
  'hammer',
  'flag',
  'spark',
  'message',
  'users',
  'heart',
  'coffee',
  'activity',
  'clipboard',
  'home',
  'check',
  'compass',
  'map',
  'palette',
  'sun',
] as const

const emptyDraft: TaskDraft = {
  category: 'growth',
  name: '',
  description: '',
  points: 5,
  weeklyLimit: null,
  icon: 'book-open',
  note: '',
}

interface Props {
  tasks: Task[]
  create: (draft: TaskDraft) => Promise<boolean>
  update: (id: string, draft: TaskDraft) => Promise<boolean>
  remove: (id: string) => Promise<boolean>
  busy: boolean
}

export function TaskManager({ tasks, create, update, remove, busy }: Props) {
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [draft, setDraft] = useState<TaskDraft>(emptyDraft)

  function start(task?: Task) {
    setEditing(task?.id ?? 'new')
    setDraft(
      task
        ? {
            category: task.category,
            name: task.name,
            description: task.description,
            points: task.points,
            weeklyLimit: task.weeklyLimit,
            icon: task.icon,
            note: task.note,
          }
        : emptyDraft,
    )
  }

  async function save() {
    if (!editing) return
    const done =
      editing === 'new' ? await create(draft) : await update(editing, draft)
    if (done) setEditing(null)
  }

  async function confirmRemove(task: Task) {
    if (
      !window.confirm(
        `Delete “${task.name}” from your task list? Past activities will remain unchanged.`,
      )
    )
      return
    await remove(task.id)
    if (editing === task.id) setEditing(null)
  }

  return (
    <section className="card section-card task-settings">
      <div className="section-heading">
        <div>
          <h2>Your tasks</h2>
          <p className="muted">
            Changes sync across devices. Past activities keep their original
            task details and points.
          </p>
        </div>
        <button className="primary" disabled={busy} onClick={() => start()}>
          Add task
        </button>
      </div>
      {editing && (
        <form
          className="task-editor"
          aria-label={editing === 'new' ? 'Add task' : 'Edit task'}
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <label>
            Task name
            <input
              required
              maxLength={120}
              value={draft.name}
              onChange={(event) =>
                setDraft({ ...draft, name: event.target.value })
              }
            />
          </label>
          <div className="task-editor-grid">
            <label>
              Category
              <select
                value={draft.category}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    category: event.target.value as TaskDraft['category'],
                  })
                }
              >
                {CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {CATEGORY_NAMES[category]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Points
              <input
                type="number"
                required
                step="any"
                value={draft.points}
                onChange={(event) =>
                  setDraft({ ...draft, points: Number(event.target.value) })
                }
              />
            </label>
            <label>
              Weekly limit (times)
              <input
                type="number"
                aria-label="Weekly limit (times)"
                min="1"
                max="999"
                step="1"
                placeholder="No limit"
                value={draft.weeklyLimit ?? ''}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    weeklyLimit:
                      event.target.value === ''
                        ? null
                        : Number(event.target.value),
                  })
                }
              />
              <small>Leave blank for no limit.</small>
            </label>
            <label>
              Icon
              <select
                value={draft.icon}
                onChange={(event) =>
                  setDraft({ ...draft, icon: event.target.value })
                }
              >
                {ICONS.map((icon) => (
                  <option key={icon} value={icon}>
                    {icon.replace('-', ' ')}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Description
            <textarea
              maxLength={1000}
              value={draft.description}
              onChange={(event) =>
                setDraft({ ...draft, description: event.target.value })
              }
            />
          </label>
          <label>
            Task note
            <textarea
              maxLength={2000}
              value={draft.note}
              onChange={(event) =>
                setDraft({ ...draft, note: event.target.value })
              }
            />
          </label>
          <div className="task-editor-actions">
            <button type="button" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button className="primary" disabled={busy}>
              {editing === 'new' ? 'Create task' : 'Save task'}
            </button>
          </div>
        </form>
      )}
      <div className="managed-tasks">
        {tasks.map((task) => (
          <div className="managed-task" key={task.id}>
            <div>
              <strong>{task.name}</strong>
              <span>
                {CATEGORY_NAMES[task.category]} · +{task.points}
              </span>
              {task.weeklyLimit != null && (
                <span>Limit: {task.weeklyLimit} per week</span>
              )}
              {task.description && <p>{task.description}</p>}
              {task.note && <p>Note: {task.note}</p>}
            </div>
            <div className="managed-task-actions">
              <button
                disabled={busy}
                aria-label={`Edit ${task.name}`}
                onClick={() => start(task)}
              >
                Edit
              </button>
              <button
                disabled={busy}
                aria-label={`Delete ${task.name}`}
                onClick={() => void confirmRemove(task)}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {tasks.length === 0 && (
          <p className="empty">No tasks yet. Add one to start tracking.</p>
        )}
      </div>
    </section>
  )
}
