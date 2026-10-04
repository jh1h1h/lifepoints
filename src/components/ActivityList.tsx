import { useState } from 'react'
import type { Activity } from '../types'
import { CATEGORY_NAMES } from '../types'

interface Props {
  activities: Activity[]
  onDelete: (id: string) => Promise<void>
  onEditNote: (id: string, note: string) => Promise<void>
  busy?: boolean
}

export function ActivityList({
  activities,
  onDelete,
  onEditNote,
  busy = false,
}: Props) {
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  if (!activities.length)
    return <p className="empty">No activities here yet.</p>
  return (
    <ul className="activity-list">
      {activities.map((activity) => (
        <li className="activity-row" key={activity.activityId}>
          <div className="activity-main">
            <strong>{activity.taskName}</strong>
            <span>
              {CATEGORY_NAMES[activity.category]} · +{activity.configuredPoints}{' '}
              ·{' '}
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
                await onEditNote(activity.activityId, draft)
                setEditing(null)
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
              <button disabled={busy}>Save</button>
              <button type="button" onClick={() => setEditing(null)}>
                Cancel
              </button>
            </form>
          ) : (
            <div className="activity-actions">
              <button
                disabled={busy}
                onClick={() => {
                  setDraft(activity.note)
                  setEditing(activity.activityId)
                }}
              >
                Edit note
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
      ))}
    </ul>
  )
}
