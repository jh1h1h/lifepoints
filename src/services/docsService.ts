import {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
} from 'firebase/functions'
import { app } from './firebase'

const functions = app ? getFunctions(app) : null
if (functions && import.meta.env.VITE_USE_EMULATORS === 'true')
  connectFunctionsEmulator(functions, '127.0.0.1', 5001)

export type EntityType = 'friend' | 'project'

export interface DocEntity {
  id: string
  entityType: EntityType
  name: string
  normalizedName: string
  aliases: string[]
  revision: number
  deleted: boolean
  unreadCount: number
  sectionCount: number
  createdAt: string
  updatedAt: string
  latestSectionAt: string | null
}

export interface DocSection {
  id: string
  entityId: string
  entityType: EntityType
  entityName: string
  content: string
  pinned: boolean
  unread: boolean
  revision: number
  createdAt: string
  updatedAt: string
}

export interface AiChoice {
  entityId: string
  entityType: EntityType
  name: string
}
export interface AiReference {
  entityId: string
  sectionIds: string[]
}
export type AiMutation =
  | {
      schemaVersion: 2
      action: 'create'
      entityType: EntityType
      name: string
      text: string
      conflicts: string[]
    }
  | {
      schemaVersion: 2
      action: 'add'
      entityType: EntityType
      entityId: string
      expectedRevision: number
      text: string
      conflicts: string[]
    }
export type AiResult =
  | {
      kind: 'query'
      action: 'query'
      answer: string
      requestId: string
      references: AiReference[]
    }
  | {
      kind: 'clarify'
      action: 'clarify'
      question: string
      choices: AiChoice[]
      conversationId: string
    }
  | {
      kind: 'proposal'
      action: 'create' | 'add'
      proposalId: string
      requestId: string
      expiresAt: string
      targetName: string
      proposal: AiMutation
      preview: { before: string; after: string }
      conflicts: DocSection[]
    }

type Action =
  | 'list'
  | 'get'
  | 'list_sections'
  | 'recent_project_sections'
  | 'summary'
  | 'create'
  | 'add_section'
  | 'update_section'
  | 'set_section_pinned'
  | 'set_section_unread'
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
  return (await callable({ action, ...data })).data
}

export const docsService = {
  async interpretMessage(
    message: string,
    conversationId?: string,
    requestId: string = crypto.randomUUID(),
    selectedEntityId?: string,
  ) {
    if (!functions) throw new Error('Firebase is not configured.')
    const callable = httpsCallable<Record<string, unknown>, AiResult>(
      functions,
      'interpretMessage',
      { timeout: 120000 },
    )
    return (
      await callable({
        message,
        requestId,
        ...(conversationId ? { conversationId } : {}),
        ...(selectedEntityId ? { selectedEntityId } : {}),
      })
    ).data
  },
  async approveAction(
    proposalId: string,
    approvalRequestId: string = crypto.randomUUID(),
  ) {
    if (!functions) throw new Error('Firebase is not configured.')
    const callable = httpsCallable<
      Record<string, unknown>,
      {
        entityId: string
        sectionId: string
        entityType: EntityType
        name: string
        revision: number
        status: string
      }
    >(functions, 'approveAction')
    return (
      await callable({
        proposalId,
        approvalRequestId,
      })
    ).data
  },
  async rejectAction(proposalId: string) {
    if (!functions) throw new Error('Firebase is not configured.')
    const callable = httpsCallable<Record<string, unknown>, { status: string }>(
      functions,
      'rejectAction',
    )
    return (await callable({ proposalId })).data
  },
  async list(entityType: EntityType) {
    return (await call<{ entities: DocEntity[] }>('list', { entityType }))
      .entities
  },
  async get(entityId: string) {
    return (await call<{ entity: DocEntity }>('get', { entityId })).entity
  },
  async sections(entityId: string) {
    return (
      await call<{ sections: DocSection[] }>('list_sections', { entityId })
    ).sections
  },
  async recentProjects(limit = 15) {
    return (
      await call<{ sections: DocSection[] }>('recent_project_sections', {
        limit,
      })
    ).sections
  },
  async summary() {
    return call<{ unreadFriends: number }>('summary', {})
  },
  async mutate(
    action: Extract<
      Action,
      | 'create'
      | 'add_section'
      | 'update_section'
      | 'set_section_pinned'
      | 'set_section_unread'
      | 'rename'
      | 'update_aliases'
      | 'delete'
    >,
    data: Record<string, unknown>,
    operationId: string = crypto.randomUUID(),
  ) {
    return call<{
      id: string
      sectionId?: string
      revision: number
      changed: boolean
    }>(action, { ...data, operationId })
  },
}

export function readableDocError(error: unknown): string {
  const text =
    error instanceof Error ? error.message : 'Unable to save. Please try again.'
  if (/aborted|changed elsewhere|stale/i.test(text))
    return 'This item changed elsewhere. Reload it before saving your edits.'
  if (/unavailable|network|offline/i.test(text))
    return 'Docs is unavailable right now. Check your connection and try again.'
  return text
}
