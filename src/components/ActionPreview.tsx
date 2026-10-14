import type { AiResult } from '../services/docsService'

type Proposal = Extract<AiResult, { kind: 'proposal' }>
export type ProposalStatus =
  'pending' | 'applying' | 'applied' | 'rejected' | 'stale' | 'failed'

export function ActionPreview({
  result,
  status,
  entityName,
  onApprove,
  onReject,
  onRetry,
  onRegenerate,
  failedDecision,
}: {
  result: Proposal
  status: ProposalStatus
  entityName: string
  onApprove: () => void
  onReject: () => void
  onRetry: () => void
  onRegenerate: () => void
  failedDecision?: 'approve' | 'reject'
}) {
  return (
    <section className="action-preview" aria-label="Suggested note">
      <p>
        <strong>{result.action === 'create' ? 'Create' : 'Add to'}:</strong>{' '}
        {entityName}
      </p>
      <div className="proposal-after">
        <strong>New section</strong>
        <pre>{result.proposal.text}</pre>
      </div>
      {result.conflicts.length ? (
        <div className="conflict-warning" role="alert">
          <strong>
            Possible conflict{result.conflicts.length === 1 ? '' : 's'}
          </strong>
          <p>Review these existing sections before keeping both:</p>
          {result.conflicts.map((section) => (
            <blockquote key={section.id}>{section.content}</blockquote>
          ))}
        </div>
      ) : (
        <p className="muted">No conflicting sections found.</p>
      )}
      {status === 'pending' && (
        <div className="docs-actions">
          <button className="primary" onClick={onApprove}>
            Approve section
          </button>
          <button onClick={onReject}>Reject</button>
        </div>
      )}
      {status === 'applying' && <p role="status">Saving section…</p>}
      {status === 'rejected' && (
        <p role="status">Rejected. Nothing was saved.</p>
      )}
      {status === 'stale' && (
        <button onClick={onRegenerate}>Check again with latest sections</button>
      )}
      {status === 'failed' && (
        <div className="docs-actions">
          <button onClick={onRetry}>
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
