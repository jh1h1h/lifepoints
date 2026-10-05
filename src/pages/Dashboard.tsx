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
import { taskLimitReached, weeklyTaskUses } from '../utils/taskLimits'

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
  add: (
    input: ActivityInput,
    task?: Task,
    observedUses?: number,
  ) => Promise<boolean>
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
  const [oneTimeCategory, setOneTimeCategory] = useState<Category | null>(null)
  const [oneTimeName, setOneTimeName] = useState('')
  const [oneTimePoints, setOneTimePoints] = useState('')
  const [oneTimeNote, setOneTimeNote] = useState('')
  const current = useMemo(
    () =>
      activities.filter((activity) => belongsToWeek(activity.timestamp, now)),
    [activities, now],
  )
  const scores = useMemo(
    () => getWeeklyCategoryBreakdown(activities, now),
    [activities, now],
  )
  async function log(task: Task) {
    if (taskLimitReached(task, activities, now)) return
    await add(
      {
        taskId: task.id,
        taskName: task.name,
        taskDescription: task.description,
        category: task.category,
        configuredPoints: task.points,
        timestamp: new Date().toISOString(),
        note: '',
      },
      task,
      weeklyTaskUses(activities, task.id, now),
    )
  }
  async function logOneTime() {
    if (!oneTimeCategory) return
    const name = oneTimeName.trim()
    const points = Number(oneTimePoints)
    if (!name || name.length > 120 || !Number.isFinite(points) || points <= 0)
      return
    const saved = await add({
      taskId: `one_time_${crypto.randomUUID()}`,
      taskName: name,
      taskDescription: '',
      category: oneTimeCategory,
      configuredPoints: points,
      timestamp: new Date().toISOString(),
      note: oneTimeNote.trim(),
    })
    if (saved) {
      setOneTimeCategory(null)
      setOneTimeName('')
      setOneTimePoints('')
      setOneTimeNote('')
    }
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
        {tasks.length === 0 && (
          <p className="empty">
            No saved tasks. Add one in Settings, or use a one-time task below.
          </p>
        )}
        {CATEGORIES.filter(
          (category) => filter === 'all' || filter === category,
        ).map((category) => (
          <section
            className="task-category"
            key={category}
            aria-label={`${CATEGORY_NAMES[category]} tasks`}
          >
            <h3>{CATEGORY_NAMES[category]}</h3>
            <div className="task-grid">
              {tasks
                .filter((task) => task.category === category)
                .map((task) => {
                  const Icon = icons[task.icon as keyof typeof icons] ?? Plus
                  const uses = weeklyTaskUses(activities, task.id, now)
                  const reached = taskLimitReached(task, activities, now)
                  return (
                    <div className="task-item" key={task.id}>
                      <button
                        className="task-button"
                        disabled={busy || reached}
                        onClick={() => void log(task)}
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
                          {task.weeklyLimit != null && (
                            <small>
                              {reached
                                ? 'Weekly limit reached'
                                : `${uses} / ${task.weeklyLimit} this week`}
                            </small>
                          )}
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
              <button
                className="one-time-button"
                disabled={busy}
                onClick={() => setOneTimeCategory(category)}
                aria-label={`Add one-time task in ${CATEGORY_NAMES[category]}`}
              >
                <Plus aria-hidden="true" size={20} />
                <span>
                  <strong>One-time task</strong>
                  <small>Name it and choose points</small>
                </span>
              </button>
            </div>
          </section>
        ))}
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
      {oneTimeCategory && (
        <div
          className="modal-backdrop"
          onClick={() => setOneTimeCategory(null)}
        >
          <form
            className="modal card"
            role="dialog"
            aria-modal="true"
            aria-label={`One-time task in ${CATEGORY_NAMES[oneTimeCategory]}`}
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault()
              void logOneTime()
            }}
          >
            <h2>One-time task · {CATEGORY_NAMES[oneTimeCategory]}</h2>
            <label htmlFor="one-time-name">Task name</label>
            <input
              id="one-time-name"
              required
              maxLength={120}
              value={oneTimeName}
              onChange={(event) => setOneTimeName(event.target.value)}
              autoFocus
            />
            <label htmlFor="one-time-points">Points</label>
            <input
              id="one-time-points"
              type="number"
              min="0.01"
              step="any"
              required
              value={oneTimePoints}
              onChange={(event) => setOneTimePoints(event.target.value)}
            />
            <label htmlFor="one-time-note">Note (optional)</label>
            <textarea
              id="one-time-note"
              maxLength={2000}
              value={oneTimeNote}
              onChange={(event) => setOneTimeNote(event.target.value)}
            />
            <div className="modal-actions">
              <button type="button" onClick={() => setOneTimeCategory(null)}>
                Cancel
              </button>
              <button className="primary" disabled={busy}>
                Log task
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  )
}
