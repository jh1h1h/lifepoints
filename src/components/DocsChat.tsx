import { useEffect, useRef, useState } from 'react'
import { ActionPreview, type ProposalStatus } from './ActionPreview'
import {
  docsService,
  readableDocError,
  type AiResult,
  type EntityType,
} from '../services/docsService'
import { docPath } from '../utils/docs'
import { href, navigate } from '../utils/routes'

type Status =
  | 'thinking'
  | 'pending'
  | 'query'
  | 'clarify'
  | 'applying'
  | 'applied'
  | 'rejected'
  | 'failed'
  | 'stale'
interface Entry {
  id: string
  userMessage: string
  requestId: string
  status: Status
  conversationId?: string
  selectedEntityId?: string
  result?: AiResult
  approvalRequestId?: string
  failedDecision?: 'approve' | 'reject'
  error?: string
  approved?: {
    entityId: string
    sectionId: string
    revision: number
    name: string
    entityType: EntityType
  }
}

function messageFor(error: unknown) {
  const candidate = error as { details?: { reason?: string }; message?: string }
  if (candidate?.details?.reason) return candidate.details.reason
  return readableDocError(error)
}

export function DocsChat({ onSaved }: { onSaved?: () => void }) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [conversationId, setConversationId] = useState<string>()
  const busyRef = useRef(false)
  const logRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [entries])
  const patch = (id: string, value: Partial<Entry>) =>
    setEntries((current) =>
      current.map((item) => (item.id === id ? { ...item, ...value } : item)),
    )

  async function interpret(entry: Entry) {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    patch(entry.id, { status: 'thinking', error: undefined })
    try {
      const result = await docsService.interpretMessage(
        entry.userMessage,
        entry.conversationId,
        entry.requestId,
        entry.selectedEntityId,
      )
      patch(entry.id, {
        result,
        status: result.kind === 'proposal' ? 'pending' : result.kind,
      })
      setConversationId(
        result.kind === 'clarify' ? result.conversationId : undefined,
      )
      setDraft((current) => (current === entry.userMessage ? '' : current))
    } catch (error) {
      patch(entry.id, { status: 'failed', error: messageFor(error) })
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  function send(
    text = draft,
    selectedEntityId?: string,
    existingConversation = conversationId,
  ) {
    if (busyRef.current || !text.trim()) return
    const entry: Entry = {
      id: crypto.randomUUID(),
      userMessage: text,
      requestId: crypto.randomUUID(),
      conversationId: existingConversation,
      selectedEntityId,
      status: 'thinking',
    }
    setEntries((current) => [...current, entry])
    void interpret(entry)
  }

  async function decide(entry: Entry, decision: 'approve' | 'reject') {
    if (busyRef.current || entry.result?.kind !== 'proposal') return
    busyRef.current = true
    setBusy(true)
    const approvalRequestId = entry.approvalRequestId ?? crypto.randomUUID()
    patch(entry.id, {
      status: 'applying',
      approvalRequestId,
      failedDecision: decision,
      error: undefined,
    })
    try {
      if (decision === 'reject') {
        await docsService.rejectAction(entry.result.proposalId)
        patch(entry.id, { status: 'rejected' })
      } else {
        const result = await docsService.approveAction(
          entry.result.proposalId,
          approvalRequestId,
        )
        patch(entry.id, { status: 'applied', approved: result })
        onSaved?.()
      }
    } catch (error) {
      const stale =
        /aborted|stale|changed|expired|no longer pending|deleted/i.test(
          String(error),
        )
      patch(entry.id, {
        status: stale ? 'stale' : 'failed',
        error: stale
          ? 'This suggestion is stale. Check it again against the latest sections.'
          : messageFor(error),
      })
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  return (
    <section
      className={`docs-chat${entries.length ? ' has-messages' : ''}`}
      aria-label="Docs chat"
    >
      {!entries.length && (
        <header className="chat-intro">
          <p className="eyebrow">Docs · Chat</p>
          <h1>What would you like to remember?</h1>
          <p className="muted">
            Ask about your notes, or write a statement. DeepSeek chooses where
            it belongs and checks for conflicting sections; your exact message
            is saved only after approval.
          </p>
        </header>
      )}
      <div
        className="chat-log"
        ref={logRef}
        role="log"
        aria-label="Conversation"
        aria-live="polite"
      >
        {!entries.length && (
          <p className="chat-empty">
            Try “henry goes to harvard” or “Where does Henry study?”
          </p>
        )}
        {entries.map((entry) => (
          <div className="chat-turn" key={entry.id}>
            <div className="chat-bubble chat-user">
              <p>{entry.userMessage}</p>
            </div>
            <div className="chat-bubble chat-assistant">
              {entry.status === 'thinking' && (
                <p role="status">Checking notes…</p>
              )}
              {entry.result?.kind === 'query' && (
                <p className="chat-answer">{entry.result.answer}</p>
              )}
              {entry.result?.kind === 'clarify' && (
                <>
                  <p>{entry.result.question}</p>
                  <div
                    className="choice-list"
                    aria-label="Clarification choices"
                  >
                    {entry.result.choices.map((choice) => (
                      <button
                        key={choice.entityId}
                        disabled={busy}
                        onClick={() =>
                          send(
                            choice.name,
                            choice.entityId,
                            entry.result?.kind === 'clarify'
                              ? entry.result.conversationId
                              : undefined,
                          )
                        }
                      >
                        {choice.name} · {choice.entityType}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {entry.result?.kind === 'proposal' && (
                <ActionPreview
                  result={entry.result}
                  status={entry.status as ProposalStatus}
                  entityName={entry.result.targetName}
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
                <button disabled={busy} onClick={() => void interpret(entry)}>
                  Retry this request
                </button>
              )}
              {entry.status === 'applied' && entry.approved && (
                <p className="applied-summary" role="status">
                  Section saved to{' '}
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
                    {entry.approved.name}
                  </a>
                  .
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
      <form
        className="chat-composer"
        onSubmit={(event) => {
          event.preventDefault()
          send()
        }}
      >
        <textarea
          id="docs-message"
          aria-label="Message"
          rows={3}
          maxLength={4000}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault()
              send()
            }
          }}
          placeholder="Ask something or add an exact note…"
        />
        <div className="composer-footer">
          <span className="muted">Your wording is preserved exactly.</span>
          <button className="primary" disabled={busy || !draft.trim()}>
            {busy ? 'Working…' : 'Send'}
          </button>
        </div>
        {conversationId && (
          <small className="muted">
            Your next message will answer the clarification above.
          </small>
        )}
      </form>
    </section>
  )
}
