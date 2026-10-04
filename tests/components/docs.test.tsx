import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Docs } from '../../src/pages/Docs'
import {
  docsService,
  type DocEdit,
  type DocEntity,
} from '../../src/services/docsService'
import { href } from '../../src/utils/routes'

vi.mock('../../src/services/docsService', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../../src/services/docsService')>()
  return {
    ...original,
    docsService: {
      list: vi.fn(),
      get: vi.fn(),
      history: vi.fn(),
      mutate: vi.fn(),
      interpretMessage: vi.fn(),
      approveAction: vi.fn(),
      rejectAction: vi.fn(),
    },
  }
})

const entity: DocEntity = {
  id: 'doc123456',
  entityType: 'friend',
  name: 'Kevin',
  normalizedName: 'kevin',
  aliases: ['Kev'],
  content: 'Employment:\nApple\n',
  revision: 1,
  deleted: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}
const edit: DocEdit = {
  id: 'edit123456',
  eventId: 'edit123456',
  operation: 'update_content',
  baseRevision: 1,
  newRevision: 2,
  patch: JSON.stringify({
    format: 'line-delta-v1',
    changes: [{ start: 1, remove: ['Apple\n'], add: ['Microsoft\n'] }],
  }),
  beforeHash: 'a',
  afterHash: 'b',
  source: 'manual',
  changeType: 'correction',
  description: '',
  timestamp: new Date().toISOString(),
  beforeName: 'Kevin',
  afterName: 'Kevin',
  beforeAliases: ['Kev'],
  afterAliases: ['Kev'],
}

beforeEach(() => {
  vi.mocked(docsService.interpretMessage).mockClear()
  vi.mocked(docsService.approveAction).mockClear()
  vi.mocked(docsService.rejectAction).mockClear()
  vi.mocked(docsService.list).mockResolvedValue([entity])
  vi.mocked(docsService.get).mockResolvedValue(entity)
  vi.mocked(docsService.history).mockResolvedValue([edit])
  vi.mocked(docsService.mutate).mockResolvedValue({
    id: entity.id,
    revision: 2,
    changed: true,
  })
  vi.mocked(docsService.interpretMessage).mockResolvedValue({
    kind: 'query',
    action: 'query',
    answer: 'Apple',
    requestId: 'request123',
  })
  vi.mocked(docsService.approveAction).mockResolvedValue({
    entityId: entity.id,
    revision: 2,
    status: 'approved',
  })
  vi.mocked(docsService.rejectAction).mockResolvedValue({ status: 'rejected' })
  window.history.replaceState({}, '', href('/docs'))
})

describe('Docs interface', () => {
  it('reuses the same interpretation ID after a failed attempt', async () => {
    vi.mocked(docsService.interpretMessage).mockRejectedValueOnce(
      new Error('timeout'),
    )
    render(<Docs path="/docs" />)
    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: 'Where does Kevin work?' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('timeout')
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await screen.findByText('Apple')
    const calls = vi.mocked(docsService.interpretMessage).mock.calls
    expect(calls[0][3]).toBe(calls[1][3])
  })
  it('offers a read-only query and an explicit approval for proposed changes', async () => {
    render(<Docs path="/docs" />)
    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: 'Where does Kevin work?' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByText('Apple')).toBeVisible()
    expect(docsService.interpretMessage).toHaveBeenCalledWith(
      'Where does Kevin work?',
      false,
      undefined,
      expect.any(String),
    )
    expect(docsService.approveAction).not.toHaveBeenCalled()
    vi.mocked(docsService.interpretMessage).mockResolvedValueOnce({
      kind: 'proposal',
      action: 'modify',
      proposalId: 'proposal123',
      requestId: 'request124',
      expiresAt: new Date().toISOString(),
      proposal: { newText: 'Google', changeType: 'new_information' },
      preview: { before: 'Microsoft', after: 'Google' },
    })
    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: 'Kevin now works at Google' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(
      await screen.findByRole('heading', { name: 'Review modify suggestion' }),
    ).toBeVisible()
    expect(docsService.approveAction).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() =>
      expect(docsService.approveAction).toHaveBeenCalledWith(
        'proposal123',
        'Google',
        expect.any(String),
      ),
    )
  })
  it('renders overview and both collections', async () => {
    const { rerender } = render(<Docs path="/docs" />)
    expect(screen.getByRole('link', { name: 'Friends' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Projects' })).toBeVisible()
    rerender(<Docs path="/docs/friends" />)
    expect(await screen.findByRole('link', { name: 'Kevin' })).toBeVisible()
    fireEvent.change(screen.getByLabelText('Search friends and aliases'), {
      target: { value: 'Kev' },
    })
    expect(screen.getByRole('link', { name: 'Kevin' })).toBeVisible()
    rerender(<Docs path="/docs/projects" />)
    expect(screen.getByRole('heading', { name: 'Projects' })).toBeVisible()
  })
  it('creates a consolidated document', async () => {
    render(<Docs path="/docs/projects" />)
    fireEvent.click(screen.getByRole('button', { name: 'New project' }))
    const form = screen.getByRole('form', { name: 'New project' })
    fireEvent.change(form.querySelector('input')!, {
      target: { value: 'Friendfolio' },
    })
    fireEvent.change(form.querySelector('textarea')!, {
      target: { value: 'Goals:\nBuild the app\nNext Steps:\nTest it' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() =>
      expect(docsService.mutate).toHaveBeenCalledWith(
        'create',
        expect.objectContaining({
          entityType: 'project',
          content: 'Goals:\nBuild the app\nNext Steps:\nTest it',
        }),
        expect.any(String),
      ),
    )
  })
  it('edits content, shows manual history, renames and soft-deletes', async () => {
    render(<Docs path="/docs/friends/doc123456" />)
    expect(await screen.findByText(/Employment:/)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Edit document' }))
    fireEvent.change(screen.getByLabelText('Document'), {
      target: { value: 'Employment:\nMicrosoft\n' },
    })
    fireEvent.change(screen.getByLabelText('Change type'), {
      target: { value: 'correction' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(docsService.mutate).toHaveBeenCalledWith(
        'update_content',
        expect.objectContaining({
          expectedRevision: 1,
          changeType: 'correction',
          content: 'Employment:\nMicrosoft\n',
        }),
        expect.any(String),
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: 'View edit history' }))
    expect(await screen.findByText('+ Microsoft')).toBeVisible()
    expect(screen.getByText('− Apple')).toBeVisible()
    expect(screen.getByText(/manual · correction/)).toBeVisible()
  })
})
