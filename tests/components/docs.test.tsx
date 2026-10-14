import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Docs } from '../../src/pages/Docs'
import {
  docsService,
  type DocEntity,
  type DocSection,
} from '../../src/services/docsService'

vi.mock('../../src/services/docsService', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../../src/services/docsService')>()
  return {
    ...original,
    docsService: {
      list: vi.fn(),
      get: vi.fn(),
      sections: vi.fn(),
      recentProjects: vi.fn(),
      summary: vi.fn(),
      mutate: vi.fn(),
      interpretMessage: vi.fn(),
      approveAction: vi.fn(),
      rejectAction: vi.fn(),
    },
  }
})

const entity: DocEntity = {
  id: 'friend123',
  entityType: 'friend',
  name: 'Henry',
  normalizedName: 'henry',
  aliases: [],
  revision: 1,
  deleted: false,
  unreadCount: 1,
  sectionCount: 1,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-02',
  latestSectionAt: '2026-01-02',
}
const section: DocSection = {
  id: 'section123',
  entityId: entity.id,
  entityType: 'friend',
  entityName: 'Henry',
  content: 'henry goes to harvard',
  pinned: false,
  unread: true,
  revision: 1,
  createdAt: '2026-01-02',
  updatedAt: '2026-01-02',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(docsService.list).mockResolvedValue([entity])
  vi.mocked(docsService.get).mockResolvedValue(entity)
  vi.mocked(docsService.sections).mockResolvedValue([section])
  vi.mocked(docsService.recentProjects).mockResolvedValue([])
  vi.mocked(docsService.summary).mockResolvedValue({ unreadFriends: 1 })
  vi.mocked(docsService.mutate).mockResolvedValue({
    id: entity.id,
    sectionId: section.id,
    revision: 2,
    changed: true,
  })
  vi.mocked(docsService.approveAction).mockResolvedValue({
    entityId: entity.id,
    sectionId: section.id,
    entityType: 'friend',
    name: 'Henry',
    revision: 2,
    status: 'approved',
  })
})

describe('section-based Docs', () => {
  it('shows the friend unread badge and unread-first friend row', async () => {
    render(<Docs path="/docs/friends" uid="test" />)
    expect(await screen.findByRole('link', { name: 'Henry' })).toBeVisible()
    expect(screen.getByLabelText('1 unread friend sections')).toBeVisible()
  })
  it('marks a friend section read explicitly', async () => {
    render(<Docs path="/docs/friends/friend123" uid="test" />)
    const unread = await screen.findByRole('checkbox', { name: 'Unread' })
    expect(unread).toBeChecked()
    fireEvent.click(unread)
    await waitFor(() =>
      expect(docsService.mutate).toHaveBeenCalledWith(
        'set_section_unread',
        expect.objectContaining({ sectionId: 'section123', unread: false }),
      ),
    )
  })
  it('edits the same section in place', async () => {
    render(<Docs path="/docs/friends/friend123" uid="test" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByDisplayValue('henry goes to harvard'), {
      target: { value: 'henry studies at harvard' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(docsService.mutate).toHaveBeenCalledWith(
        'update_section',
        expect.objectContaining({ content: 'henry studies at harvard' }),
      ),
    )
  })
  it('saves the exact chat statement after approval', async () => {
    vi.mocked(docsService.interpretMessage).mockResolvedValue({
      kind: 'proposal',
      action: 'add',
      proposalId: 'proposal123',
      requestId: 'request123',
      expiresAt: '2026-12-01',
      targetName: 'Henry',
      proposal: {
        schemaVersion: 2,
        action: 'add',
        entityType: 'friend',
        entityId: entity.id,
        expectedRevision: 1,
        text: 'henry goes to harvard',
        conflicts: [],
      },
      preview: { before: '', after: 'henry goes to harvard' },
      conflicts: [],
    })
    render(<Docs path="/docs" uid="test" />)
    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: 'henry goes to harvard' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect((await screen.findAllByText('henry goes to harvard')).length).toBe(2)
    fireEvent.click(screen.getByRole('button', { name: 'Approve section' }))
    await waitFor(() => expect(docsService.approveAction).toHaveBeenCalled())
  })
})
