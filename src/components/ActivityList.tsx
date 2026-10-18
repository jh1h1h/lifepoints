import { useState } from 'react'
import type { Activity } from '../types'
import { CATEGORY_NAMES } from '../types'
import { previousWeekCopyId } from '../services/activityService'

interface Props {
  activities: Activity[]
  onDelete: (id: string) => Promise<void>
  onEditNote: (
    id: string,
    note: string,
    addToPreviousWeek?: boolean,
  ) => Promise<boolean>
  allActivityIds?: ReadonlySet<string>
  allowPreviousWeek?: boolean
  busy?: boolean
}

export function ActivityList({
  activities,
  onDelete,
  onEditNote,
  allActivityIds = new Set(),
  allowPreviousWeek = false,
  busy = false,
}: Props) {
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [addToPreviousWeek, setAddToPreviousWeek] = useState(false)
  if (!activities.length)
    return <p className="empty">No activities here yet.</p>
  return (
    <ul className="activity-list">
      {activities.map((activity) => {
        const alreadyAdded = allActivityIds.has(
          previousWeekCopyId(activity.activityId),
        )
        return (
          <li className="activity-row" key={activity.activityId}>
            <div className="activity-main">
              <strong>{activity.taskName}</strong>
              <span>
                {CATEGORY_NAMES[activity.category]} · +
                {activity.configuredPoints} ·{' '}
                {new Intl.DateTimeFormat(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                }).format(new Date(activity.timestamp))}
              </span>
              {activity.note && editing !== activity.activityId && (
                <p>{activity.note}</p>
              )}
            </div>
            {editing === activity.activityId ? (
              <form
                className="note-form"
                onSubmit={async (event) => {
                  event.preventDefault()
                  if (
                    await onEditNote(
                      activity.activityId,
                      draft,
                      addToPreviousWeek && !alreadyAdded,
                    )
                  ) {
                    setEditing(null)
                    setAddToPreviousWeek(false)
                  }
                }}
              >
                <label htmlFor={`note-${activity.activityId}`}>Note</label>
                <input
                  id={`note-${activity.activityId}`}
                  maxLength={2000}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  autoFocus
                />
                {allowPreviousWeek && (
                  <label className="activity-copy-option">
                    <input
                      type="checkbox"
                      checked={alreadyAdded || addToPreviousWeek}
                      disabled={busy || alreadyAdded}
                      onChange={(event) =>
                        setAddToPreviousWeek(event.target.checked)
                      }
                    />
                    {alreadyAdded ? 'Added to last week' : 'Add to last week'}
                  </label>
                )}
                <button disabled={busy}>Save</button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(null)
                    setAddToPreviousWeek(false)
                  }}
                >
                  Cancel
                </button>
              </form>
            ) : (
              <div className="activity-actions">
                <button
                  disabled={busy}
                  onClick={() => {
                    setDraft(activity.note)
                    setAddToPreviousWeek(false)
                    setEditing(activity.activityId)
                  }}
                >
                  Edit
                </button>
                <button
                  disabled={busy}
                  onClick={() => onDelete(activity.activityId)}
                >
                  Delete
                </button>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
