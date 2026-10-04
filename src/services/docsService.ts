import {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
} from 'firebase/functions'
import { app } from './firebase'

const functions = app ? getFunctions(app) : null
if (functions && import.meta.env.VITE_USE_EMULATORS === 'true') {
  connectFunctionsEmulator(functions, '127.0.0.1', 5001)
}

export type EntityType = 'friend' | 'project'
export type ChangeType = 'correction' | 'new_information' | 'unspecified'

export interface DocEntity {
  id: string
  entityType: EntityType
  name: string
  normalizedName: string
  aliases: string[]
  content: string
  revision: number
  deleted: boolean
  createdAt: string
  updatedAt: string
}

export interface DocEdit {
  id: string
  eventId: string
  operation: string
  baseRevision: number
  newRevision: number
  patch: string
  beforeHash: string
  afterHash: string
  source: 'manual' | 'ai_approved'
  changeType: ChangeType
  description: string
  timestamp: string
  beforeName: string
  afterName: string
  beforeAliases: string[]
  afterAliases: string[]
}

type Action =
  | 'list'
  | 'get'
  | 'history'
  | 'create'
  | 'update_content'
  | 'rename'
  | 'update_aliases'
  | 'delete'

async function call<T>(
  action: Action,
  data: Record<string, unknown>,
): Promise<T> {
  if (!functions) throw new Error('Firebase is not configured.')
  const callable = httpsCallable<Record<string, unknown>, T>(
    functions,
    'docs_api',
  )
  const result = await callable({ action, ...data })
  return result.data
}

export const docsService = {
  async list(entityType: EntityType) {
    return (await call<{ entities: DocEntity[] }>('list', { entityType }))
      .entities
  },
  async get(entityId: string) {
    return (await call<{ entity: DocEntity }>('get', { entityId })).entity
  },
  async history(entityId: string) {
    return (await call<{ edits: DocEdit[] }>('history', { entityId })).edits
  },
  async mutate(
    action: Extract<
      Action,
      'create' | 'update_content' | 'rename' | 'update_aliases' | 'delete'
    >,
    data: Record<string, unknown>,
    operationId: string = crypto.randomUUID(),
  ) {
    return call<{
      id: string
      revision: number
      changed: boolean
      alreadyProcessed?: boolean
    }>(action, { ...data, operationId })
  },
}

export function readableDocError(error: unknown): string {
  const text =
    error instanceof Error ? error.message : 'Unable to save. Please try again.'
  if (/aborted|changed elsewhere/i.test(text))
    return 'This document changed elsewhere. Reload it before saving your edits.'
  if (/unavailable|network|offline/i.test(text))
    return 'Docs is unavailable right now. Check your connection and try again.'
  return text
}
