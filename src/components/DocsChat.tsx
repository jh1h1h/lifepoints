import { useEffect, useRef, useState } from 'react'
import { ActionPreview, type ProposalStatus } from './ActionPreview'
import {
  docsService,
  readableDocError,
  type AiResult,
  type DocEntity,
  type EntityType,
} from '../services/docsService'
import { docPath } from '../utils/docs'
import { href, navigate } from '../utils/routes'

type ChatStatus =
  | 'thinking'
  | 'pending'
  | 'query'
  | 'clarify'
  | 'applying'
  | 'applied'
  | 'rejected'
  | 'failed'
  | 'stale'

interface Source {
  entityId: string
  name: string
  entityType: EntityType
  fromHistory: boolean
}

interface ChatEntry {
  id: string
  userMessage: string
  includeFullHistory: boolean
  requestId: string
  conversationId?: string
  selectedEntityId?: string
  status: ChatStatus
  result?: AiResult
  replacement?: string
  entityName?: string
  approvalRequestId?: string
  failedDecision?: 'approve' | 'reject'
  failedChecks?: number
  error?: string
  approved?: {
    entityId: string
    revision: number
    name: string
    entityType: EntityType
  }
  refreshedEntity?: DocEntity
  historyCount?: number
  refreshError?: string
  sources?: Source[]
}

interface ChatSession {
  entries: ChatEntry[]
  draft: string
  includeFullHistory: boolean
  activeConversationId?: string
}

const EMPTY_SESSION: ChatSession = {
  entries: [],
  draft: '',
  includeFullHistory: false,
}

function sessionKey(uid: string) {
  return `lifepoints-docs-chat:${uid}`
}

function loadSession(uid: string): ChatSession {
  try {
    const raw = sessionStorage.getItem(sessionKey(uid))
    if (!raw) return EMPTY_SESSION
    const value: unknown = JSON.parse(raw)
    if (
      typeof value !== 'object' ||
      value === null ||
      !('entries' in value) ||
      !Array.isArray(value.entries)
    )
      return EMPTY_SESSION
    const candidate = value as Partial<ChatSession>
    const entries = value.entries
      .filter((item: unknown): item is ChatEntry => {
        if (typeof item !== 'object' || item === null) return false
        const entry = item as Partial<ChatEntry>
        return (
          typeof entry.id === 'string' &&
          typeof entry.userMessage === 'string' &&
          typeof entry.requestId === 'string' &&
          typeof entry.includeFullHistory === 'boolean' &&
          typeof entry.status === 'string'
        )
      })
      .slice(-40)
      .map((entry: ChatEntry) => {
        if (entry.status === 'thinking' || entry.status === 'applying')
          return {
            ...entry,
            status: 'failed' as const,
            error:
              'The previous request may have completed. Retry to check the same request ID.',
          }
        return entry
      })
    return {
      entries,
      draft: typeof candidate.draft === 'string' ? candidate.draft : '',
      includeFullHistory: candidate.includeFullHistory === true,
      activeConversationId:
        typeof candidate.activeConversationId === 'string'
          ? candidate.activeConversationId
          : undefined,
    }
  } catch {
    return EMPTY_SESSION
  }
}

function staleError(error: unknown): boolean {
  const text =
    error instanceof Error
      ? `${'code' in error ? String(error.code) : ''} ${error.message}`
      : String(error)
  return /aborted|stale|changed|expired|no longer pending|not-found|deleted/i.test(
    text,
  )
}

function aiError(error: unknown): string {
  const text =
    error instanceof Error
      ? `${'code' in error ? String(error.code) : ''} ${error.message}`
      : String(error)
  if (/deadline-exceeded|timed out|timeout/i.test(text))
    return 'The assistant timed out. Retry to check this request before sending it again.'
  if (/resource-exhausted|rate.limit|budget/i.test(text))
    return 'The assistant is at its current request or context limit. Try again later or use a shorter message.'
  if (/failed-precondition|invalid response|malformed|unsupported/i.test(text))
    return 'The assistant could not make a safe suggestion. Try rephrasing the message.'
  if (/\binternal\b/i.test(text))
    return 'The Docs assistant is temporarily unavailable. Check your connection and try again.'
  if (/unauthenticated|permission-denied/i.test(text))
    return 'Your Docs session could not be verified. Sign in again and retry.'
  return readableDocError(error)
}

