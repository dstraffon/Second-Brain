import { useMemo, useRef, useState } from 'react'
import type { Note, Project, TodoItem, TodoList } from '../types'
import { PROJECT_COLORS, newItem, newList, plural, reopenProject, resolveProject, resolvedLabel, useProjects } from '../lib/projects'
import { uid } from '../lib/id'
import { confirmDelete } from '../lib/confirm'
import { useSortable } from '../lib/useSortable'
import { Card } from './Card'
import { NoteComposer, NoteRow } from './NotesPanel'
import { IndentIcon } from './IndentIcon'
import { TODO_MAX_DEPTH, canIndentTodo, depthOf, indentTodo, normalizeDepths, removeTodos, todoGroups, toggleTodo } from '../lib/todoTree'

type Tab = 'lists' | 'notes'

/** Touch screens, plus phone-width windows (which get the same row layout). */
const coarse = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse), (max-width: 520px)').matches

/** Lists get a bit under two thirds of the width until the divider is moved. */
const DEFAULT_SPLIT = 0.64
/** Neither side gets narrower than this while dragging. */
const MIN_SIDE = 280

/** One project, full screen: its titled to-do lists beside its notes. On a phone, one at a time. */
export function ProjectView(props: { id: string; onClose: () => void; backLabel: string }) {
  const { projects, setProjects, updateProject } = useProjects()
  const p = projects.find((x) => x.id === props.id)
  const [tab, setTab] = useState<Tab>('lists')

  if (!p) {
    return (
      <Card title="Project" className="project-view" expanded onClose={props.onClose} backLabel={props.backLabel}>
        <p className="empty">This project isn’t here anymore. It may have been deleted.</p>
      </Card>
    )
  }

  const change = (fn: (p: Project) => Project) => updateProject(p.id, fn)
  const setLists = (fn: (ls: TodoList[]) => TodoList[]) => change((x) => ({ ...x, lists: fn(x.lists) }))
  const setNotes = (fn: (ns: Note[]) => Note[]) => change((x) => ({ ...x, notes: fn(x.notes) }))
  const openItems = p.lists.reduce((n, l) => n + l.items.filter((i) => !i.done).length, 0)

  const remove = () => {
    props.onClose()
    setProjects((ps) => ps.filter((x) => x.id !== p.id))
  }

  return (
    <Card
      title={<ProjectName project={p} onRename={(name) => change((x) => ({ ...x, name }))} />}
      className="project-view"
      expanded
      onClose={props.onClose}
      backLabel={props.backLabel}
      actions={
        <>
          <button
            className="icon-btn subtle color-btn"
            style={{ '--chip': p.color } as React.CSSProperties}
            title="Change color"
            aria-label="Change project color"
            onClick={() => change((x) => ({ ...x, color: PROJECT_COLORS[(PROJECT_COLORS.indexOf(x.color) + 1) % PROJECT_COLORS.length] }))}
          >
            <span className="dot" />
          </button>
          {!p.resolvedAt && (
            <button className="btn small resolve-btn" title="Mark this project done. It moves to Resolved, and you can reopen it any time." onClick={() => change(resolveProject)}>
              ✓ Resolve<span className="hide-sm"> project</span>
            </button>
          )}
          <button
            type="button"
            className="btn small"
            onClick={() =>
              confirmDelete({
                title: 'Delete this project?',
                name: p.name,
                detail:
                  p.lists.length || p.notes.length
                    ? `Its ${[p.lists.length && plural(p.lists.length, 'list'), p.notes.length && plural(p.notes.length, 'note')].filter(Boolean).join(' and ')} go with it.`
                    : undefined,
                onConfirm: remove,
              })
            }
          >
            Delete<span className="hide-sm"> project</span>
          </button>
        </>
      }
    >
      {p.resolvedAt && (
        <div className="resolved-strip" role="status">
          <span className="resolved-check" aria-hidden>
            ✓
          </span>
          <span>
            Resolved {resolvedLabel(p.resolvedAt)}. It now sits under Resolved in Projects.
          </span>
          <button className="btn small" onClick={() => change(reopenProject)}>
            Reopen
          </button>
        </div>
      )}
      <div className="tabs project-switch" role="tablist" aria-label="Project sections">
        {(['lists', 'notes'] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
            {t === 'lists' ? 'To-do lists' : 'Notes'}
            {(t === 'lists' ? openItems : p.notes.length) > 0 && <span className="count">{t === 'lists' ? openItems : p.notes.length}</span>}
          </button>
        ))}
      </div>
      <div className={`project-body show-${tab}`} style={{ '--split': p.split ?? DEFAULT_SPLIT } as React.CSSProperties}>
        <section className="project-col project-lists-col" aria-label="To-do lists">
          <h3 className="group-head project-col-head">To-do lists</h3>
          {/* New lists go on top, like new notes and the dashboard's add boxes. */}
          <NewListForm first={p.lists.length === 0} onAdd={(title) => setLists((ls) => [newList(title), ...ls])} />
          {p.lists.length > 0 && (
            <div className="todo-lists">
              {p.lists.map((l) => (
                <TodoListCard
                  key={l.id}
                  list={l}
                  color={p.color}
                  onChange={(fn) => setLists((ls) => ls.map((x) => (x.id === l.id ? fn(x) : x)))}
                  onDelete={() => setLists((ls) => ls.filter((x) => x.id !== l.id))}
                />
              ))}
            </div>
          )}
        </section>
        <SplitHandle value={p.split ?? DEFAULT_SPLIT} onChange={(split) => change((x) => ({ ...x, split: split === DEFAULT_SPLIT ? undefined : split }))} />
        <section className="project-col project-notes-col" aria-label="Notes">
          <h3 className="group-head project-col-head">Notes</h3>
          <NoteComposer
            placeholder={`A note for ${p.name}…`}
            onAdd={(title, text) =>
              setNotes((ns) => [{ id: uid(), ...(title ? { title } : {}), text, categoryId: null, createdAt: new Date().toISOString() }, ...ns])
            }
          />
          <ul className="note-list">
            {[...p.notes]
              .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.createdAt.localeCompare(a.createdAt))
              .map((n) => (
                <NoteRow
                  key={n.id}
                  note={n}
                  category={{ id: '', name: '', color: p.color }}
                  update={(id, patch) => setNotes((ns) => ns.map((x) => (x.id === id ? { ...x, ...patch } : x)))}
                  remove={(id) => setNotes((ns) => ns.filter((x) => x.id !== id))}
                />
              ))}
          </ul>
          {p.notes.length === 0 && <p className="empty">No notes yet. They stay inside this project.</p>}
        </section>
      </div>
    </Card>
  )
}

