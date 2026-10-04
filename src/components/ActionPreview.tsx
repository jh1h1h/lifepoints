import { useState } from 'react'
import type { AiResult } from '../services/docsService'
import { docPath } from '../utils/docs'
import { href, navigate } from '../utils/routes'

export type ProposalResult = Extract<AiResult, { kind: 'proposal' }>
export type ProposalStatus =
  'pending' | 'applying' | 'applied' | 'rejected' | 'failed' | 'stale'

interface Props {
  result: ProposalResult
  status: ProposalStatus
  replacement: string
  entityName: string
  onEdit: (replacement: string, entityName: string) => void
  onApprove: () => void
  onReject: () => void
  onRegenerate: () => void
  onRetry: () => void
  failedDecision?: 'approve' | 'reject'
}

function contextAround(content: string, span: string) {
  const index = content.indexOf(span)
  if (index < 0) return { before: '', after: '' }
  const prefix = content.slice(0, index)
  const suffix = content.slice(index + span.length)
  return {
    before: `${prefix.length > 90 ? '…' : ''}${prefix.slice(-90)}`,
    after: `${suffix.slice(0, 90)}${suffix.length > 90 ? '…' : ''}`,
  }
}

export function ActionPreview({
  result,
  status,
  replacement,
  entityName,
  onEdit,
  onApprove,
  onReject,
  onRegenerate,
  onRetry,
  failedDecision,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [draftText, setDraftText] = useState(replacement)
  const [draftName, setDraftName] = useState(entityName)
  const [confirmEntityDelete, setConfirmEntityDelete] = useState(false)
  const action = result.proposal
  const editable =
    action.action === 'create' ||
    action.action === 'add' ||
    action.action === 'modify'
  const entityDeletion = action.action === 'delete' && action.scope === 'entity'
  const targetPath =
    action.action === 'create'
      ? null
      : docPath(action.entityType, action.entityId)
  const displayName =
    action.action === 'create' ? entityName : result.targetName
  const scope =
    action.action === 'modify' ||
    (action.action === 'delete' && action.scope === 'content')
      ? contextAround(result.preview.before, action.oldText ?? '')
      : null
  const anchorContext =
    action.action === 'add' && action.afterText
      ? contextAround(result.preview.before, action.afterText)
      : null

  function startEdit() {
    setDraftText(replacement)
    setDraftName(entityName)
    setEditing(true)
  }

  function saveEdit(event: React.FormEvent) {
    event.preventDefault()
    onEdit(draftText, draftName)
    setEditing(false)
  }

  return (
    <section
      className={`action-preview action-${action.action}`}
      aria-label={`${action.action} proposal for ${displayName}`}
    >
      <div className="preview-heading">
        <div>
          <p className="eyebrow">Suggested {action.action}</p>
          <h3>
            {action.entityType === 'friend' ? 'Friend' : 'Project'}:{' '}
            {displayName}
          </h3>
          {action.action !== 'create' && (
            <small className="muted">
              Document ID: {action.entityId.slice(0, 8)}
            </small>
          )}
        </div>
        <span className={`proposal-state state-${status.replace(' ', '-')}`}>
          {status === 'pending' ? 'Pending approval' : status}
        </span>
      </div>
      {targetPath && (
        <a
          href={href(targetPath)}
          onClick={(event) => {
            event.preventDefault()
            navigate(targetPath)
          }}
        >
          Open document
        </a>
      )}
      {action.reason && <p className="muted">{action.reason}</p>}
      {status === 'pending' && (
        <p className="muted">
          Is this what you meant? Approve, edit the proposed text where
          available, or reject and explain the correction in chat. Nothing is
          saved until you approve.
        </p>
      )}
      {action.action === 'create' && (
        <div className="preview-change">
          <strong>Initial document</strong>
          <pre>{replacement || '(empty document)'}</pre>
        </div>
      )}
      {action.action === 'add' && (
        <div className="preview-change">
          <strong>
            {action.afterText ? 'Insert after' : 'Append to document'}
          </strong>
          {action.afterText && (
            <pre className="preview-context">
              {anchorContext?.before}
              <mark>{action.afterText}</mark>
              {anchorContext?.after}
            </pre>
          )}
          <pre>
            <ins>
              <span className="sr-only">Added text: </span>+ {replacement}
            </ins>
          </pre>
        </div>
      )}
      {action.action === 'modify' && (
        <div className="preview-change">
          <strong>Replace this exact text</strong>
          <pre className="preview-context">
            {scope?.before}
            <del>
              <span className="sr-only">Removed text: </span>− {action.oldText}
            </del>
            {scope?.after}
          </pre>
          <strong>With</strong>
          <pre>
            <ins>
              <span className="sr-only">Added text: </span>+{' '}
              {replacement || '(empty)'}
            </ins>
          </pre>
        </div>
      )}
      {action.action === 'delete' && action.scope === 'content' && (
        <div className="preview-change">
          <strong>Remove only this text</strong>
          <pre className="preview-context">
            {scope?.before}
            <del>
              <span className="sr-only">Removed text: </span>− {action.oldText}
            </del>
            {scope?.after}
          </pre>
        </div>
      )}
      {entityDeletion && (
        <div className="preview-change entity-delete-warning">
          <strong>Delete the entire {action.entityType} document</strong>
          <p>
            The document will be hidden; its edit history will remain available
            at its direct link.
          </p>
          {(status === 'pending' || status === 'failed') && (
            <label className="compact-check">
              <input
                type="checkbox"
                checked={confirmEntityDelete}
                onChange={(event) =>
                  setConfirmEntityDelete(event.target.checked)
                }
              />
              I understand this deletes the entire document
            </label>
          )}
        </div>
      )}
      {status === 'pending' && editing && (
        <form
          className="preview-editor"
          onSubmit={saveEdit}
          aria-label="Edit proposed change"
        >
          {action.action === 'create' && (
            <label>
              Entity name
              <input
                required
                maxLength={120}
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
              />
            </label>
          )}
          <label>
            {action.action === 'create'
              ? 'Initial content'
              : 'Replacement text'}
            <textarea
              rows={5}
              maxLength={10000}
              required={action.action === 'add'}
              value={draftText}
              onChange={(event) => setDraftText(event.target.value)}
            />
          </label>
          <div className="docs-actions">
            <button className="primary">Save edit</button>
            <button type="button" onClick={() => setEditing(false)}>
              Cancel edit
            </button>
          </div>
        </form>
      )}
      {status === 'pending' && !editing && (
        <div className="docs-actions">
          <button
            className="primary"
            disabled={entityDeletion && !confirmEntityDelete}
            onClick={onApprove}
          >
            Approve {entityDeletion ? 'deletion' : 'change'}
          </button>
          <button onClick={onReject}>Reject</button>
          {editable && <button onClick={startEdit}>Edit proposal</button>}
        </div>
      )}
      {status === 'applying' && <p role="status">Applying approved change…</p>}
      {status === 'rejected' && (
        <p role="status">Rejected. No document was changed.</p>
      )}
      {status === 'stale' && (
        <button onClick={onRegenerate}>Regenerate with latest document</button>
      )}
      {status === 'failed' && (
        <div className="docs-actions">
          <button
            disabled={entityDeletion && !confirmEntityDelete}
            onClick={onRetry}
          >
            Retry {failedDecision === 'reject' ? 'rejection' : 'approval'}
          </button>
          {failedDecision !== 'reject' && (
            <button onClick={onReject}>Reject</button>
          )}
        </div>
      )}
    </section>
  )
}
