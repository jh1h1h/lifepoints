import { useCallback, useEffect, useRef, useState } from 'react'
import { DocsChat } from '../components/DocsChat'
import {
  docsService,
  readableDocError,
  type DocEntity,
  type DocSection,
  type EntityType,
} from '../services/docsService'
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

function DocsNav({
  active,
  unread,
}: {
  active: 'chat' | 'friends' | 'projects'
  unread: number
}) {
  const tab = (to: string, key: typeof active, label: React.ReactNode) => (
    <a
      href={href(to)}
      aria-current={active === key ? 'page' : undefined}
      onClick={(event) => {
        event.preventDefault()
        navigate(to)
      }}
    >
      {label}
    </a>
  )
  return (
    <nav className="docs-tabs" aria-label="Docs navigation">
      {tab('/docs', 'chat', 'Chat')}
      {tab(
        '/docs/friends',
        'friends',
        <>
          Friends{' '}
          {unread > 0 && (
            <span
              className="notification-badge"
              aria-label={`${unread} unread friend sections`}
            >
              {unread}
            </span>
          )}
        </>,
      )}
      {tab('/docs/projects', 'projects', 'Projects')}
    </nav>
  )
}

function SectionCard({
  section,
  friend,
  onChanged,
}: {
  section: DocSection
  friend: boolean
  onChanged: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(section.content)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function mutate(
    action: 'update_section' | 'set_section_pinned' | 'set_section_unread',
    values: Record<string, unknown>,
  ) {
    setBusy(true)
    setError('')
    try {
      await docsService.mutate(action, {
        entityId: section.entityId,
        sectionId: section.id,
        expectedRevision: section.revision,
        ...values,
      })
      setEditing(false)
      onChanged()
    } catch (cause) {
      setError(readableDocError(cause))
    } finally {
      setBusy(false)
    }
  }
  return (
    <article
      className={`section-card${section.pinned ? ' is-pinned' : ''}${section.unread ? ' is-unread' : ''}`}
    >
      <header>
        <div>
          <strong>{section.entityName}</strong>
          <small>
            {new Date(section.createdAt).toLocaleString()}
            {section.updatedAt !== section.createdAt ? ' · edited' : ''}
          </small>
        </div>
        {section.pinned && <span title="Pinned">📌</span>}
      </header>
      {editing ? (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void mutate('update_section', { content: draft })
          }}
        >
          <textarea
            required
            rows={6}
            maxLength={10000}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="docs-actions">
            <button
              className="primary"
              disabled={busy || draft === section.content}
            >
              Save
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setDraft(section.content)
                setEditing(false)
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="section-content">{section.content}</div>
      )}
      {!editing && (
        <div className="section-controls">
          <button disabled={busy} onClick={() => setEditing(true)}>
            Edit
          </button>
          <button
            disabled={busy}
            onClick={() =>
              void mutate('set_section_pinned', { pinned: !section.pinned })
            }
          >
            {section.pinned ? 'Unpin' : 'Pin'}
          </button>
          {friend && (
            <label className="compact-check">
              <input
                type="checkbox"
                checked={section.unread}
                disabled={busy}
                onChange={(event) =>
                  void mutate('set_section_unread', {
                    unread: event.target.checked,
                  })
                }
              />
              Unread
            </label>
          )}
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </article>
  )
}

function DocList({
  type,
  unread,
  refreshSummary,
}: {
  type: EntityType
  unread: number
  refreshSummary: () => void
}) {
  const [items, setItems] = useState<DocEntity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [aliases, setAliases] = useState('')
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)
  const operationId = useRef<string | undefined>(undefined)
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
      .catch((cause) => {
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
      value.toLowerCase().includes(search.toLowerCase()),
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
      operationId.current = undefined
      refreshSummary()
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
          <p className="muted">
            Each {type} is a timeline of editable sections.
          </p>
        </div>
        <button className="primary" onClick={() => setCreating(true)}>
          New {type}
        </button>
      </div>
      <DocsNav
        active={type === 'friend' ? 'friends' : 'projects'}
        unread={unread}
      />
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
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            Aliases (comma-separated, optional)
            <input
              value={aliases}
              onChange={(event) => setAliases(event.target.value)}
            />
          </label>
          <label>
            First section (optional)
            <textarea
              rows={5}
              maxLength={10000}
              value={content}
              onChange={(event) => setContent(event.target.value)}
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
          <p className="muted">Loading…</p>
        ) : !filtered.length ? (
          <p className="muted">
            {search ? 'No matches.' : `No ${title.toLowerCase()} yet.`}
          </p>
        ) : (
          <ul className="docs-list">
            {filtered.map((item) => (
              <li key={item.id}>
                <Link to={docPath(type, item.id)}>{item.name}</Link>
                {item.unreadCount > 0 && (
                  <span className="notification-badge">{item.unreadCount}</span>
                )}
                <small>
                  {item.sectionCount}{' '}
                  {item.sectionCount === 1 ? 'section' : 'sections'}
                  {item.aliases.length
                    ? ` · Also: ${item.aliases.join(', ')}`
                    : ''}
                </small>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}

function DocDetail({
  type,
  id,
  unread,
  refreshSummary,
}: {
  type: EntityType
  id: string
  unread: number
  refreshSummary: () => void
}) {
  const [entity, setEntity] = useState<DocEntity>()
  const [sections, setSections] = useState<DocSection[]>([])
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest')
  const [prioritizePins, setPrioritizePins] = useState(true)
  const [newText, setNewText] = useState('')
  const [addingSection, setAddingSection] = useState(false)
  const [editingDetails, setEditingDetails] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [aliasesDraft, setAliasesDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    try {
      const [record, entries] = await Promise.all([
        docsService.get(id),
        docsService.sections(id),
      ])
      setEntity(record)
      setSections(entries)
      setError('')
      refreshSummary()
    } catch (cause) {
      setError(readableDocError(cause))
    }
  }, [id, refreshSummary])
  useEffect(() => {
    void load()
  }, [load])
  const ordered = [...sections].sort((a, b) => {
    if (prioritizePins && a.pinned !== b.pinned) return a.pinned ? -1 : 1
    const result = a.createdAt.localeCompare(b.createdAt)
    return sort === 'oldest' ? result : -result
  })
  async function add(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      await docsService.mutate('add_section', {
        entityId: id,
        content: newText,
      })
      setNewText('')
      setAddingSection(false)
      await load()
    } catch (cause) {
      setError(readableDocError(cause))
    } finally {
      setBusy(false)
    }
  }
  function startDetails() {
    if (!entity) return
    setNameDraft(entity.name)
    setAliasesDraft(entity.aliases.join(', '))
    setEditingDetails(true)
  }
  async function saveDetails(event: React.FormEvent) {
    event.preventDefault()
    if (!entity) return
    setBusy(true)
    setError('')
    try {
      let revision = entity.revision
      if (nameDraft.trim() !== entity.name) {
        const result = await docsService.mutate('rename', {
          entityId: id,
          expectedRevision: revision,
          name: nameDraft,
        })
        revision = result.revision
      }
      const nextAliases = aliasesDraft
        .split(',')
        .map((alias) => alias.trim())
        .filter(Boolean)
      if (JSON.stringify(nextAliases) !== JSON.stringify(entity.aliases)) {
        await docsService.mutate('update_aliases', {
          entityId: id,
          expectedRevision: revision,
          aliases: nextAliases,
        })
      }
      setEditingDetails(false)
      await load()
    } catch (cause) {
      setError(readableDocError(cause))
    } finally {
      setBusy(false)
    }
  }
  async function remove() {
    if (!entity || !window.confirm(`Delete ${entity.name}?`)) return
    setBusy(true)
    try {
      await docsService.mutate('delete', {
        entityId: id,
        expectedRevision: entity.revision,
      })
      navigate(docPath(type))
    } catch (cause) {
      setError(readableDocError(cause))
      setBusy(false)
    }
  }
  if (!entity && !error)
    return (
      <main className="container page">
        <p>Loading note…</p>
      </main>
    )
  return (
    <main className="container page docs-page">
      <DocsNav
        active={type === 'friend' ? 'friends' : 'projects'}
        unread={unread}
      />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {entity && (
        <>
          <div className="docs-heading">
            <div>
              <p className="eyebrow">{type}</p>
              <h1>{entity.name}</h1>
              {entity.aliases.length > 0 && (
                <p className="muted">Also: {entity.aliases.join(', ')}</p>
              )}
            </div>
            <div className="docs-actions">
              <button
                className="primary"
                onClick={() => setAddingSection(true)}
              >
                New section
              </button>
              <button onClick={startDetails}>Edit details</button>
              <button
                className="danger"
                disabled={busy}
                onClick={() => void remove()}
              >
                Delete
              </button>
            </div>
          </div>
          {addingSection && (
            <div
              className="modal-backdrop"
              onClick={() => {
                if (!busy) {
                  setNewText('')
                  setAddingSection(false)
                }
              }}
            >
              <form
                className="modal card docs-section-modal"
                role="dialog"
                aria-modal="true"
                aria-label={`New section for ${entity.name}`}
                onClick={(event) => event.stopPropagation()}
                onSubmit={add}
              >
                <h2>New section</h2>
                <label htmlFor="new-section-content">Section text</label>
                <textarea
                  id="new-section-content"
                  required
                  rows={7}
                  maxLength={10000}
                  value={newText}
                  onChange={(event) => setNewText(event.target.value)}
                  placeholder={`Add a thought about ${entity.name}…`}
                  autoFocus
                />
                <div className="modal-actions">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setNewText('')
                      setAddingSection(false)
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    className="primary"
                    disabled={busy || !newText.trim()}
                  >
                    {busy ? 'Adding…' : 'Add section'}
                  </button>
                </div>
              </form>
            </div>
          )}
          {editingDetails && (
            <form
              className="card docs-panel docs-form"
              onSubmit={saveDetails}
              aria-label="Edit details"
            >
              <label>
                Name
                <input
                  required
                  maxLength={120}
                  value={nameDraft}
                  onChange={(event) => setNameDraft(event.target.value)}
                />
              </label>
              <label>
                Aliases (comma-separated)
                <input
                  value={aliasesDraft}
                  onChange={(event) => setAliasesDraft(event.target.value)}
                />
              </label>
              <div className="docs-actions">
                <button className="primary" disabled={busy}>
                  Save details
                </button>
                <button type="button" onClick={() => setEditingDetails(false)}>
                  Cancel
                </button>
              </div>
            </form>
          )}
          <div className="section-toolbar">
            <label>
              Order{' '}
              <select
                value={sort}
                onChange={(event) =>
                  setSort(event.target.value as 'newest' | 'oldest')
                }
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </label>
            <label className="compact-check">
              <input
                type="checkbox"
                checked={!prioritizePins}
                onChange={(event) => setPrioritizePins(!event.target.checked)}
              />
              Ignore pin priority
            </label>
          </div>
          <section
            className="sections-list"
            aria-label={`${entity.name} sections`}
          >
            {!ordered.length ? (
              <p className="muted">No sections yet.</p>
            ) : (
              ordered.map((section) => (
                <SectionCard
                  key={section.id}
                  section={section}
                  friend={type === 'friend'}
                  onChanged={() => void load()}
                />
              ))
            )}
          </section>
        </>
      )}
    </main>
  )
}

function RecentProjects({
  refreshKey,
  onChanged,
}: {
  refreshKey: number
  onChanged: () => void
}) {
  const [sections, setSections] = useState<DocSection[]>([])
  const [error, setError] = useState('')
  const load = useCallback(
    () =>
      docsService
        .recentProjects(15)
        .then(setSections)
        .catch((cause) => setError(readableDocError(cause))),
    [],
  )
  useEffect(() => {
    void load()
  }, [load, refreshKey])
  return (
    <aside className="recent-projects" aria-label="Recent project sections">
      <div className="recent-heading">
        <h2>Recent projects</h2>
        <Link to="/docs/projects">All projects</Link>
      </div>
      {error && <p className="error">{error}</p>}
      {!sections.length ? (
        <p className="muted">No project sections yet.</p>
      ) : (
        sections.map((section) => (
          <SectionCard
            key={section.id}
            section={section}
            friend={false}
            onChanged={() => {
              void load()
              onChanged()
            }}
          />
        ))
      )}
    </aside>
  )
}

export function Docs({ path }: { path: string; uid: string }) {
  const [unread, setUnread] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const refreshSummary = useCallback(() => {
    docsService
      .summary()
      .then((value) => setUnread(value.unreadFriends))
      .catch(() => {})
  }, [])
  useEffect(() => {
    refreshSummary()
  }, [refreshSummary, path])
  const changed = useCallback(() => {
    refreshSummary()
    setRefreshKey((value) => value + 1)
  }, [refreshSummary])
  const segments = path.split('/').filter(Boolean)
  if (segments.length === 1)
    return (
      <main className="container page docs-page docs-chat-page">
        <DocsNav active="chat" unread={unread} />
        <div className="docs-workspace">
          <DocsChat onSaved={changed} />
          <RecentProjects refreshKey={refreshKey} onChanged={changed} />
        </div>
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
    <DocDetail
      key={segments[2]}
      type={type}
      id={segments[2]}
      unread={unread}
      refreshSummary={refreshSummary}
    />
  ) : (
    <DocList
      key={type}
      type={type}
      unread={unread}
      refreshSummary={refreshSummary}
    />
  )
}