/** The project's name as the page heading. Click it to rename. */
function ProjectName({ project: p, onRename }: { project: Project; onRename: (name: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(p.name)
  const save = () => {
    const n = draft.trim()
    if (n && n !== p.name) onRename(n)
    setEditing(false)
  }
  if (editing)
    return (
      <input
        className="inline-edit project-name-input"
        autoFocus
        value={draft}
        maxLength={80}
        aria-label="Project name"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save()
          if (e.key === 'Escape') {
            e.stopPropagation()
            setEditing(false)
          }
        }}
      />
    )
  return (
    <button
      className="project-title-btn"
      style={{ '--chip': p.color } as React.CSSProperties}
      title="Click to rename"
      onClick={() => {
        setDraft(p.name)
        setEditing(true)
      }}
    >
      <span className="dot" aria-hidden />
      {p.name}
      <span className="edit-ico" aria-hidden>
        ✎
      </span>
    </button>
  )
}

function NewListForm({ first, onAdd }: { first: boolean; onAdd: (title: string) => void }) {
  const [title, setTitle] = useState('')
  const add = () => {
    const t = title.trim()
    if (!t) return
    onAdd(t)
    setTitle('')
  }
  return (
    <form
      className="quick-add new-list"
      onSubmit={(e) => {
        e.preventDefault()
        add()
      }}
    >
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={first ? 'Name your first list, like “Research” or “Launch”…' : 'New list title…'}
        aria-label="New list title"
        autoComplete="off"
        maxLength={80}
        enterKeyHint="done"
      />
      <button type="submit" className="btn" disabled={!title.trim()}>
        + Add list
      </button>
    </form>
  )
}

