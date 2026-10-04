import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  ActionPreview,
  type ProposalResult,
} from '../../src/components/ActionPreview'

const common = {
  schemaVersion: 1 as const,
  entityType: 'friend' as const,
  changeType: 'new_information' as const,
  reason: 'From your message.',
}
function result(
  proposal: ProposalResult['proposal'],
  before = '',
  after = '',
): ProposalResult {
  return {
    kind: 'proposal',
    action: proposal.action,
    proposalId: 'proposal123',
    requestId: 'request123',
    targetName: 'Kevin',
    expiresAt: '',
    proposal,
    preview: { before, after },
  }
}
function show(proposal: ProposalResult['proposal'], before = '', after = '') {
  const onApprove = vi.fn()
  const onReject = vi.fn()
  const onEdit = vi.fn()
  render(
    <ActionPreview
      result={result(proposal, before, after)}
      status="pending"
      replacement={
        proposal.action === 'create'
          ? proposal.content
          : proposal.action === 'add' || proposal.action === 'modify'
            ? proposal.newText
            : ''
      }
      entityName="Kevin"
      onEdit={onEdit}
      onApprove={onApprove}
      onReject={onReject}
      onRegenerate={vi.fn()}
      onRetry={vi.fn()}
    />,
  )
  return { onApprove, onReject, onEdit }
}

describe('action previews', () => {
  it('shows creation and lets the user edit the proposed name and initial document', () => {
    const callbacks = show({
      ...common,
      action: 'create',
      name: 'Kevin',
      content: 'Employment:\nMicrosoft',
    })
    expect(screen.getByText(/Employment:/).textContent).toBe(
      'Employment:\nMicrosoft',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Edit proposal' }))
    fireEvent.change(screen.getByLabelText('Entity name'), {
      target: { value: 'Kevin Tan' },
    })
    fireEvent.change(screen.getByLabelText('Initial content'), {
      target: { value: 'Hobbies:\nHiking' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save edit' }))
    expect(callbacks.onEdit).toHaveBeenCalledWith(
      'Hobbies:\nHiking',
      'Kevin Tan',
    )
  })
  it('shows an insertion and precise before-after replacement with non-color labels', () => {
    const { unmount } = render(
      <ActionPreview
        result={result(
          {
            ...common,
            action: 'add',
            entityId: 'doc123456',
            expectedRevision: 1,
            scope: 'content',
            newText: 'Hiking',
            afterText: 'Hobbies:',
          },
          'Employment:\nApple\nHobbies:',
          'Employment:\nApple\nHobbies:\nHiking',
        )}
        status="pending"
        replacement="Hiking"
        entityName="Kevin"
        onEdit={vi.fn()}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onRegenerate={vi.fn()}
        onRetry={vi.fn()}
      />,
    )
    expect(screen.getByText('Hiking', { exact: false })).toBeVisible()
    unmount()
    show(
      {
        ...common,
        action: 'modify',
        entityId: 'doc123456',
        expectedRevision: 2,
        scope: 'content',
        oldText: 'Microsoft',
        newText: 'Apple',
      },
      'Employment:\nMicrosoft\nHobbies:\nHiking',
      'Employment:\nApple\nHobbies:\nHiking',
    )
    expect(screen.getByText(/Removed text:/)).toBeVisible()
    expect(screen.getByText(/Added text:/)).toBeVisible()
    expect(screen.getByText(/Hobbies:/)).toBeVisible()
  })
  it('shows exact selected deletion and requires a separate whole-entity confirmation', () => {
    const { unmount } = render(
      <ActionPreview
        result={result(
          {
            ...common,
            action: 'delete',
            entityId: 'doc123456',
            expectedRevision: 2,
            scope: 'content',
            oldText: 'Hiking',
          },
          'Hobbies:\nHiking',
          'Hobbies:\n',
        )}
        status="pending"
        replacement=""
        entityName="Kevin"
        onEdit={vi.fn()}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onRegenerate={vi.fn()}
        onRetry={vi.fn()}
      />,
    )
    expect(screen.getByText('Remove only this text')).toBeVisible()
    expect(screen.getByText(/− Hiking/)).toBeVisible()
    unmount()
    const callbacks = show({
      ...common,
      action: 'delete',
      entityId: 'doc123456',
      expectedRevision: 2,
      scope: 'entity',
      oldText: null,
    })
    const approve = screen.getByRole('button', { name: 'Approve deletion' })
    expect(approve).toBeDisabled()
    fireEvent.click(
      screen.getByRole('checkbox', { name: /deletes the entire document/ }),
    )
    expect(approve).toBeEnabled()
    fireEvent.click(approve)
    expect(callbacks.onApprove).toHaveBeenCalledOnce()
  })
  it('rejects without invoking approval', () => {
    const callbacks = show({
      ...common,
      action: 'create',
      name: 'Kevin',
      content: '',
    })
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    expect(callbacks.onReject).toHaveBeenCalledOnce()
    expect(callbacks.onApprove).not.toHaveBeenCalled()
  })
})
