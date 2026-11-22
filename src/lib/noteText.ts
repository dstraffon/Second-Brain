/**
 * Notes stay plain text. A line starting with "- ", "* " or "• " is a bullet,
 * and runs of bullet lines render as a list. Two spaces before the marker
 * (or a tab) make it a sub-point one level down. No markup is stored beyond
 * that, so old notes keep working and the text reads fine anywhere it is copied.
 */

const BULLET = /^\s*[-*•]\s+/
const BULLET_ONLY = /^\s*[-*•]\s*$/
/** Spaces per level of nesting. */
export const INDENT = '  '
/** Deepest level a sub-point can go (0 is a top-level bullet). */
export const MAX_DEPTH = 3

export const isBullet = (line: string) => BULLET.test(line)

/** How far a bullet line is nested: 0 for a top-level bullet. */
export function bulletDepth(line: string): number {
  const lead = line.match(/^[ \t]*/)![0].replace(/\t/g, INDENT)
  return Math.min(MAX_DEPTH, Math.floor(lead.length / INDENT.length))
}

export interface ListItem {
  text: string
  children: ListItem[]
}

export type NoteBlock = { kind: 'p'; text: string } | { kind: 'ul'; items: ListItem[] }

export function parseNote(text: string): NoteBlock[] {
  const blocks: NoteBlock[] = []
  let para: string[] = []
  let list: ListItem[] = []
  // The open item at each depth, so a sub-point lands under the bullet above it.
  let path: ListItem[] = []
  const flushPara = () => {
    // Trim blank lines at the edges of a paragraph but keep ones inside it.
    while (para.length && !para[0].trim()) para.shift()
    while (para.length && !para[para.length - 1].trim()) para.pop()
    if (para.length) blocks.push({ kind: 'p', text: para.join('\n') })
    para = []
  }
  const flushList = () => {
    if (list.length) blocks.push({ kind: 'ul', items: list })
    list = []
    path = []
  }
  for (const line of text.split('\n')) {
    if (BULLET_ONLY.test(line)) {
      // An empty bullet left behind while typing: drop it.
      continue
    } else if (isBullet(line)) {
      flushPara()
      // A sub-point can sit at most one level below the bullet before it.
      const depth = Math.min(bulletDepth(line), path.length)
      const item: ListItem = { text: line.replace(BULLET, ''), children: [] }
      if (depth === 0) list.push(item)
      else path[depth - 1].children.push(item)
      path = [...path.slice(0, depth), item]
    } else {
      flushList()
      para.push(line)
    }
  }
  flushPara()
  flushList()
  return blocks
}

/** Text used for searching: bullets without their markers. */
export const searchText = (n: { title?: string; text: string }) =>
  `${n.title ?? ''}\n${n.text.replace(/^\s*[-*•]\s+/gm, '')}`.toLowerCase()

export interface Edit {
  value: string
  start: number
  end: number
}

/** Turns the lines touched by the selection into bullets, or back into plain lines if they all are. */
export function toggleBullets(value: string, selStart: number, selEnd: number): Edit {
  const from = value.lastIndexOf('\n', selStart - 1) + 1
  const nl = value.indexOf('\n', selEnd)
  const to = nl === -1 ? value.length : nl
  const lines = value.slice(from, to).split('\n')
  const allBullets = lines.every((l) => isBullet(l) || (lines.length > 1 && !l.trim()))
  const next = lines.map((l) => {
    if (allBullets) return l.replace(BULLET, '')
    if (isBullet(l) || (lines.length > 1 && !l.trim())) return l
    return `- ${l.replace(/^\s+/, '')}`
  })
  const replaced = next.join('\n')
  const out = value.slice(0, from) + replaced + value.slice(to)
  if (lines.length === 1) {
    // Keep the caret where it was relative to the line's text.
    const shift = replaced.length - lines[0].length
    const caret = Math.max(from + (allBullets ? 0 : 2), selEnd + shift)
    return { value: out, start: caret, end: caret }
  }
  return { value: out, start: from, end: from + replaced.length }
}

/**
 * Tab / Shift+Tab: moves the bullet lines touched by the selection one level
 * in or out. A sub-point goes at most one level below the bullet above it.
 * Returns null when none of the lines is a bullet, so Tab keeps its usual job.
 */
export function indentBullets(value: string, selStart: number, selEnd: number, dir: 1 | -1): Edit | null {
  const from = value.lastIndexOf('\n', selStart - 1) + 1
  // A selection ending at the very start of a line doesn't take that line in.
  const endAt = selEnd > selStart && value[selEnd - 1] === '\n' ? selEnd - 1 : selEnd
  const nl = value.indexOf('\n', endAt)
  const to = nl === -1 ? value.length : nl
  const lines = value.slice(from, to).split('\n')
  if (!lines.some(isBullet)) return null
  const before = value.slice(0, from).split('\n')
  const above = from > 0 ? before[before.length - 2] : undefined
  let prevDepth = above !== undefined && isBullet(above) ? bulletDepth(above) : -1
  let startShift = 0
  let total = 0
  const next = lines.map((l, i) => {
    if (!isBullet(l)) {
      prevDepth = -1
      return l
    }
    const d = bulletDepth(l)
    const want = dir === 1 ? Math.min(d + 1, prevDepth + 1, MAX_DEPTH) : Math.max(0, d - 1)
    const target = Math.max(want, dir === 1 ? d : 0)
    const out = INDENT.repeat(target) + l.replace(/^[ \t]*/, '')
    const shift = out.length - l.length
    if (i === 0) startShift = shift
    total += shift
    prevDepth = target
    return out
  })
  const replaced = next.join('\n')
  const out = value.slice(0, from) + replaced + value.slice(to)
  if (lines.length === 1 || selStart === selEnd) {
    const caret = (p: number) => Math.max(from, p + startShift)
    return { value: out, start: caret(selStart), end: caret(selEnd) }
  }
  return { value: out, start: Math.max(from, selStart + startShift), end: selEnd + total }
}

/**
 * New line inside a list: carries the bullet on (at the same depth), or ends
 * the list when the current bullet is empty. An empty sub-point steps out a
 * level first. Returns null when the caret isn't on a bullet line.
 */
export function continueList(value: string, selStart: number, selEnd: number): Edit | null {
  const from = value.lastIndexOf('\n', selStart - 1) + 1
  const line = value.slice(from, selStart)
  if (BULLET_ONLY.test(line) && value.slice(selEnd).split('\n')[0].trim() === '') {
    if (bulletDepth(line) > 0) return indentBullets(value, selStart, selEnd, -1)
    const out = value.slice(0, from) + value.slice(selStart)
    return { value: out, start: from, end: from }
  }
  const m = line.match(BULLET)
  if (!m) return null
  const marker = m[0]
  const insert = '\n' + marker
  const out = value.slice(0, selStart) + insert + value.slice(selEnd)
  const caret = selStart + insert.length
  return { value: out, start: caret, end: caret }
}