function TodoListCard(props: { list: TodoList; color: string; onChange: (fn: (l: TodoList) => TodoList) => void; onDelete: () => void }) {
  const { list: l, onChange } = props
  const [text, setText] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(l.title)
  // How far the next to-do from the add box will be nested (Tab / Shift+Tab, or the ↳ button).
  const [addDepth, setAddDepth] = useState(0)
  // A top-level to-do and its sub-to-dos move, sort and sink as one group.
  const groups = useMemo(() => todoGroups(l.items), [l.items])
  const openGroups = useMemo(() => groups.filter((g) => !g[0].done), [groups])
  const doneGroups = useMemo(() => groups.filter((g) => g[0].done), [groups])
  const doneCount = useMemo(() => l.items.filter((i) => i.done).length, [l.items])
  const openIds = useMemo(() => openGroups.map((g) => g[0].id), [openGroups])
  const byId = useMemo(() => new Map(openGroups.map((g) => [g[0].id, g])), [openGroups])
  const sort = useSortable(openIds, (ids) =>
    onChange((x) => {
      const gs = todoGroups(x.items)
      const find = (id: string) => gs.find((g) => g[0].id === id) ?? []
      return { ...x, items: [...ids.flatMap(find), ...gs.filter((g) => g[0].done).flat()] }
    }),
  )

  const setItems = (fn: (items: TodoItem[]) => TodoItem[]) => onChange((x) => ({ ...x, items: fn(x.items) }))
  const setItem = (id: string, patch: Partial<TodoItem>) => setItems((items) => items.map((i) => (i.id === id ? { ...i, ...patch } : i)))
  // A single to-do is quick to retype, so it goes in one tap (Dylan's call). Its sub-to-dos stay, moved up a level.
  const removeItem = (id: string) => setItems((items) => removeTodos(items, new Set([id])))
  const toggle = (id: string) => setItems((items) => toggleTodo(items, id))
  const indent = (id: string, dir: 1 | -1) => setItems((items) => indentTodo(items, id, dir))

  // The add box nests under the last open to-do, at most one level below it.
  const lastOpen = openGroups.length ? openGroups[openGroups.length - 1].at(-1)! : null
  const maxAddDepth = lastOpen ? Math.min(depthOf(lastOpen) + 1, TODO_MAX_DEPTH) : 0
  const depthNow = Math.min(addDepth, maxAddDepth)
  const parentTitle = (() => {
    if (!depthNow || !openGroups.length) return ''
    const flat = openGroups.flat()
    for (let k = flat.length - 1; k >= 0; k--) if (depthOf(flat[k]) === depthNow - 1) return flat[k].title
    return ''
  })()

  const add = () => {
    const t = text.trim()
    if (!t) return
    // New items join the end of the open ones, above anything already done.
    onChange((x) => {
      const gs = todoGroups(x.items)
      const open = gs.filter((g) => !g[0].done).flat()
      return { ...x, items: normalizeDepths([...open, newItem(t, depthNow), ...gs.filter((g) => g[0].done).flat()]) }
    })
    setText('')
  }
  const rename = () => {
    const t = draft.trim()
    if (t && t !== l.title) onChange((x) => ({ ...x, title: t }))
    setRenaming(false)
  }

  const row = (i: TodoItem, opts: { handle?: ReturnType<typeof sort.handleProps> } = {}) => (
    <TodoRow
      key={i.id}
      item={i}
      set={setItem}
      toggle={toggle}
      remove={removeItem}
      canIn={canIndentTodo(l.items, i.id, 1)}
      onIndent={(dir) => indent(i.id, dir)}
      handle={opts.handle}
    />
  )

  return (
    <section className="todo-list" style={{ '--chip': props.color } as React.CSSProperties} aria-label={l.title}>
      <header className="todo-list-head">
        {renaming ? (
          <input
            className="inline-edit"
            autoFocus
            value={draft}
            maxLength={80}
            aria-label="List title"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={rename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') rename()
              if (e.key === 'Escape') {
                e.stopPropagation()
                setRenaming(false)
              }
            }}
          />
        ) : (
          <h4
            className="todo-list-title"
            title="Click to rename"
            tabIndex={0}
            onClick={() => {
              setDraft(l.title)
              setRenaming(true)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setDraft(l.title)
                setRenaming(true)
              }
            }}
          >
            {l.title}
          </h4>
        )}
        {!renaming && l.items.length > 0 && (
          <span className="muted small">
            {doneCount}/{l.items.length}
          </span>
        )}
        <button
          type="button"
          className="icon-btn subtle"
          aria-label={`Delete list ${l.title}`}
          onClick={() =>
            // An empty list has nothing to lose, so it goes in one tap.
            l.items.length === 0
              ? props.onDelete()
              : confirmDelete({
                  title: 'Delete this list?',
                  name: l.title,
                  detail: `Its ${plural(l.items.length, 'to-do')} go${l.items.length === 1 ? 'es' : ''} with it.`,
                  onConfirm: props.onDelete,
                })
          }
        >
          ×
        </button>
      </header>
      <form
        className={`quick-add compact todo-add ${depthNow ? 'nested' : ''}`}
        style={{ '--depth': depthNow } as React.CSSProperties}
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        {maxAddDepth > 0 && (
          <button
            type="button"
            className={`btn sub-toggle ${depthNow ? 'on' : ''}`}
            aria-pressed={depthNow > 0}
            title={depthNow ? 'Back to a top-level to-do (Shift+Tab)' : 'Add as a sub-to-do (Tab)'}
            aria-label={depthNow ? 'Add at the top level' : 'Add as a sub-to-do'}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setAddDepth(depthNow ? 0 : maxAddDepth)}
          >
            ↳
          </button>
        )}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={depthNow ? `Sub-to-do under “${parentTitle}”…` : 'Add a to-do…'}
          aria-label={depthNow ? `Add a sub-to-do under ${parentTitle}` : `Add to ${l.title}`}
          autoComplete="off"
          enterKeyHint="done"
          onKeyDown={(e) => {
            // Tab nests the next to-do, Shift+Tab un-nests it. Past either end, Tab moves focus as usual.
            if (e.key !== 'Tab' || e.metaKey || e.ctrlKey || e.altKey) return
            const next = depthNow + (e.shiftKey ? -1 : 1)
            if (next < 0 || next > maxAddDepth) return
            e.preventDefault()
            setAddDepth(next)
          }}
        />
        <button type="submit" className="btn primary" disabled={!text.trim()}>
          Add
        </button>
      </form>
      <ul className="task-list todo-items" ref={sort.listRef}>
        {sort.order.map((id) => {
          const g = byId.get(id)
          if (!g) return null
          return (
            <li key={id} className={`todo-group ${sort.dragId === id ? 'dragging' : ''}`} data-sort-id={id}>
              {g.map((i, k) => row(i, { handle: k === 0 && openGroups.length > 1 ? sort.handleProps(id) : undefined }))}
            </li>
          )
        })}
        {doneGroups.map((g) => (
          <li key={g[0].id} className="todo-group done">
            {g.map((i) => row(i))}
          </li>
        ))}
      </ul>
      {l.items.length === 0 && <p className="empty">Nothing on this list yet.</p>}
      {doneCount > 1 && (
        <button className="btn small ghost clear-done" onClick={() =>
            confirmDelete({
              title: `Clear ${doneCount} done to-dos?`,
              detail: `They’re removed from “${l.title}”. Open to-dos stay.`,
              action: 'Clear',
              onConfirm: () => setItems((items) => removeTodos(items, new Set(items.filter((i) => i.done).map((i) => i.id)))),
            })
          }
        >
          Clear {doneCount} done
        </button>
      )}
    </section>
  )
}

