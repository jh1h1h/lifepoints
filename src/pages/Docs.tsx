import { useCallback, useEffect, useRef, useState } from 'react'
import {
  docsService,
  readableDocError,
  type ChangeType,
  type DocEdit,
  type DocEntity,
  type EntityType,
} from '../services/docsService'
import { DocsChat } from '../components/DocsChat'
import { docPath } from '../utils/docs'
import { href, navigate } from '../utils/routes'

function Link({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <a
      href={href(to)}
      onClick={(event) => {
        event.preventDefault()
        navigate(to)
      }}
    >
      {children}
    </a>
  )
}

function parseChanges(patch: string): { remove: string[]; add: string[] }[] {
  const value: unknown = JSON.parse(patch)
  if (
    typeof value !== 'object' ||
    value === null ||
    !('changes' in value) ||
    !Array.isArray(value.changes)
  )
    return []
  return value.changes as { remove: string[]; add: string[] }[]
}

function EditHistory({ edits }: { edits: DocEdit[] }) {
  return (
    <section className="card docs-panel" aria-label="Edit history">
      <h2>Edit history</h2>
      {edits.length === 0 ? (
        <p className="muted">No edits yet.</p>
      ) : (
        <ol className="edit-history">
          {[...edits]
            .sort((a, b) => a.newRevision - b.newRevision)
            .map((edit) => (
              <li key={edit.eventId}>
                <strong>
                  Revision {edit.newRevision} ·{' '}
                  {edit.operation.replace('_', ' ')}
                </strong>
                <p className="muted">
                  {new Date(edit.timestamp).toLocaleString()} ·{' '}
                  {edit.source === 'manual' ? 'Manual' : 'AI-approved'} ·{' '}
                  {edit.changeType.replace('_', ' ')}
                </p>
                {edit.description && <p>{edit.description}</p>}
                {edit.beforeName !== edit.afterName && (
                  <p>
                    Name: {edit.beforeName || '(new)'} → {edit.afterName}
                  </p>
                )}
                {JSON.stringify(edit.beforeAliases) !==
                  JSON.stringify(edit.afterAliases) && (
                  <p>Aliases: {edit.afterAliases.join(', ') || 'none'}</p>
                )}
                <div
                  className="delta"
                  aria-label={`Changes in revision ${edit.newRevision}`}
                >
                  {parseChanges(edit.patch).flatMap((change, index) => [
                    ...change.remove.map((line, lineIndex) => (
                      <div
                        className="delta-removed"
                        key={`${index}-r-${lineIndex}`}
                      >
                        − {line.replace(/[\r\n]+$/, '')}
                      </div>
                    )),
                    ...change.add.map((line, lineIndex) => (
                      <div
                        className="delta-added"
                        key={`${index}-a-${lineIndex}`}
                      >
                        + {line.replace(/[\r\n]+$/, '')}
                      </div>
                    )),
                  ])}
                </div>
              </li>
            ))}
        </ol>
      )}
    </section>
  )
}

