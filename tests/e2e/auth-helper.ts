import { signInAnonymously } from 'firebase/auth'
import { collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore'
import { auth, db } from '../../src/services/firebase'
import type { Activity } from '../../src/types'

export async function signInTestUser(): Promise<string> {
  if (!auth) throw new Error('Test Firebase was not configured')
  return (await signInAnonymously(auth)).user.uid
}

export async function seedActivity(activity: Activity): Promise<void> {
  if (!db || !auth?.currentUser) throw new Error('Sign in first')
  const { activityId, userId, ...fields } = activity
  void userId
  await setDoc(
    doc(db, 'users', auth.currentUser.uid, 'activities', activityId),
    fields,
  )
}

export async function clearTestActivities(): Promise<void> {
  if (!db || !auth?.currentUser) throw new Error('Sign in first')
  const snapshot = await getDocs(
    collection(db, 'users', auth.currentUser.uid, 'activities'),
  )
  await Promise.all(snapshot.docs.map((item) => deleteDoc(item.ref)))
}
