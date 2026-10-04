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

export interface AiChoice {
  entityId: string
  entityType: EntityType
  name: string
}

export type AiResult =
  | { kind: 'query'; action: 'query'; answer: string; requestId: string }
  | {
      kind: 'clarify'
      action: 'clarify'
      question: string
      choices: AiChoice[]
      conversationId: string
    }
  | {
      kind: 'proposal'
      action: 'create' | 'add' | 'modify' | 'delete'
      proposalId: string
      requestId: string
      expiresAt: string
      proposal: {
        scope?: 'content' | 'entity'
        newText?: string
        content?: string
        reason?: string
        changeType?: ChangeType
      }
      preview: { before: string; after: string }
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
  async interpretMessage(
    message: string,
    includeFullHistory: boolean,
    conversationId?: string,
    requestId: string = crypto.randomUUID(),
  ) {
    if (!functions) throw new Error('Firebase is not configured.')
    const callable = httpsCallable<Record<string, unknown>, AiResult>(
      functions,
      'interpretMessage',
      {
        timeout: 120000,
      },
    )
    const result = await callable({
      message,
      includeFullHistory,
      ...(conversationId ? { conversationId } : {}),
      requestId,
    })
    return result.data
  },
  async approveAction(
    proposalId: string,
    replacementText?: string,
    approvalRequestId: string = crypto.randomUUID(),
  ) {
    if (!functions) throw new Error('Firebase is not configured.')
    const callable = httpsCallable<
      Record<string, unknown>,
      { entityId: string; revision: number; status: string }
    >(functions, 'approveAction')
    const result = await callable({
      proposalId,
      ...(replacementText !== undefined ? { replacementText } : {}),
      approvalRequestId,
    })
    return result.data
  },
  async rejectAction(proposalId: string) {
    if (!functions) throw new Error('Firebase is not configured.')
    const callable = httpsCallable<Record<string, unknown>, { status: string }>(
      functions,
      'rejectAction',
    )
    const result = await callable({ proposalId })
    return result.data
  },
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
