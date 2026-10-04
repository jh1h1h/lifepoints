import { useEffect, useState } from 'react'
import type { Activity, ActivityInput } from '../types'
import {
  addActivity,
  deleteActivity,
  editActivityNote,
  mergeActivities,
  subscribeActivities,
} from '../services/activityService'

export function useActivities(uid?: string) {
  const [activities, setActivities] = useState<Activity[]>([])
  const [ownerUid, setOwnerUid] = useState<string | undefined>()
  const [loading, setLoading] = useState(Boolean(uid))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [undoId, setUndoId] = useState<string | null>(null)
  useEffect(() => {
    if (!uid) return
    setLoading(true)
    return subscribeActivities(
      uid,
      (data) => {
        setActivities(data)
        setOwnerUid(uid)
        setLoading(false)
      },
      () => {
        setOwnerUid(uid)
        setMessage(
          'Could not load activities. Check your connection and try again.',
        )
        setLoading(false)
      },
    )
  }, [uid])
  async function run<T>(
    operation: () => Promise<T>,
    failure: string,
  ): Promise<T | undefined> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setMessage('You appear to be offline. Reconnect and try again.')
      return undefined
    }
    setBusy(true)
    setMessage('')
    try {
      return await operation()
    } catch {
      setMessage(failure)
      return undefined
    } finally {
      setBusy(false)
    }
  }
  async function add(input: ActivityInput) {
    if (!uid) return false
    const id = await run(
      () => addActivity(uid, input),
      'Could not save the activity. Check your connection and try again.',
    )
    if (id) {
      setUndoId(id)
      setMessage('Activity added.')
    }
    return Boolean(id)
  }
  async function remove(id: string) {
    if (!uid) return
    const done = await run(async () => {
      await deleteActivity(uid, id)
      return true
    }, 'Could not delete the activity. Please try again.')
    if (done) {
      setUndoId(null)
      setMessage('Activity deleted.')
    }
  }
  async function editNote(id: string, note: string) {
    if (!uid) return
    const done = await run(async () => {
      await editActivityNote(uid, id, note)
      return true
    }, 'Could not save the note. Please try again.')
    if (done) setMessage('Note saved.')
  }
  async function merge(items: Activity[]) {
    if (!uid) return
    const count = await run(
      () => mergeActivities(uid, items),
      'Import stopped. Some activities may have been added; retrying will skip existing IDs.',
    )
    if (count !== undefined) setMessage(`Imported ${count} activities.`)
  }
  async function undo() {
    if (undoId) await remove(undoId)
  }
  return {
    activities: ownerUid === uid ? activities : [],
    loading: Boolean(uid) && (loading || ownerUid !== uid),
    busy,
    message,
    setMessage,
    undoId,
    add,
    remove,
    editNote,
    merge,
    undo,
  }
}
