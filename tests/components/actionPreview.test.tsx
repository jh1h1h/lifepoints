import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ActionPreview } from '../../src/components/ActionPreview'

const base = {
  kind: 'proposal' as const,
  action: 'add' as const,
  proposalId: 'proposal123',
  requestId: 'request123',
  expiresAt: new Date().toISOString(),
  targetName: 'Henry',
  proposal: {
    schemaVersion: 2 as const,
    action: 'add' as const,
    entityType: 'friend' as const,
    entityId: 'friend123',
    expectedRevision: 1,
    text: 'henry goes to harvard',
    conflicts: [],
  },
  preview: { before: '', after: 'henry goes to harvard' },
  conflicts: [],
}

describe('section proposal', () => {
  it('shows exact text and approval', () => {
    const approve = vi.fn()
    render(
      <ActionPreview
        result={base}
        status="pending"
        entityName="Henry"
        onApprove={approve}
        onReject={vi.fn()}
        onRetry={vi.fn()}
        onRegenerate={vi.fn()}
      />,
    )
    expect(screen.getByText('henry goes to harvard')).toBeVisible()
    expect(screen.getByText('No conflicting sections found.')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Approve section' }))
    expect(approve).toHaveBeenCalledOnce()
  })
  it('shows possible conflicts', () => {
    render(
      <ActionPreview
        result={{
          ...base,
          conflicts: [
            {
              id: 'section123',
              entityId: 'friend123',
              entityType: 'friend',
              entityName: 'Henry',
              content: 'Henry goes to Yale',
              pinned: false,
              unread: false,
              revision: 1,
              createdAt: '2026-01-01',
              updatedAt: '2026-01-01',
            },
          ],
        }}
        status="pending"
        entityName="Henry"
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onRetry={vi.fn()}
        onRegenerate={vi.fn()}
      />,
    )
    expect(screen.getByText('Possible conflict')).toBeVisible()
    expect(screen.getByText('Henry goes to Yale')).toBeVisible()
  })
})
