import { useEffect, useState } from 'react'
import type { Task, TaskDraft } from '../types'
import {
  createTask,
  deleteTask,
  ensureTasksInitialized,
  mergeTasks,
  subscribeTasks,
  updateTask,
  updateTaskNote,
} from '../services/taskService'

export function useTasks(uid?: string, email?: string | null) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [ownerUid, setOwnerUid] = useState<string | undefined>()
  const [loading, setLoading] = useState(Boolean(uid))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!uid) return
    let active = true
    let unsubscribe: (() => void) | undefined
    setLoading(true)
    ensureTasksInitialized(uid, email ?? null)
      .then(() => {
        if (!active) return
        unsubscribe = subscribeTasks(
          uid,
          (data) => {
            setTasks(data)
            setOwnerUid(uid)
            setLoading(false)
          },
          () => {
            setMessage('Could not load your tasks. Check your connection.')
            setOwnerUid(uid)
            setLoading(false)
          },
        )
      })
      .catch(() => {
        if (!active) return
        setMessage('Could not prepare your tasks. Check your connection.')
        setOwnerUid(uid)
        setLoading(false)
      })
    return () => {
      active = false
      unsubscribe?.()
    }
  }, [uid, email])

  async function run(operation: () => Promise<void>, success: string) {
    if (!uid) return false
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setMessage('You appear to be offline. Reconnect and try again.')
      return false
    }
    setBusy(true)
    try {
      await operation()
      setMessage(success)
      return true
    } catch (error) {
      setMessage(
        error instanceof Error && error.message.startsWith('Check the task')
          ? error.message
          : 'Could not save the task change. Check your connection and try again.',
      )
      return false
    } finally {
      setBusy(false)
    }
  }

  return {
    tasks: ownerUid === uid ? tasks : [],
    loading: Boolean(uid) && (loading || ownerUid !== uid),
    busy,
    message,
    setMessage,
    create: (draft: TaskDraft) =>
      run(() => createTask(uid!, draft), 'Task added.'),
    update: (id: string, draft: TaskDraft) =>
      run(() => updateTask(uid!, id, draft), 'Task saved.'),
    setNote: (id: string, note: string) =>
      run(() => updateTaskNote(uid!, id, note), 'Task note saved.'),
    remove: (id: string) => run(() => deleteTask(uid!, id), 'Task removed.'),
    merge: async (items: Task[], replaceExisting: boolean) => {
      if (!uid) return 0
      if (typeof navigator !== 'undefined' && !navigator.onLine)
        throw new Error('You appear to be offline. Reconnect and try again.')
      setBusy(true)
      try {
        return await mergeTasks(uid, items, replaceExisting)
      } finally {
        setBusy(false)
      }
    },
  }
}