function DocList({ type }: { type: EntityType }) {
  const [items, setItems] = useState<DocEntity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [aliases, setAliases] = useState('')
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)
  const operationId = useRef<string | null>(null)
  useEffect(() => {
    let active = true
    setLoading(true)
    docsService
      .list(type)
      .then((records) => {
        if (active) {
          setItems(records)
          setError('')
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(readableDocError(cause))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [type])
  const filtered = items.filter((item) =>
    [item.name, ...item.aliases].some((value) =>
      value.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
    ),
  )
  async function create(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      operationId.current ??= crypto.randomUUID()
      const result = await docsService.mutate(
        'create',
        {
          entityType: type,
          name,
          aliases: aliases
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
          content,
        },
        operationId.current,
      )
      operationId.current = null
      navigate(docPath(type, result.id))
    } catch (cause) {
      setError(readableDocError(cause))
    } finally {
      setBusy(false)
    }
  }
  const title = type === 'friend' ? 'Friends' : 'Projects'
  return (
    <main className="container page docs-page">
      <div className="docs-heading">
        <div>
          <p className="eyebrow">Docs</p>
          <h1>{title}</h1>
          <p className="muted">One simple document for each {type}.</p>
        </div>
        <button className="primary" onClick={() => setCreating(true)}>
          New {type}
        </button>
      </div>
      <DocsNav active={type === 'friend' ? 'friends' : 'projects'} />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {creating && (
        <form
          className="card docs-panel docs-form"
          onSubmit={create}
          aria-label={`New ${type}`}
        >
          <h2>New {type}</h2>
          <label>
            Name
            <input
              required
              maxLength={120}
              value={name}
              onChange={(event) => {
                setName(event.target.value)
                operationId.current = null
              }}
            />
          </label>
          <label>
            Aliases (comma-separated, optional)
            <input
              value={aliases}
              onChange={(event) => {
                setAliases(event.target.value)
                operationId.current = null
              }}
            />
          </label>
          <label>
            Document
            <textarea
              rows={8}
              value={content}
              onChange={(event) => {
                setContent(event.target.value)
                operationId.current = null
              }}
            />
          </label>
          <div className="docs-actions">
            <button className="primary" disabled={busy}>
              {busy ? 'Creating…' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      <section className="card docs-panel">
        <label>
          Search {title.toLowerCase()} and aliases
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        {loading ? (
          <p className="muted">Loading documents…</p>
        ) : filtered.length === 0 ? (
          <p className="muted">
            {search ? 'No matches.' : `No ${title.toLowerCase()} yet.`}
          </p>
        ) : (
          <ul className="docs-list">
            {filtered.map((item) => (
              <li key={item.id}>
                <Link to={docPath(type, item.id)}>{item.name}</Link>
                {item.aliases.length > 0 && (
                  <small>Also: {item.aliases.join(', ')}</small>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}

type EditMode = 'content' | 'name' | 'aliases' | null

function DocDetail({ type, id }: { type: EntityType; id: string }) {
  const [entity, setEntity] = useState<DocEntity | null>(null)
  const [edits, setEdits] = useState<DocEdit[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [mode, setMode] = useState<EditMode>(null)
  const [draft, setDraft] = useState('')
  const [changeType, setChangeType] = useState<ChangeType>('unspecified')
  const operationId = useRef<string | null>(null)
  const load = useCallback(async () => {
    setLoading(true)
    try {
      setEntity(await docsService.get(id))
      setError('')
    } catch (cause) {
      setError(readableDocError(cause))
    } finally {
      setLoading(false)
    }
  }, [id])
  useEffect(() => {
    void load()
  }, [load])
  const original =
    mode === 'content'
      ? entity?.content
      : mode === 'name'
        ? entity?.name
        : entity?.aliases.join(', ')
  const dirty = mode !== null && draft !== original
  useEffect(() => {
    if (!dirty) return
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    const beforeNavigate = (event: Event) => {
      if (!window.confirm('Discard unsaved document changes?'))
        event.preventDefault()
    }
    window.addEventListener('beforeunload', beforeUnload)
    window.addEventListener('docs-before-navigate', beforeNavigate)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      window.removeEventListener('docs-before-navigate', beforeNavigate)
    }
  }, [dirty])
  function start(nextMode: Exclude<EditMode, null>) {
    if (!entity) return
    setNotice('')
    setMode(nextMode)
    setDraft(
      nextMode === 'content'
        ? entity.content
        : nextMode === 'name'
          ? entity.name
          : entity.aliases.join(', '),
    )
    setChangeType('unspecified')
    operationId.current = null
  }
  async function refreshHistory() {
    try {
      setEdits(await docsService.history(id))
    } catch (cause) {
      setError(readableDocError(cause))
    }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!entity || !mode) return
    setBusy(true)
    setError('')
    try {
      const action =
        mode === 'content'
          ? 'update_content'
          : mode === 'name'
            ? 'rename'
            : 'update_aliases'
      const value =
        mode === 'content'
          ? { content: draft, changeType }
          : mode === 'name'
            ? { name: draft }
            : {
                aliases: draft
                  .split(',')
                  .map((alias) => alias.trim())
                  .filter(Boolean),
              }
      operationId.current ??= crypto.randomUUID()
      await docsService.mutate(
        action,
        { entityId: id, expectedRevision: entity.revision, ...value },
        operationId.current,
      )
      operationId.current = null
      setMode(null)
      await load()
      if (edits) await refreshHistory()
      setNotice('Document saved.')
    } catch (cause) {
      setError(readableDocError(cause))
    } finally {
      setBusy(false)
    }
  }
  async function remove() {
    if (
      !entity ||
      !window.confirm(
        `Delete ${entity.name}? Its edit history will be preserved.`,
      )
    )
      return
    setBusy(true)
    setError('')
    try {
      await docsService.mutate('delete', {
        entityId: id,
        expectedRevision: entity.revision,
      })
      navigate(docPath(type))
    } catch (cause) {
      setError(readableDocError(cause))
    } finally {
      setBusy(false)
    }
  }
  if (loading && !entity)
    return (
      <main className="container page">
        <p>Loading document…</p>
      </main>
    )
  return (
    <main className="container page docs-page">
      <DocsNav active={type === 'friend' ? 'friends' : 'projects'} />
      {notice && (
        <p className="success" role="status">
          {notice}
        </p>
      )}
      {error && (
        <div className="error" role="alert">
          {error}{' '}
          {error.includes('changed elsewhere') && (
            <button
              onClick={() => {
                setMode(null)
                operationId.current = null
                void load()
              }}
            >
              Reload latest
            </button>
          )}
        </div>
      )}
      {entity && (
        <>
          <section className="card docs-panel">
            <div className="docs-heading">
              <div>
                <p className="eyebrow">{type}</p>
                <h1>{entity.name}</h1>
                {entity.aliases.length > 0 && (
                  <p className="muted">Also: {entity.aliases.join(', ')}</p>
                )}
              </div>
              <span className="muted">Revision {entity.revision}</span>
            </div>
            {entity.deleted ? (
              <p>This document was deleted. Its history remains available.</p>
            ) : (
              <>
                {mode ? (
                  <form
                    className="docs-form"
                    onSubmit={save}
                    aria-label="Edit document"
                  >
                    <label>
                      {mode === 'content'
                        ? 'Document'
                        : mode === 'name'
                          ? 'Name'
                          : 'Aliases (comma-separated)'}
                      {mode === 'content' ? (
                        <textarea
                          rows={16}
                          value={draft}
                          onChange={(event) => {
                            setDraft(event.target.value)
                            operationId.current = null
                          }}
                        />
                      ) : (
                        <input
                          required={mode === 'name'}
                          value={draft}
                          onChange={(event) => {
                            setDraft(event.target.value)
                            operationId.current = null
                          }}
                        />
                      )}
                    </label>
                    {mode === 'content' && (
                      <label>
                        Change type
                        <select
                          value={changeType}
                          onChange={(event) => {
                            setChangeType(event.target.value as ChangeType)
                            operationId.current = null
                          }}
                        >
                          <option value="unspecified">Unspecified</option>
                          <option value="correction">Correction</option>
                          <option value="new_information">
                            New information
                          </option>
                        </select>
                      </label>
                    )}
                    <div className="docs-actions">
                      <button className="primary" disabled={busy || !dirty}>
                        {busy ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setMode(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="doc-content">
                      {entity.content || (
                        <span className="muted">This document is empty.</span>
                      )}
                    </div>
                    <div className="docs-actions">
                      <button onClick={() => start('content')}>
                        Edit document
                      </button>
                      <button onClick={() => start('name')}>Rename</button>
                      <button onClick={() => start('aliases')}>
                        Edit aliases
                      </button>
                      <button
                        className="danger"
                        disabled={busy}
                        onClick={() => void remove()}
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </section>
          <div>
            <button
              onClick={() => {
                if (edits) setEdits(null)
                else void refreshHistory()
              }}
            >
              {edits ? 'Hide history' : 'View edit history'}
            </button>
          </div>
          {edits && <EditHistory edits={edits} />}
        </>
      )}
    </main>
  )
}

function DocsNav({ active }: { active: 'chat' | 'friends' | 'projects' }) {
  return (
    <nav className="docs-tabs" aria-label="Docs navigation">
      <a
        href={href('/docs')}
        aria-current={active === 'chat' ? 'page' : undefined}
        onClick={(event) => {
          event.preventDefault()
          navigate('/docs')
        }}
      >
        Chat
      </a>
      <a
        href={href('/docs/friends')}
        aria-current={active === 'friends' ? 'page' : undefined}
        onClick={(event) => {
          event.preventDefault()
          navigate('/docs/friends')
        }}
      >
        Friends
      </a>
      <a
        href={href('/docs/projects')}
        aria-current={active === 'projects' ? 'page' : undefined}
        onClick={(event) => {
          event.preventDefault()
          navigate('/docs/projects')
        }}
      >
        Projects
      </a>
    </nav>
  )
}

export function Docs({ path, uid }: { path: string; uid: string }) {
  const segments = path.split('/').filter(Boolean)
  if (segments.length === 1)
    return (
      <main className="container page docs-page">
        <DocsNav active="chat" />
        <DocsChat uid={uid} />
      </main>
    )
  const type =
    segments[1] === 'friends'
      ? 'friend'
      : segments[1] === 'projects'
        ? 'project'
        : null
  if (!type || segments.length > 3)
    return (
      <main className="container page">
        <h1>Page not found</h1>
        <Link to="/docs">Back to Docs</Link>
      </main>
    )
  return segments[2] ? (
    <DocDetail key={segments[2]} type={type} id={segments[2]} />
  ) : (
    <DocList key={type} type={type} />
  )
}
