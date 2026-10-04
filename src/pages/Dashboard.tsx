import { useMemo, useState } from 'react'
import {
  BookOpen,
  Hammer,
  Flag,
  Sparkles,
  MessageCircle,
  Users,
  Heart,
  Coffee,
  Activity as ActivityIcon,
  ClipboardList,
  House,
  Check,
  Compass,
  Map,
  Palette,
  Sun,
  Plus,
} from 'lucide-react'
import { ActivityList } from '../components/ActivityList'
import {
  CATEGORIES,
  CATEGORY_NAMES,
  type Activity,
  type ActivityInput,
  type Category,
  type Task,
} from '../types'
import { belongsToWeek, getWeekLabel } from '../utils/date'
import {
  calculateWeeklyScore,
  getWeeklyCategoryBreakdown,
} from '../utils/scoring'

const icons = {
  'book-open': BookOpen,
  hammer: Hammer,
  flag: Flag,
  spark: Sparkles,
  message: MessageCircle,
  users: Users,
  heart: Heart,
  coffee: Coffee,
  activity: ActivityIcon,
  clipboard: ClipboardList,
  home: House,
  check: Check,
  compass: Compass,
  map: Map,
  palette: Palette,
  sun: Sun,
}

interface Props {
  activities: Activity[]
  tasks: Task[]
  add: (input: ActivityInput) => Promise<boolean>
  remove: (id: string) => Promise<void>
  editNote: (id: string, note: string) => Promise<void>
  saveTaskNote: (id: string, note: string) => Promise<boolean>
  busy: boolean
  now?: Date
}

export function Dashboard({
  activities,
  tasks,
  add,
  remove,
  editNote,
  saveTaskNote,
  busy,
  now = new Date(),
}: Props) {
  const [filter, setFilter] = useState<Category | 'all'>('all')
  const [noteTask, setNoteTask] = useState<Task | null>(null)
  const [note, setNote] = useState('')
  const current = useMemo(
    () =>
      activities.filter((activity) => belongsToWeek(activity.timestamp, now)),
    [activities, now],
  )
  const scores = useMemo(
    () => getWeeklyCategoryBreakdown(activities, now),
    [activities, now],
  )
  const visible = tasks.filter(
    (task) => filter === 'all' || task.category === filter,
  )
  async function log(task: Task) {
    await add({
      taskId: task.id,
      taskName: task.name,
      taskDescription: task.description,
      category: task.category,
      configuredPoints: task.points,
      timestamp: new Date().toISOString(),
      note: '',
    })
  }
  async function saveNote() {
    if (!noteTask) return
    if (await saveTaskNote(noteTask.id, note)) {
      setNoteTask(null)
      setNote('')
    }
  }
  return (
    <main className="container page">
      <section className="hero card">
        <div>
          <p className="eyebrow">This Week</p>
          <h1>{getWeekLabel(now)}</h1>
          <p className="muted">A simple view of what mattered this week.</p>
        </div>
        <div
          className="total-score"
          aria-label={`Weekly score ${calculateWeeklyScore(activities, now)} out of 100`}
        >
          <strong>{calculateWeeklyScore(activities, now)}</strong>
          <span> / 100</span>
        </div>
      </section>
      <section aria-label="Category scores" className="score-grid">
        {CATEGORIES.map((category) => (
          <article
            className={`score-card card category-${category}`}
            key={category}
          >
            <div className="score-heading">
              <h2>{CATEGORY_NAMES[category]}</h2>
              <strong>{scores[category]} / 25</strong>
            </div>
            <div
              className={`progress ${scores[category] === 25 ? 'capped' : ''}`}
              role="progressbar"
              aria-label={`${CATEGORY_NAMES[category]} score`}
              aria-valuenow={scores[category]}
              aria-valuemin={0}
              aria-valuemax={25}
            >
              <span style={{ width: `${scores[category] * 4}%` }} />
            </div>
            {scores[category] === 25 && <small>Cap reached · striped</small>}
          </article>
        ))}
      </section>
      <section className="card section-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Quick add</p>
            <h2>Log an activity</h2>
          </div>
          <span className="muted">One tap to add</span>
        </div>
        <div className="filters" aria-label="Filter tasks">
          {(['all', ...CATEGORIES] as const).map((category) => (
            <button
              className={filter === category ? 'selected' : ''}
              aria-pressed={filter === category}
              key={category}
              onClick={() => setFilter(category)}
            >
              {category === 'all' ? 'All' : CATEGORY_NAMES[category]}
            </button>
          ))}
        </div>
        <div className="task-grid">
          {visible.map((task) => {
            const Icon = icons[task.icon as keyof typeof icons] ?? Plus
            return (
              <div className="task-item" key={task.id}>
                <button
                  className="task-button"
                  disabled={busy}
                  onClick={() => log(task)}
                  aria-label={`Add ${task.name}, ${task.points} points in ${CATEGORY_NAMES[task.category]}`}
                >
                  <Icon aria-hidden="true" size={20} />
                  <span>
                    <strong>{task.name}</strong>
                    {task.note && (
                      <span className="task-note-text">{task.note}</span>
                    )}
                    <small>
                      {CATEGORY_NAMES[task.category]} · +{task.points}
                    </small>
                  </span>
                </button>
                <button
                  className="note-action"
                  disabled={busy}
                  onClick={() => {
                    setNoteTask(task)
                    setNote(task.note)
                  }}
                  aria-label={`${task.note ? 'Edit' : 'Add'} note for ${task.name}`}
                >
                  {task.note ? '(edit)' : '+ note'}
                </button>
              </div>
            )
          })}
        </div>
        {visible.length === 0 && (
          <p className="empty">
            No tasks in this category. Add one in Settings.
          </p>
        )}
      </section>
      <section className="card section-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">This week</p>
            <h2>Recent activity</h2>
          </div>
          <span className="muted">{current.length} logged</span>
        </div>
        <ActivityList
          activities={current}
          onDelete={remove}
          onEditNote={editNote}
          busy={busy}
        />
      </section>
      {noteTask && (
        <div className="modal-backdrop" onClick={() => setNoteTask(null)}>
          <form
            className="modal card"
            role="dialog"
            aria-modal="true"
            aria-label={`Note for ${noteTask.name}`}
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault()
              void saveNote()
            }}
          >
            <h2>{noteTask.name}</h2>
            <p className="muted">
              This note appears on the task card. Saving it does not log an
              activity.
            </p>
            <label htmlFor="new-note">Task note</label>
            <textarea
              id="new-note"
              maxLength={2000}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              autoFocus
            />
            <div className="modal-actions">
              <button type="button" onClick={() => setNoteTask(null)}>
                Cancel
              </button>
              <button className="primary" disabled={busy}>
                Save note
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  )
}
