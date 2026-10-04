import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, setDoc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore'
import { readFileSync } from 'node:fs'

let environment: RulesTestEnvironment
const now = new Date().toISOString()
const valid = {
  taskId: 'growth_learning',
  taskName: 'Focused learning session',
  taskDescription: 'Learn',
  category: 'growth',
  configuredPoints: 5,
  timestamp: now,
  note: '',
  createdAt: now,
  updatedAt: now,
}
const validTask = {
  category: 'growth',
  name: 'A task',
  description: '',
  points: 2.5,
  icon: 'book-open',
  note: '',
  order: 0,
  createdAt: now,
  updatedAt: now,
}

beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId: 'demo-lifepoints',
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: readFileSync('firestore.rules', 'utf8'),
    },
  })
})
beforeEach(async () => {
  await environment.clearFirestore()
})
afterAll(async () => {
  await environment.cleanup()
})

describe('Firestore ownership and data rules', () => {
  it('lets a user create, read, edit note, and delete their activity', async () => {
    const store = environment.authenticatedContext('alice').firestore()
    const reference = doc(store, 'users/alice/activities/a1')
    await assertSucceeds(setDoc(reference, valid))
    expect((await assertSucceeds(getDoc(reference))).data()?.taskName).toBe(
      valid.taskName,
    )
    await assertSucceeds(
      updateDoc(reference, {
        note: 'Changed',
        updatedAt: new Date().toISOString(),
      }),
    )
    await assertFails(updateDoc(reference, { configuredPoints: 100 }))
    await assertSucceeds(deleteDoc(reference))
  })
  it('denies another user reading or writing', async () => {
    const alice = environment.authenticatedContext('alice').firestore()
    const bob = environment.authenticatedContext('bob').firestore()
    await assertSucceeds(setDoc(doc(bob, 'users/bob/activities/b1'), valid))
    await assertFails(getDoc(doc(alice, 'users/bob/activities/b1')))
    await assertFails(setDoc(doc(alice, 'users/bob/activities/a1'), valid))
    await assertFails(deleteDoc(doc(alice, 'users/bob/activities/b1')))
  })
  it('denies unauthenticated access', async () => {
    const store = environment.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(store, 'users/alice/activities/a1')))
    await assertFails(setDoc(doc(store, 'users/alice/activities/a1'), valid))
    await assertFails(getDoc(doc(store, 'users/alice/tasks/growth_1')))
    await assertFails(
      setDoc(doc(store, 'users/alice/tasks/growth_1'), validTask),
    )
  })
  it('rejects malformed activity data', async () => {
    const store = environment.authenticatedContext('alice').firestore()
    await assertFails(
      setDoc(doc(store, 'users/alice/activities/a1'), {
        ...valid,
        category: 'unknown',
      }),
    )
    await assertFails(
      setDoc(doc(store, 'users/alice/activities/a1'), {
        ...valid,
        configuredPoints: 0,
      }),
    )
  })
  it('accepts positive fractional points', async () => {
    const store = environment.authenticatedContext('alice').firestore()
    const reference = doc(store, 'users/alice/activities/fractional')
    await assertSucceeds(
      setDoc(reference, {
        ...valid,
        taskDescription: '',
        configuredPoints: 0.3,
      }),
    )
    expect((await getDoc(reference)).data()?.configuredPoints).toBe(0.3)
  })
  it('allows only the owner to manage tasks and keeps task identity stable', async () => {
    const alice = environment.authenticatedContext('alice').firestore()
    const bob = environment.authenticatedContext('bob').firestore()
    const reference = doc(alice, 'users/alice/tasks/growth_1')
    await assertSucceeds(setDoc(reference, validTask))
    expect((await getDoc(reference)).data()?.points).toBe(2.5)
    await assertSucceeds(
      updateDoc(reference, { note: 'Reminder', updatedAt: now }),
    )
    await assertSucceeds(updateDoc(reference, { points: 3, updatedAt: now }))
    await assertFails(updateDoc(reference, { createdAt: 'different' }))
    await assertFails(getDoc(doc(bob, 'users/alice/tasks/growth_1')))
    await assertFails(setDoc(doc(bob, 'users/alice/tasks/another'), validTask))
    await assertFails(deleteDoc(doc(bob, 'users/alice/tasks/growth_1')))
    await assertSucceeds(deleteDoc(reference))
  })
  it('protects the task initialization marker', async () => {
    const alice = environment.authenticatedContext('alice').firestore()
    const bob = environment.authenticatedContext('bob').firestore()
    const marker = doc(alice, 'users/alice/settings/taskList')
    await assertSucceeds(setDoc(marker, { seedVersion: 1, createdAt: now }))
    await assertFails(setDoc(marker, { seedVersion: 1, createdAt: now }))
    await assertFails(getDoc(doc(bob, 'users/alice/settings/taskList')))
  })
  it('allows only owner reads of Docs and forbids direct writes that bypass history', async () => {
    const alice = environment.authenticatedContext('alice').firestore()
    const bob = environment.authenticatedContext('bob').firestore()
    const guest = environment.unauthenticatedContext().firestore()
    const entityPath = 'users/alice/docs/doc123456'
    const editPath = `${entityPath}/edits/edit123456`
    await environment.withSecurityRulesDisabled(async (context) => {
      const admin = context.firestore()
      await setDoc(doc(admin, entityPath), { name: 'Kevin', content: 'Hi' })
      await setDoc(doc(admin, editPath), { patch: '{}' })
    })
    await assertSucceeds(getDoc(doc(alice, entityPath)))
    await assertSucceeds(getDoc(doc(alice, editPath)))
    await assertFails(getDoc(doc(bob, entityPath)))
    await assertFails(getDoc(doc(bob, editPath)))
    await assertFails(getDoc(doc(guest, entityPath)))
    await assertFails(setDoc(doc(alice, entityPath), { name: 'Bypass' }))
    await assertFails(updateDoc(doc(alice, entityPath), { content: 'Bypass' }))
    await assertFails(deleteDoc(doc(alice, entityPath)))
    await assertFails(setDoc(doc(alice, editPath), { patch: '{}' }))
    await assertFails(
      setDoc(doc(alice, 'users/alice/docOperations/op123456'), {}),
    )
  })
})