function TodoRow(props: {
  item: TodoItem
  set: (id: string, patch: Partial<TodoItem>) => void
  toggle: (id: string) => void
  remove: (id: string) => void
  canIn: boolean
  onIndent: (dir: 1 | -1) => void
  handle?: ReturnType<ReturnType<typeof useSortable>['handleProps']>
}) {
  const { item: i } = props
  const depth = depthOf(i)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(i.title)
  const save = () => {
    const t = draft.trim()
    if (t && t !== i.title) props.set(i.id, { title: t })
    setEditing(false)
  }
  // Nesting can move the row into another group (a fresh row), so keep any typed change first.
  const nest = (dir: 1 | -1) => {
    const t = draft.trim()
    if (t && t !== i.title) props.set(i.id, { title: t })
    props.onIndent(dir)
  }
  return (
    <div className={`task ${i.done ? 'done' : ''} ${depth ? 'sub' : ''}`} style={depth ? ({ '--depth': depth } as React.CSSProperties) : undefined}>
      {props.handle ? (
        <button type="button" className="drag-handle" aria-label={`Reorder ${i.title}. Drag, or use the arrow keys.`} title="Drag to reorder" {...props.handle}>
          <svg viewBox="0 0 10 16" width="10" height="16" aria-hidden>
            {[3, 8, 13].map((y) => (
              <g key={y}>
                <circle cx="2.5" cy={y} r="1.4" />
                <circle cx="7.5" cy={y} r="1.4" />
              </g>
            ))}
          </svg>
        </button>
      ) : (
        <span className="drag-spacer" aria-hidden />
      )}
      <label className="check">
        <input type="checkbox" checked={i.done} onChange={() => props.toggle(i.id)} aria-label={i.done ? `Mark ${i.title} not done` : `Mark ${i.title} done`} />
        <span className="box" aria-hidden />
      </label>
      {editing ? (
        <span className="todo-edit">
          <input
            className="inline-edit"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
              if (e.key === 'Escape') {
                e.stopPropagation()
                setEditing(false)
              }
              // Tab / Shift+Tab nest or un-nest the to-do being edited.
              if (e.key === 'Tab' && !e.metaKey && !e.ctrlKey && !e.altKey && (e.shiftKey ? depth > 0 : props.canIn)) {
                e.preventDefault()
                nest(e.shiftKey ? -1 : 1)
              }
            }}
          />
          {/* While editing (how a phone gets at it), the nest buttons sit by the field. They keep focus in it. */}
          <span className="todo-edit-nest">
            <button type="button" className="icon-btn subtle" disabled={depth === 0} aria-label="Move out a level" title="Move out a level (Shift+Tab)" onPointerDown={(e) => e.preventDefault()} onMouseDown={(e) => e.preventDefault()} onClick={() => nest(-1)}>
              <IndentIcon out />
            </button>
            <button type="button" className="icon-btn subtle" disabled={!props.canIn} aria-label="Make a sub-to-do" title="Make a sub-to-do of the one above (Tab)" onPointerDown={(e) => e.preventDefault()} onMouseDown={(e) => e.preventDefault()} onClick={() => nest(1)}>
              <IndentIcon />
            </button>
          </span>
        </span>
      ) : (
        <span
          className="task-title"
          title="Double-click to edit"
          onClick={() => {
            // A phone has no double-click (and no hover buttons for nesting), so one tap edits there.
            if (!coarse()) return
            setDraft(i.title)
            setEditing(true)
          }}
          onDoubleClick={() => {
            setDraft(i.title)
            setEditing(true)
          }}
        >
          {i.title}
        </span>
      )}
      <div className="row-actions">
        {depth > 0 && (
          <button className="icon-btn subtle indent-act" aria-label={`Move ${i.title} out a level`} title="Move out a level" onClick={() => props.onIndent(-1)}>
            <IndentIcon out />
          </button>
        )}
        {props.canIn && (
          <button className="icon-btn subtle indent-act" aria-label={`Make ${i.title} a sub-to-do`} title="Make a sub-to-do of the one above" onClick={() => props.onIndent(1)}>
            <IndentIcon />
          </button>
        )}
        <button className="icon-btn subtle" aria-label={`Delete ${i.title}`} onClick={() => props.remove(i.id)}>
          ×
        </button>
      </div>
    </div>
  )
}

