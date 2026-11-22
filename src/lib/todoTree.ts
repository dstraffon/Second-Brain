import type { TodoItem } from '../types'

/* ---------- nested to-dos ----------
 * Items stay one flat array; `depth` says how far each sits under the item
 * above it. That keeps sync merging item by item and old lists unchanged.
 */

/** Deepest a to-do can go: a sub-to-do of a sub-to-do. */
export const TODO_MAX_DEPTH = 2

export const depthOf = (i: TodoItem) => i.depth ?? 0

const withDepth = (i: TodoItem, d: number): TodoItem => {
  if (d === depthOf(i)) return i
  const { depth: _, ...rest } = i
  return d ? { ...rest, depth: d } : rest
}

/** Each item can sit at most one level below the one before it; the first is top level. */
export function normalizeDepths(items: TodoItem[]): TodoItem[] {
  let prev = -1
  return items.map((i) => {
    const d = Math.max(0, Math.min(depthOf(i), prev + 1, TODO_MAX_DEPTH))
    prev = d
    return withDepth(i, d)
  })
}

/** A top-level item followed by everything nested under it. */
export function todoGroups(items: TodoItem[]): TodoItem[][] {
  const groups: TodoItem[][] = []
  for (const i of items) {
    if (depthOf(i) === 0 || !groups.length) groups.push([i])
    else groups[groups.length - 1].push(i)
  }
  return groups
}

/** Index just past the last item nested under items[idx]. */
const subtreeEnd = (items: TodoItem[], idx: number) => {
  const d = depthOf(items[idx])
  let j = idx + 1
  while (j < items.length && depthOf(items[j]) > d) j++
  return j
}

/** Moves an item (and what's nested under it) one level in or out. */
export function indentTodo(items: TodoItem[], id: string, dir: 1 | -1): TodoItem[] {
  const idx = items.findIndex((i) => i.id === id)
  if (idx < 0 || !canIndentTodo(items, id, dir)) return items
  const end = subtreeEnd(items, idx)
  return normalizeDepths(items.map((i, k) => (k >= idx && k < end ? withDepth(i, depthOf(i) + dir) : i)))
}

export function canIndentTodo(items: TodoItem[], id: string, dir: 1 | -1) {
  const idx = items.findIndex((i) => i.id === id)
  if (idx < 0) return false
  const d = depthOf(items[idx])
  if (dir === -1) return d > 0
  if (idx === 0 || d >= depthOf(items[idx - 1]) + 1) return false
  // The whole subtree has to fit under the limit.
  const end = subtreeEnd(items, idx)
  return items.slice(idx, end).every((i) => depthOf(i) + 1 <= TODO_MAX_DEPTH)
}

/** Removes items; anything nested under a removed item moves up a level instead of going with it. */
export function removeTodos(items: TodoItem[], ids: Set<string>): TodoItem[] {
  const out: TodoItem[] = []
  const stack: { depth: number; removed: boolean }[] = []
  for (const i of items) {
    const d = depthOf(i)
    while (stack.length && stack[stack.length - 1].depth >= d) stack.pop()
    const gone = ids.has(i.id)
    if (!gone) out.push(withDepth(i, d - stack.filter((s) => s.removed).length))
    stack.push({ depth: d, removed: gone })
  }
  return normalizeDepths(out)
}

/** Checks or unchecks an item. Checking one also checks everything nested under it. */
export function toggleTodo(items: TodoItem[], id: string): TodoItem[] {
  const idx = items.findIndex((i) => i.id === id)
  if (idx < 0) return items
  const done = !items[idx].done
  const end = done ? subtreeEnd(items, idx) : idx + 1
  return items.map((i, k) => (k >= idx && k < end ? { ...i, done } : i))
}
