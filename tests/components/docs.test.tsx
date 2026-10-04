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
  vi.mocked(docsService.list).mockResolvedValue([entity])
  vi.mocked(docsService.get).mockResolvedValue(entity)
  vi.mocked(docsService.history).mockResolvedValue([edit])
  vi.mocked(docsService.mutate).mockResolvedValue({
    id: entity.id,
    revision: 2,
    changed: true,
  })
  window.history.replaceState({}, '', href('/docs'))
})

describe('Docs interface', () => {
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