/**
 * The divider between lists and notes. Drag it (mouse, pen or touch), or
 * focus it and use the arrow keys. Double-click puts it back. The split is
 * previewed live through a CSS variable and saved once, on release.
 */
function SplitHandle({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const pct = Math.round(value * 100)

  const clamp = (v: number, width: number) => {
    const min = width > 0 ? Math.min(0.45, MIN_SIDE / width) : 0.25
    return Math.round(Math.min(1 - min, Math.max(min, v)) * 1000) / 1000
  }
  const body = () => ref.current?.parentElement as HTMLElement | null

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const el = body()
    if (!el) return
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const rect = el.getBoundingClientRect()
    const handleW = e.currentTarget.offsetWidth
    let next = value
    setDragging(true)
    document.body.classList.add('resizing')
    const move = (ev: PointerEvent) => {
      next = clamp((ev.clientX - rect.left - handleW / 2) / (rect.width - handleW), rect.width)
      el.style.setProperty('--split', String(next))
    }
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      document.body.classList.remove('resizing')
      setDragging(false)
      const keep = ev.type === 'pointerup' && next !== value
      el.style.setProperty('--split', String(keep ? next : value))
      if (keep) onChange(next)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 0.1 : 0.03
    const w = body()?.offsetWidth ?? 0
    if (e.key === 'ArrowLeft') onChange(clamp(value - step, w))
    else if (e.key === 'ArrowRight') onChange(clamp(value + step, w))
    else if (e.key === 'Home') onChange(clamp(0, w))
    else if (e.key === 'End') onChange(clamp(1, w))
    else if (e.key === 'Enter') onChange(DEFAULT_SPLIT)
    else return
    e.preventDefault()
  }

  return (
    <div
      ref={ref}
      className={`split-handle ${dragging ? 'dragging' : ''}`}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize to-do lists and notes"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-valuetext={`To-do lists ${pct}%, notes ${100 - pct}%`}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={() => onChange(DEFAULT_SPLIT)}
    >
      <span className="split-grip" aria-hidden />
    </div>
  )
}
