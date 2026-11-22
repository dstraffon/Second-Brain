import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { NoteText } from './NoteText'
import { bulletDepth, continueList, indentBullets, isBullet, MAX_DEPTH, parseNote, toggleBullets, type Edit, type ListItem } from '../lib/noteText'

const coarse = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

/**
 * Title + body fields used both for a new note and for editing one.
 * Enter saves on a computer (Shift+Enter for a new line). On a touch screen
 * Enter adds a line, since there is no Shift key, and the button saves.
 * Inside a list a new line carries the bullet on; an empty bullet ends the list.
 * Tab nests a bullet as a sub-point and Shift+Tab brings it back out. On a
 * phone, with no Tab key, the bar's arrow buttons do the same.
 */
export function NoteEditor(props: {
  title: string
  text: string
  onTitle: (t: string) => void
  onText: (t: string) => void
  onSubmit: () => void
  onCancel?: () => void
  /** Show the title field. The quick-add box only shows it once it's in use. */
  showTitle: boolean
  bodyId?: string
  titleId?: string
  placeholder?: string
  autoFocus?: boolean
  rows?: number
  className?: string
  footer?: ReactNode
  onFocus?: () => void
  onBlur?: (e: React.FocusEvent<HTMLDivElement>) => void
}) {
  const body = useRef<HTMLTextAreaElement>(null)
  // Where the caret goes after a list edit, applied once React has rendered the new text.
  const pendingSel = useRef<[number, number] | null>(null)
  useLayoutEffect(() => {
    if (pendingSel.current && body.current) {
      body.current.setSelectionRange(...pendingSel.current)
      pendingSel.current = null
    }
  })

  const apply = (e: Edit) => {
    pendingSel.current = [e.start, e.end]
    props.onText(e.value)
  }

  // Re-render when the caret moves, so the bar's buttons follow the line it's on.
  const [, setCaret] = useState(0)
  const onSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) => setCaret(e.currentTarget.selectionStart)

  const indent = (dir: 1 | -1) => {
    const el = body.current
    if (!el) return
    const next = indentBullets(el.value, el.selectionStart, el.selectionEnd, dir)
    if (next) apply(next)
    el.focus()
  }

  const toggle = () => {
    const el = body.current
    if (!el) return
    apply(toggleBullets(el.value, el.selectionStart, el.selectionEnd))
    el.focus()
  }

  const onBodyKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return
    const el = e.currentTarget
    if (e.key === 'Escape' && props.onCancel) {
      e.preventDefault()
      props.onCancel()
      return
    }
    // Cmd/Ctrl+Shift+8 is the usual bullet-list shortcut in docs apps.
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === '8' || e.key === '*' || e.code === 'Digit8')) {
      e.preventDefault()
      toggle()
      return
    }
    // Tab nests a bullet, Shift+Tab un-nests it. Off a bullet line Tab moves focus as usual.
    if (e.key === 'Tab' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const next = indentBullets(el.value, el.selectionStart, el.selectionEnd, e.shiftKey ? -1 : 1)
      if (next) {
        e.preventDefault()
        apply(next)
      }
      return
    }
    if (e.key !== 'Enter') return
    const newLine = e.shiftKey || coarse()
    if (!newLine) {
      e.preventDefault()
      props.onSubmit()
      return
    }
    const next = continueList(el.value, el.selectionStart, el.selectionEnd)
    if (next) {
      e.preventDefault()
      apply(next)
    }
  }

  const caretLine = (() => {
    const el = body.current
    const pos = el ? el.selectionStart : props.text.length
    const lineStart = props.text.lastIndexOf('\n', pos - 1) + 1
    const lineEnd = props.text.indexOf('\n', pos)
    return props.text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd)
  })()
  const listOn = isBullet(caretLine)
  const depth = listOn ? bulletDepth(caretLine) : 0

  return (
    <div className={`note-editor ${props.className ?? ''}`} onFocus={props.onFocus} onBlur={props.onBlur}>
      {props.showTitle && (
        <input
          id={props.titleId}
          className="note-title-input"
          value={props.title}
          onChange={(e) => props.onTitle(e.target.value)}
          placeholder="Title (optional)"
          aria-label="Note title"
          maxLength={120}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return
            if (e.key === 'Enter') {
              e.preventDefault()
              body.current?.focus()
            }
            if (e.key === 'Escape' && props.onCancel) props.onCancel()
          }}
        />
      )}
      <textarea
        ref={body}
        id={props.bodyId}
        className="note-body-input"
        autoFocus={props.autoFocus}
        rows={props.rows ?? 2}
        value={props.text}
        onChange={(e) => props.onText(e.target.value)}
        placeholder={props.placeholder}
        aria-label="Note"
        onKeyDown={onBodyKey}
        onSelect={onSelect}
      />
      {props.showTitle && (
        <div className="note-editor-bar">
          <button
            type="button"
            className={`btn small list-btn ${listOn ? 'on' : ''}`}
            // Keep focus (and the selection) in the body while clicking.
            onMouseDown={(e) => e.preventDefault()}
            onClick={toggle}
            title="Bulleted list (Ctrl+Shift+8). Or start a line with “- ”"
            aria-pressed={listOn}
          >
            <span aria-hidden>•</span> List
          </button>
          {listOn && (
            <span className="indent-btns" role="group" aria-label="Nesting">
              <button
                type="button"
                className="btn small indent-btn"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => indent(-1)}
                disabled={depth === 0}
                title="Move out a level (Shift+Tab)"
                aria-label="Move out a level"
              >
                <IndentIcon out />
              </button>
              <button
                type="button"
                className="btn small indent-btn"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => indent(1)}
                disabled={depth >= MAX_DEPTH}
                title="Make a sub-point (Tab)"
                aria-label="Make a sub-point"
              >
                <IndentIcon />
              </button>
            </span>
          )}
          <span className="muted hint hide-touch">{listOn ? 'Tab to nest' : 'Enter to save · Shift+Enter new line'}</span>
          <span className="spacer" />
          {props.footer}
        </div>
      )}
    </div>
  )
}

/** A note's body: plain paragraphs, with bullet lines shown as a list and web addresses as links. */
export function NoteBody({ text }: { text: string }) {
  const blocks = parseNote(text)
  if (!blocks.length) return null
  return (
    <div className="note-body">
      {blocks.map((b, i) =>
        b.kind === 'p' ? (
          <p key={i}>
            <NoteText text={b.text} />
          </p>
        ) : (
          <BulletList key={i} items={b.items} />
        ),
      )}
    </div>
  )
}

function BulletList({ items }: { items: ListItem[] }) {
  return (
    <ul>
      {items.map((it, j) => (
        <li key={j}>
          <NoteText text={it.text} />
          {it.children.length > 0 && <BulletList items={it.children} />}
        </li>
      ))}
    </ul>
  )
}

/** Lines with an arrow pointing in (or out), the usual indent glyph. */
function IndentIcon({ out }: { out?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 4h7M7 8h7M7 12h7" />
      {out ? <path d="M4.5 5.5 2 8l2.5 2.5" /> : <path d="M2 5.5 4.5 8 2 10.5" />}
    </svg>
  )
}
