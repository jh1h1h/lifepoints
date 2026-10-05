import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  runTransaction,
  updateDoc,
} from 'firebase/firestore'
import { initialTasksForEmail } from '../data/taskSeeds'
import { CATEGORIES, type Task, type TaskDraft } from '../types'
import { db } from './firebase'

function taskCollection(uid: string) {
  if (!db) throw new Error('Firebase is not configured.')
  return collection(db, 'users', uid, 'tasks')
}

function validDraft(draft: TaskDraft): TaskDraft {
  if (
    !CATEGORIES.includes(draft.category) ||
    !draft.name.trim() ||
    draft.name.length > 120 ||
    draft.description.length > 1000 ||
    !draft.icon.trim() ||
    draft.note.length > 2000 ||
    !Number.isFinite(draft.points) ||
    draft.points <= 0 ||
    (draft.weeklyLimit != null &&
      (!Number.isInteger(draft.weeklyLimit) ||
        draft.weeklyLimit < 1 ||
        draft.weeklyLimit > 999))
  )
    throw new Error(
      'Check the task name, points, weekly limit, description, and note.',
    )
  return {
    ...draft,
    weeklyLimit: draft.weeklyLimit ?? null,
    name: draft.name.trim(),
    description: draft.description.trim(),
    note: draft.note.trim(),
  }
}

export async function ensureTasksInitialized(
  uid: string,
  email: string | null,
) {
  const firestore = db
  if (!firestore) throw new Error('Firebase is not configured.')
  const marker = doc(firestore, 'users', uid, 'settings', 'taskList')
  const tasks = initialTasksForEmail(email)
  await runTransaction(firestore, async (transaction) => {
    if ((await transaction.get(marker)).exists()) return
    const now = new Date().toISOString()
    tasks.forEach((task, order) => {
      const { id, ...fields } = task
      transaction.set(doc(firestore, 'users', uid, 'tasks', id), {
        ...fields,
        weeklyLimit: null,
        note: '',
        order,
        createdAt: now,
        updatedAt: now,
      })
    })
    transaction.set(marker, { seedVersion: 1, createdAt: now })
  })
}

export function subscribeTasks(
  uid: string,
  onData: (tasks: Task[]) => void,
  onError: (error: Error) => void,
): () => void {
  return onSnapshot(
    taskCollection(uid),
    (snapshot) => {
      const tasks = snapshot.docs.map(
        (item) =>
          ({
            ...item.data(),
            id: item.id,
            weeklyLimit: item.data().weeklyLimit ?? null,
          }) as Task,
      )
      tasks.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
      onData(tasks)
    },
    onError,
  )
}

export async function createTask(uid: string, draft: TaskDraft): Promise<void> {
  await addDoc(taskCollection(uid), {
    ...validDraft(draft),
    order: Date.now(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })
}

export async function updateTask(
  uid: string,
  id: string,
  draft: TaskDraft,
): Promise<void> {
  if (!db) throw new Error('Firebase is not configured.')
  await updateDoc(doc(db, 'users', uid, 'tasks', id), {
    ...validDraft(draft),
    updatedAt: new Date().toISOString(),
  })
}

export async function updateTaskNote(uid: string, id: string, note: string) {
  if (!db) throw new Error('Firebase is not configured.')
  if (note.length > 2000) throw new Error('The note is too long.')
  await updateDoc(doc(db, 'users', uid, 'tasks', id), {
    note: note.trim(),
    updatedAt: new Date().toISOString(),
  })
}

export async function deleteTask(uid: string, id: string): Promise<void> {
  if (!db) throw new Error('Firebase is not configured.')
  await deleteDoc(doc(db, 'users', uid, 'tasks', id))
}

export async function mergeTasks(
  uid: string,
  tasks: Task[],
  replaceExisting: boolean,
): Promise<number> {
  if (!db) throw new Error('Firebase is not configured.')
  let added = 0
  for (const task of tasks) {
    const { id, createdAt, order, updatedAt: _updatedAt, ...draft } = task
    void _updatedAt
    const fields = validDraft(draft)
    const reference = doc(db, 'users', uid, 'tasks', id)
    const inserted = await runTransaction(db, async (transaction) => {
      if ((await transaction.get(reference)).exists()) {
        if (!replaceExisting) return false
        transaction.update(reference, {
          ...fields,
          updatedAt: new Date().toISOString(),
        })
        return true
      }
      transaction.set(reference, {
        ...fields,
        order,
        createdAt,
        updatedAt: new Date().toISOString(),
      })
      return true
    })
    if (inserted) added++
  }
  return added
}
