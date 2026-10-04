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
})
