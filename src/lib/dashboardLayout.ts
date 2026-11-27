import { store, usePersisted } from './storage'

/**
 * How the dashboard is arranged: columns of tiles, how wide each column is,
 * and which tiles are hidden.
 *
 * Kept per device (the ui: prefix keeps it out of sync), like folded tiles:
 * a phone and a big monitor want different arrangements.
 *
 * Hidden tiles keep their spot in `columns`, so showing one again puts it
 * back where it was. Tiles the layout doesn't know yet (a new module) are
 * added to their default column the first time they're seen, so new modules
 * show up without any migration.
 */
export interface DashLayout {
  /** Tile ids per column, top to bottom. Left to right. */
  columns: string[][]
  /** Relative column widths (fr), one per column. Missing means the default widths. */
  widths?: number[]
  /** Tiles taken off the dashboard. */
  hidden: string[]
}

export const LAYOUT_KEY = 'ui:dashboard'
export const MAX_COLUMNS = 4
/** Narrowest a column gets before the dashboard drops to fewer columns. */
export const MIN_COLUMN = 320
/** Narrowest a column can be dragged to. */
export const MIN_RESIZE = 280

export interface ModuleSlot {
  id: string
  /** Column it starts in (0-based), for the default layout and for modules added later. */
  column: number
  /** New to an existing layout: goes on top of its column instead of the bottom. */
  first?: boolean
}

export function defaultLayout(mods: ModuleSlot[], hidden: string[] = []): DashLayout {
  const n = Math.max(1, ...mods.map((m) => m.column + 1))
  const columns: string[][] = Array.from({ length: n }, () => [])
  for (const m of mods) columns[m.column].push(m.id)
  return { columns, hidden }
}

/** Drops unknown ids and duplicates, and adds modules the layout hasn't seen. */
export function normalize(l: DashLayout | undefined, mods: ModuleSlot[], fallback: () => DashLayout): DashLayout {
  if (!l || !Array.isArray(l.columns) || !l.columns.length) return fallback()
  const known = new Set(mods.map((m) => m.id))
  const seen = new Set<string>()
  const columns = l.columns.slice(0, MAX_COLUMNS).map((c) =>
    (Array.isArray(c) ? c : []).filter((id) => {
      if (!known.has(id) || seen.has(id)) return false
      seen.add(id)
      return true
    }),
  )
  for (const m of mods) {
    if (seen.has(m.id)) continue
    const col = columns[Math.min(m.column, columns.length - 1)]
    if (m.first) col.unshift(m.id)
    else col.push(m.id)
  }
  const widths = Array.isArray(l.widths) && l.widths.length === columns.length && l.widths.every((w) => w > 0) ? l.widths : undefined
  const hidden = (Array.isArray(l.hidden) ? l.hidden : []).filter((id) => known.has(id))
  return { columns, widths, hidden }
}

/** How many columns fit a container this wide. */
export function fitColumns(width: number, gap: number) {
  return Math.max(1, Math.floor((width + gap) / (MIN_COLUMN + gap)))
}

/**
 * Squeezes `n` columns into `k` (k < n) for narrower screens, keeping
 * neighbours together: 3 into 2 puts the first two columns on the left and
 * the third on the right; anything into 1 is the reading order.
 * Returns, for each shown column, the saved columns it holds.
 */
export function groupColumns(n: number, k: number): number[][] {
  const groups: number[][] = Array.from({ length: Math.min(n, k) }, () => [])
  for (let j = 0; j < n; j++) groups[Math.floor((j * groups.length) / n)].push(j)
  return groups
}

/**
 * Moves a tile to `index` in a shown column (a group of saved columns),
 * counting only the visible tiles there. It lands right after the visible
 * tile above it, in that tile's saved column, so the arrangement on a wide
 * screen stays sensible after reordering on a phone.
 */
export function moveTile(l: DashLayout, id: string, group: number[], index: number): DashLayout {
  const hidden = new Set(l.hidden)
  const columns = l.columns.map((c) => c.filter((x) => x !== id))
  const visible = group.flatMap((ci) => columns[ci].filter((x) => !hidden.has(x)))
  const prev = index > 0 ? visible[Math.min(index, visible.length) - 1] : undefined
  if (prev) {
    const ci = columns.findIndex((c) => c.includes(prev))
    columns[ci].splice(columns[ci].indexOf(prev) + 1, 0, id)
  } else {
    // Top of the group: before its first visible tile, or at the very top of its first column.
    const first = visible[0]
    const ci = first ? columns.findIndex((c) => c.includes(first)) : group[0]
    const at = first ? columns[ci].indexOf(first) : 0
    columns[ci].splice(at, 0, id)
  }
  return { ...l, columns }
}

export function addColumn(l: DashLayout): DashLayout {
  if (l.columns.length >= MAX_COLUMNS) return l
  const widths = l.widths ? [...l.widths, l.widths.reduce((a, b) => a + b, 0) / l.widths.length] : undefined
  return { ...l, columns: [...l.columns, []], widths }
}

/** Removes a column. Any hidden tiles in it move to the column on its left (or right). */
export function removeColumn(l: DashLayout, ci: number): DashLayout {
  if (l.columns.length <= 1) return l
  const columns = l.columns.map((c) => [...c])
  const [gone] = columns.splice(ci, 1)
  columns[Math.max(0, ci - 1)].push(...gone)
  const widths = l.widths ? l.widths.filter((_, i) => i !== ci) : undefined
  return { ...l, columns, widths }
}

export function setHidden(l: DashLayout, id: string, hide: boolean): DashLayout {
  const hidden = l.hidden.filter((x) => x !== id)
  if (hide) hidden.push(id)
  return { ...l, hidden }
}

export function useDashLayout(mods: ModuleSlot[], legacyHidden: () => string[]) {
  const [raw, setRaw] = usePersisted<DashLayout | undefined>(LAYOUT_KEY, undefined)
  const fallback = () => defaultLayout(mods, legacyHidden())
  const layout = normalize(raw, mods, fallback)
  const update = (fn: (l: DashLayout) => DashLayout) => setRaw(fn(normalize(store.get<DashLayout | undefined>(LAYOUT_KEY, undefined), mods, fallback)))
  return [layout, update] as const
}
