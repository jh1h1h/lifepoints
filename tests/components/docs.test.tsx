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
  vi.mocked(docsService.interpretMessage).mockReset()
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
    references: [],
  })
  vi.mocked(docsService.approveAction).mockResolvedValue({
    entityId: entity.id,
    entityType: 'friend',
    name: 'Kevin',
    revision: 2,
    status: 'approved',
  })
  vi.mocked(docsService.rejectAction).mockResolvedValue({ status: 'rejected' })
  window.history.replaceState({}, '', href('/docs'))
})

describe('Docs interface', () => {
  it('sends the selected history mode and retains the choice during this chat session', async () => {
    render(<Docs path="/docs" uid="test-user" />)
    const checkbox = screen.getByRole('checkbox', {
      name: 'Include full history',
    })
    expect(checkbox).not.toBeChecked()
    fireEvent.click(checkbox)
    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: 'Where does Kevin work?' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await screen.findByText('Apple')
    expect(docsService.interpretMessage).toHaveBeenCalledWith(
      'Where does Kevin work?',
      true,
      undefined,
      expect.any(String),
      undefined,
    )
    expect(screen.getByText('Full history included')).toBeVisible()
    fireEvent.click(checkbox)
    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: 'What is next?' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() =>
      expect(docsService.interpretMessage).toHaveBeenLastCalledWith(
        'What is next?',
        false,
        undefined,
        expect.any(String),
        undefined,
      ),
    )
  })

  it('renders clarification choices and sends a selected candidate with conversation context', async () => {
    vi.mocked(docsService.interpretMessage).mockResolvedValueOnce({
      kind: 'clarify',
      action: 'clarify',
      question: 'Which Kevin?',
      conversationId: 'conversation123',
      choices: [{ entityId: entity.id, entityType: 'friend', name: 'Kevin' }],
    })
    render(<Docs path="/docs" uid="test-user" />)
    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: 'Kevin changed jobs' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByText('Which Kevin?')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: /Kevin · friend/ }))
    await waitFor(() =>
      expect(docsService.interpretMessage).toHaveBeenLastCalledWith(
        'Kevin',
        false,
        'conversation123',
        expect.any(String),
        entity.id,
      ),
    )
    expect(docsService.approveAction).not.toHaveBeenCalled()
  })

  it('reuses the same interpretation ID after a failed attempt', async () => {
    vi.mocked(docsService.interpretMessage).mockRejectedValueOnce(
      new Error('timeout'),
    )
    render(<Docs path="/docs" uid="test-user" />)
    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: 'Where does Kevin work?' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('timed out')
    fireEvent.click(screen.getByRole('button', { name: 'Retry this request' }))
    await screen.findByText('Apple')
    const calls = vi.mocked(docsService.interpretMessage).mock.calls
    expect(calls[0][3]).toBe(calls[1][3])
  })
  it('keeps the draft and explains backend failures without claiming a write', async () => {
    vi.mocked(docsService.interpretMessage).mockRejectedValueOnce(
      new Error('internal [0]'),
    )
    render(<Docs path="/docs" uid="test-user" />)
    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: 'Kevin works at Apple' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'temporarily unavailable',
    )
    expect(screen.getByLabelText('Message')).toHaveValue('Kevin works at Apple')
    expect(docsService.approveAction).not.toHaveBeenCalled()
  })
  it('shows the precise validation reason and reveals raw model output on request', async () => {
    const failure = Object.assign(
      new Error('Original text is missing or ambiguous'),
      {
        code: 'functions/failed-precondition',
        details: {
          reason: 'Original text is missing or ambiguous',
          rawResponse: '<script>alert("unsafe")</script>',
          requestId: 'request-diagnostic',
          modelResponseId: 'deepseek-diagnostic',
        },
      },
    )
    vi.mocked(docsService.interpretMessage).mockRejectedValueOnce(failure)
    render(<Docs path="/docs" uid="test-user" />)
    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: 'Kevin changed jobs' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Original text is missing or ambiguous',
    )
    expect(
      screen.queryByText('<script>alert("unsafe")</script>'),
    ).not.toBeVisible()
    fireEvent.click(screen.getByText('Show error details'))
    expect(screen.getByText('<script>alert("unsafe")</script>')).toBeVisible()
    expect(screen.getByText('request-diagnostic')).toBeVisible()
    expect(docsService.approveAction).not.toHaveBeenCalled()
    expect(sessionStorage.getItem('lifepoints-docs-chat:test-user')).toBeNull()
  })
  it('keeps the conversation in memory only and hides the intro once messages appear', async () => {
    const view = render(<Docs path="/docs" uid="test-user" />)
    expect(
      screen.getByRole('heading', { name: 'What would you like to remember?' }),
    ).toBeVisible()
    expect(screen.getByLabelText('Message')).toBeVisible()
    expect(screen.queryByText('Message')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: 'Where does Kevin work?' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByText('Apple')).toBeVisible()
    expect(
      screen.queryByRole('heading', {
        name: 'What would you like to remember?',
      }),
    ).not.toBeInTheDocument()
    expect(sessionStorage.getItem('lifepoints-docs-chat:test-user')).toBeNull()
    view.unmount()
    render(<Docs path="/docs" uid="test-user" />)
    expect(
      screen.getByRole('heading', { name: 'What would you like to remember?' }),
    ).toBeVisible()
    expect(screen.queryByText('Apple')).not.toBeInTheDocument()
  })
  it('offers a read-only query and an explicit approval for proposed changes', async () => {
    render(<Docs path="/docs" uid="test-user" />)
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
      undefined,
    )
    expect(docsService.approveAction).not.toHaveBeenCalled()
    vi.mocked(docsService.interpretMessage).mockResolvedValueOnce({
      kind: 'proposal',
      action: 'modify',
      proposalId: 'proposal123',
      requestId: 'request124',
      expiresAt: new Date().toISOString(),
      targetName: 'Kevin',
      proposal: {
        schemaVersion: 1,
        action: 'modify',
        entityType: 'friend',
        entityId: entity.id,
        expectedRevision: 1,
        scope: 'content',
        oldText: 'Microsoft',
        newText: 'Google',
        changeType: 'new_information',
        reason: 'Changed jobs.',
      },
      preview: { before: 'Microsoft', after: 'Google' },
    })
    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: 'Kevin now works at Google' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(
      await screen.findByRole('heading', { name: 'Friend: Kevin' }),
    ).toBeVisible()
    expect(docsService.approveAction).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Approve change' }))
    await waitFor(() =>
      expect(docsService.approveAction).toHaveBeenCalledWith(
        'proposal123',
        'Google',
        expect.any(String),
        undefined,
      ),
    )
    expect(await screen.findByText(/Saved Kevin, revision 2/)).toBeVisible()
    expect(screen.queryByText('Applied')).not.toBeInTheDocument()
    expect(document.querySelector('.chat-meta')).toBeNull()
  })
  it('does not submit duplicate approval calls on repeated clicks', async () => {
    vi.mocked(docsService.interpretMessage).mockResolvedValueOnce({
      kind: 'proposal',
      action: 'create',
      proposalId: 'proposal-double',
      requestId: 'request-double',
      expiresAt: new Date().toISOString(),
      targetName: 'Kevin',
      proposal: {
        schemaVersion: 1,
        action: 'create',
        entityType: 'friend',
        name: 'Kevin',
        content: 'Hiking',
        changeType: 'new_information',
        reason: '',
      },
      preview: { before: '', after: 'Hiking' },
    })
    vi.mocked(docsService.approveAction).mockImplementationOnce(
      () => new Promise(() => {}),
    )
    render(<Docs path="/docs" uid="test-user" />)
    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: 'Create Kevin' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    const approve = await screen.findByRole('button', {
      name: 'Approve change',
    })
    fireEvent.click(approve)
    fireEvent.click(approve)
    expect(docsService.approveAction).toHaveBeenCalledOnce()
    expect(screen.queryByText(/Saved Kevin/)).not.toBeInTheDocument()
  })
  it('submits an edited creation name and content for server validation', async () => {
    vi.mocked(docsService.interpretMessage).mockResolvedValueOnce({
      kind: 'proposal',
      action: 'create',
      proposalId: 'proposal-edit',
      requestId: 'request-edit',
      expiresAt: new Date().toISOString(),
      targetName: 'Kevin',
      proposal: {
        schemaVersion: 1,
        action: 'create',
        entityType: 'friend',
        name: 'Kevin',
        content: 'Hiking',
        changeType: 'new_information',
        reason: '',
      },
      preview: { before: '', after: 'Hiking' },
    })
    render(<Docs path="/docs" uid="test-user" />)
    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: 'Create Kevin' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Edit proposal' }),
    )
    fireEvent.change(screen.getByLabelText('Entity name'), {
      target: { value: 'Kevin Tan' },
    })
    fireEvent.change(screen.getByLabelText('Initial content'), {
      target: { value: 'Hiking and photography' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save edit' }))
    fireEvent.click(screen.getByRole('button', { name: 'Approve change' }))
    await waitFor(() =>
      expect(docsService.approveAction).toHaveBeenCalledWith(
        'proposal-edit',
        'Hiking and photography',
        expect.any(String),
        'Kevin Tan',
      ),
    )
  })
  it('renders overview and both collections', async () => {
    const { rerender } = render(<Docs path="/docs" uid="test-user" />)
    expect(screen.getByRole('link', { name: 'Friends' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Projects' })).toBeVisible()
    rerender(<Docs path="/docs/friends" uid="test-user" />)
    expect(await screen.findByRole('link', { name: 'Kevin' })).toBeVisible()
    fireEvent.change(screen.getByLabelText('Search friends and aliases'), {
      target: { value: 'Kev' },
    })
    expect(screen.getByRole('link', { name: 'Kevin' })).toBeVisible()
    rerender(<Docs path="/docs/projects" uid="test-user" />)
    expect(screen.getByRole('heading', { name: 'Projects' })).toBeVisible()
  })
  it('creates a consolidated document', async () => {
    render(<Docs path="/docs/projects" uid="test-user" />)
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
    render(<Docs path="/docs/friends/doc123456" uid="test-user" />)
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
    expect(screen.getByText(/manual · correction/i)).toBeVisible()
  })
})
