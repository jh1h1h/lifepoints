import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  runTransaction,
  updateDoc,
} from 'firebase/firestore'
import type { Activity, ActivityInput } from '../types'
import { db } from './firebase'

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
): Promise<string> {
  const now = new Date().toISOString()
  const reference = await addDoc(activityCollection(uid), {
    ...input,
    createdAt: now,
    updatedAt: now,
  })
  return reference.id
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
  if (!db) throw new Error('Firebase is not configured.')
  await deleteDoc(doc(db, 'users', uid, 'activities', activityId))
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