function statusLabel(status: ChatStatus): string {
  return {
    thinking: 'Thinking',
    pending: 'Pending approval',
    query: 'Answered',
    clarify: 'Needs clarification',
    applying: 'Applying',
    applied: 'Applied',
    rejected: 'Rejected',
    failed: 'Failed',
    stale: 'Stale',
  }[status]
}

export function DocsChat({ uid }: { uid: string }) {
  const [session, setSession] = useState<ChatSession>(() => loadSession(uid))
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const endRef = useRef<HTMLDivElement | null>(null)
  const { entries, draft, includeFullHistory, activeConversationId } = session

  useEffect(() => {
    try {
      sessionStorage.setItem(sessionKey(uid), JSON.stringify(session))
    } catch {
      /* Private browsing may deny storage. */
    }
  }, [session, uid])
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' })
  }, [entries])

  function patchEntry(id: string, patch: Partial<ChatEntry>) {
    setSession((current) => ({
      ...current,
      entries: current.entries.map((entry) =>
        entry.id === id ? { ...entry, ...patch } : entry,
      ),
    }))
  }

  async function runInterpret(entry: ChatEntry) {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    patchEntry(entry.id, { status: 'thinking', error: undefined })
    try {
      const result = await docsService.interpretMessage(
        entry.userMessage,
        entry.includeFullHistory,
        entry.conversationId,
        entry.requestId,
        entry.selectedEntityId,
      )
      const nextStatus: ChatStatus =
        result.kind === 'proposal' ? 'pending' : result.kind
      patchEntry(entry.id, {
        result,
        status: nextStatus,
        replacement:
          result.kind === 'proposal'
            ? result.proposal.action === 'create'
              ? result.proposal.content
              : result.proposal.action === 'add' ||
                  result.proposal.action === 'modify'
                ? result.proposal.newText
                : ''
            : undefined,
        entityName:
          result.kind === 'proposal' && result.proposal.action === 'create'
            ? result.proposal.name
            : undefined,
      })
      setSession((current) => ({
        ...current,
        draft: current.draft === entry.userMessage ? '' : current.draft,
        activeConversationId:
          result.kind === 'clarify' ? result.conversationId : undefined,
      }))
      if (result.kind === 'query' && result.references?.length) {
        const fetched = await Promise.allSettled(
          result.references.map((reference) =>
            docsService.get(reference.entityId),
          ),
        )
        const sources = fetched.flatMap((value, index): Source[] =>
          value.status === 'fulfilled'
            ? [
                {
                  entityId: value.value.id,
                  name: value.value.name,
                  entityType: value.value.entityType,
                  fromHistory: result.references[index].eventIds.length > 0,
                },
              ]
            : [],
        )
        patchEntry(entry.id, { sources })
      }
    } catch (error) {
      patchEntry(entry.id, {
        status: 'failed',
        error: aiError(error),
        failedDecision: undefined,
        failedChecks: (entry.failedChecks ?? 0) + 1,
      })
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  function send(
    text = draft,
    selectedEntityId?: string,
    mode = includeFullHistory,
    conversationId = activeConversationId,
  ) {
    if (busyRef.current || !text.trim()) return
    const entry: ChatEntry = {
      id: crypto.randomUUID(),
      userMessage: text.trim(),
      includeFullHistory: mode,
      requestId: crypto.randomUUID(),
      conversationId,
      selectedEntityId,
      status: 'thinking',
    }
    setSession((current) => ({
      ...current,
      entries: [...current.entries, entry],
    }))
    void runInterpret(entry)
  }

  async function decide(entry: ChatEntry, decision: 'approve' | 'reject') {
    if (busyRef.current || entry.result?.kind !== 'proposal') return
    busyRef.current = true
    setBusy(true)
    const proposal = entry.result.proposal
    const approvalRequestId = entry.approvalRequestId ?? crypto.randomUUID()
    patchEntry(entry.id, {
      status: 'applying',
      error: undefined,
      approvalRequestId:
        decision === 'approve' ? approvalRequestId : entry.approvalRequestId,
      failedDecision: decision,
    })
    try {
      if (decision === 'reject') {
        await docsService.rejectAction(entry.result.proposalId)
        patchEntry(entry.id, { status: 'rejected' })
      } else {
        const editable =
          proposal.action === 'create' ||
          proposal.action === 'add' ||
          proposal.action === 'modify'
        const result = await docsService.approveAction(
          entry.result.proposalId,
          editable ? entry.replacement : undefined,
          approvalRequestId,
          proposal.action === 'create' ? entry.entityName : undefined,
        )
        patchEntry(entry.id, { status: 'applied', approved: result })
        try {
          const [entity, edits] = await Promise.all([
            docsService.get(result.entityId),
            docsService.history(result.entityId),
          ])
          patchEntry(entry.id, {
            refreshedEntity: entity,
            historyCount: edits.length,
          })
        } catch (error) {
          patchEntry(entry.id, {
            refreshError: `Saved, but the document view could not refresh: ${readableDocError(error)}`,
          })
        }
      }
    } catch (error) {
      patchEntry(entry.id, {
        status: staleError(error) ? 'stale' : 'failed',
        error: staleError(error)
          ? 'This suggestion is stale or unavailable. Regenerate it against the latest document.'
          : aiError(error),
        failedDecision: decision,
      })
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  function changeProposal(
    entry: ChatEntry,
    replacement: string,
    entityName: string,
  ) {
    patchEntry(entry.id, {
      replacement,
      entityName,
      approvalRequestId: undefined,
    })
  }

  return (
    <section className="docs-chat" aria-label="Docs chat">
      <header className="chat-intro">
        <p className="eyebrow">Docs · Chat</p>
        <h1>What would you like to remember?</h1>
        <p className="muted">
          Ask a question or describe a change. You approve every suggested edit
          before it is saved. Relevant documents are sent to DeepSeek.
        </p>
      </header>
      <div
        className="chat-log"
        role="log"
        aria-label="Conversation"
        aria-live="polite"
      >
        {entries.length === 0 && (
          <p className="chat-empty">
            Try “Kevin is now working at Apple” or “What is next for
            Friendfolio?”
          </p>
        )}
        {entries.map((entry) => (
          <div className="chat-turn" key={entry.id}>
            <div className="chat-bubble chat-user">
              <span className="chat-speaker">You</span>
              <p>{entry.userMessage}</p>
              <small>
                {entry.includeFullHistory
                  ? 'Full history included'
                  : 'Current documents only'}
              </small>
            </div>
            <div className="chat-bubble chat-assistant">
              <div className="chat-meta">
                <span className="chat-speaker">Assistant</span>
                <span className="chat-state">{statusLabel(entry.status)}</span>
              </div>
              {entry.status === 'thinking' && <p role="status">Thinking…</p>}
              {entry.result?.kind === 'query' && (
                <>
                  <p className="chat-answer">{entry.result.answer}</p>
                  {entry.sources && entry.sources.length > 0 && (
                    <div className="chat-sources">
                      Sources:{' '}
                      {entry.sources.map((source) => (
                        <a
                          key={source.entityId}
                          href={href(
                            docPath(source.entityType, source.entityId),
                          )}
                          onClick={(event) => {
                            event.preventDefault()
                            navigate(
                              docPath(source.entityType, source.entityId),
                            )
                          }}
                        >
                          {source.name}
                          {source.fromHistory ? ' · edit history' : ''}
                        </a>
                      ))}
                    </div>
                  )}
                  {!entry.includeFullHistory &&
                    /enable full history/i.test(entry.result.answer) && (
                      <p className="muted">
                        You can enable full history below and ask again.
                      </p>
                    )}
                </>
              )}
              {entry.result?.kind === 'clarify' && (
                <>
                  <p>{entry.result.question}</p>
                  {entry.result.choices.length > 0 && (
                    <div
                      className="choice-list"
                      aria-label="Clarification choices"
                    >
                      {entry.result.choices.map((choice) => (
                        <button
                          key={choice.entityId}
                          disabled={
                            busy ||
                            (activeConversationId !== entry.conversationId &&
                              activeConversationId !==
                                (entry.result?.kind === 'clarify'
                                  ? entry.result.conversationId
                                  : undefined))
                          }
                          onClick={() => send(choice.name, choice.entityId)}
                        >
                          {choice.name} · {choice.entityType}{' '}
                          <small>{choice.entityId.slice(0, 6)}</small>
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="muted">Or reply in your own words.</p>
                  {activeConversationId === entry.result.conversationId && (
                    <button
                      className="text-button"
                      onClick={() =>
                        setSession((current) => ({
                          ...current,
                          activeConversationId: undefined,
                        }))
                      }
                    >
                      Start a new topic
                    </button>
                  )}
                </>
              )}
              {entry.result?.kind === 'proposal' && (
                <ActionPreview
                  result={entry.result}
                  status={entry.status as ProposalStatus}
                  replacement={entry.replacement ?? ''}
                  entityName={entry.entityName ?? entry.result.targetName}
                  onEdit={(replacement, entityName) =>
                    changeProposal(entry, replacement, entityName)
                  }
                  onApprove={() => void decide(entry, 'approve')}
                  onReject={() => void decide(entry, 'reject')}
                  onRetry={() =>
                    void decide(entry, entry.failedDecision ?? 'approve')
                  }
                  failedDecision={entry.failedDecision}
                  onRegenerate={() =>
                    send(
                      entry.userMessage,
                      entry.selectedEntityId,
                      entry.includeFullHistory,
                      entry.conversationId,
                    )
                  }
                />
              )}
              {entry.error && (
                <p className="error" role="alert">
                  {entry.error}
                </p>
              )}
              {entry.status === 'failed' && !entry.result && (
                <div className="docs-actions">
                  <button
                    disabled={busy}
                    onClick={() => void runInterpret(entry)}
                  >
                    Retry this request
                  </button>
                  {(entry.failedChecks ?? 0) >= 2 && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        send(
                          entry.userMessage,
                          entry.selectedEntityId,
                          entry.includeFullHistory,
                          entry.conversationId,
                        )
                      }
                    >
                      Start a new request
                    </button>
                  )}
                </div>
              )}
              {entry.status === 'applied' && entry.approved && (
                <p className="applied-summary" role="status">
                  Saved {entry.approved.name}, revision{' '}
                  {entry.approved.revision}.{' '}
                  {entry.refreshedEntity && (
                    <>
                      Current document and {entry.historyCount} history{' '}
                      {entry.historyCount === 1 ? 'entry' : 'entries'}{' '}
                      refreshed.{' '}
                    </>
                  )}
                  <a
                    href={href(
                      docPath(
                        entry.approved.entityType,
                        entry.approved.entityId,
                      ),
                    )}
                    onClick={(event) => {
                      event.preventDefault()
                      navigate(
                        docPath(
                          entry.approved!.entityType,
                          entry.approved!.entityId,
                        ),
                      )
                    }}
                  >
                    Open document
                  </a>
                </p>
              )}
              {entry.refreshError && (
                <p className="error" role="alert">
                  {entry.refreshError}
                </p>
              )}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form
        className="chat-composer"
        onSubmit={(event) => {
          event.preventDefault()
          send()
        }}
      >
        <label htmlFor="docs-message">Message</label>
        <textarea
          id="docs-message"
          rows={3}
          maxLength={4000}
          value={draft}
          onChange={(event) =>
            setSession((current) => ({ ...current, draft: event.target.value }))
          }
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault()
              send()
            }
          }}
          placeholder="Ask or tell Docs something…"
        />
        <div className="composer-footer">
          <label className="compact-check">
            <input
              type="checkbox"
              checked={includeFullHistory}
              onChange={(event) =>
                setSession((current) => ({
                  ...current,
                  includeFullHistory: event.target.checked,
                }))
              }
            />
            Include full history
          </label>
          <button className="primary" disabled={busy || !draft.trim()}>
            {busy ? 'Working…' : 'Send'}
          </button>
        </div>
        {includeFullHistory && (
          <small className="muted">
            Full history may use more API context.
          </small>
        )}
        {activeConversationId && (
          <small className="muted">
            Your next message will answer the clarification above.
          </small>
        )}
      </form>
    </section>
  )
}
