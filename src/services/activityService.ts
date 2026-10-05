import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  runTransaction,
  updateDoc,
} from 'firebase/firestore'
import type { Activity, ActivityInput, Task } from '../types'
import { getWeekKey } from '../utils/date'
import { db } from './firebase'

export class TaskLimitReachedError extends Error {
  constructor(limit: number) {
    super(`This task has reached its weekly limit of ${limit}.`)
  }
}

function activityCollection(uid: string) {
  if (!db) throw new Error('Firebase is not configured.')
  return collection(db, 'users', uid, 'activities')
}

export function subscribeActivities(
  uid: string,
  onData: (activities: Activity[]) => void,
  onError: (error: Error) => void,
): () => void {
  return onSnapshot(
    activityCollection(uid),
    (snapshot) => {
      const activities = snapshot.docs.map(
        (item) =>
          ({ ...item.data(), activityId: item.id, userId: uid }) as Activity,
      )
      activities.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      onData(activities)
    },
    onError,
  )
}

export async function addActivity(
  uid: string,
  input: ActivityInput,
  task?: Task,
  observedUses = 0,
): Promise<string> {
  const now = new Date().toISOString()
  const fields = {
    ...input,
    createdAt: now,
    updatedAt: now,
  }
  if (!task) {
    const reference = await addDoc(activityCollection(uid), fields)
    return reference.id
  }
  if (task.id !== input.taskId) throw new Error('Task identity does not match.')
  if (!db) throw new Error('Firebase is not configured.')
  const weekKey = getWeekKey(new Date(input.timestamp))
  const taskRef = doc(db, 'users', uid, 'tasks', task.id)
  const usageRef = doc(db, 'users', uid, 'taskUsage', `${task.id}_${weekKey}`)
  const activityRef = doc(activityCollection(uid))
  await runTransaction(db, async (transaction) => {
    const taskSnapshot = await transaction.get(taskRef)
    if (!taskSnapshot.exists()) throw new Error('This task was removed.')
    const savedTask = taskSnapshot.data()
    const currentFields = {
      ...fields,
      taskName: savedTask.name as string,
      taskDescription: savedTask.description as string,
      category: savedTask.category as Task['category'],
      configuredPoints: savedTask.points as number,
    }
    const limit = savedTask.weeklyLimit as number | null | undefined
    if (limit == null) {
      transaction.set(activityRef, currentFields)
      return
    }
    const usageSnapshot = await transaction.get(usageRef)
    const recorded = usageSnapshot.exists()
      ? Number(usageSnapshot.data().count)
      : 0
    const count = Math.max(recorded, observedUses)
    if (count >= limit) throw new TaskLimitReachedError(limit)
    transaction.set(activityRef, currentFields)
    transaction.set(usageRef, {
      taskId: task.id,
      weekKey,
      count: count + 1,
      updatedAt: now,
    })
  })
  return activityRef.id
}

export async function editActivityNote(
  uid: string,
  activityId: string,
  note: string,
): Promise<void> {
  if (!db) throw new Error('Firebase is not configured.')
  await updateDoc(doc(db, 'users', uid, 'activities', activityId), {
    note,
    updatedAt: new Date().toISOString(),
  })
}

export async function deleteActivity(
  uid: string,
  activityId: string,
): Promise<void> {
  const firestore = db
  if (!firestore) throw new Error('Firebase is not configured.')
  const activityRef = doc(firestore, 'users', uid, 'activities', activityId)
  await runTransaction(firestore, async (transaction) => {
    const activity = await transaction.get(activityRef)
    if (!activity.exists()) return
    const data = activity.data()
    const weekKey = getWeekKey(new Date(data.timestamp as string))
    const usageRef = doc(
      firestore,
      'users',
      uid,
      'taskUsage',
      `${data.taskId as string}_${weekKey}`,
    )
    const usage = await transaction.get(usageRef)
    transaction.delete(activityRef)
    if (usage.exists()) {
      transaction.update(usageRef, {
        count: Math.max(0, Number(usage.data().count) - 1),
        updatedAt: new Date().toISOString(),
      })
    }
  })
}

export async function mergeActivities(
  uid: string,
  activities: Activity[],
): Promise<number> {
  if (!db) throw new Error('Firebase is not configured.')
  let merged = 0
  for (const activity of activities) {
    const { activityId, userId: _sourceUser, ...fields } = activity
    void _sourceUser
    const reference = doc(db, 'users', uid, 'activities', activityId)
    const added = await runTransaction(db, async (transaction) => {
      if ((await transaction.get(reference)).exists()) return false
      transaction.set(reference, fields)
      return true
    })
    if (added) merged++
  }
  return merged
}
