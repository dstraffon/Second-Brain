import type { DayKey } from './lib/dates'

export type TaskScope = 'day' | 'week' | 'month' | 'general'

export interface Task {
  id: string
  title: string
  scope: TaskScope
  repeatDaily: boolean
  createdAt: string // ISO
  createdOn: DayKey
  /** Day a one-off task was checked off. */
  completedOn: DayKey | null
  /** Days a repeating task was checked off. */
  completions: DayKey[]
  /** Optional due day. When set, it decides which list the task shows in. Missing on older saved tasks. */
  dueOn?: DayKey | null
  /** Position set by dragging, within the task's list. Lower comes first. Missing until a task is dragged. */
  order?: number
}

export interface Category {
  id: string
  name: string
  color: string
}

export interface Note {
  id: string
  /** Optional heading. Notes saved before titles existed simply have none. */
  title?: string
  /** Plain text; lines starting with "- " show as bullets. May be empty when there's a title. */
  text: string
  categoryId: string | null
  createdAt: string
  pinned?: boolean
  /** Folded down to its title on the dashboard. Only titled notes fold. */
  collapsed?: boolean
}

export type LinkKind = 'video' | 'article'

export interface LinkItem {
  id: string
  url: string
  title: string
  kind: LinkKind
  categoryId: string | null
  createdAt: string
  /** When it was last marked done. Kept as history once it's off the queue. */
  readAt: string | null
  /** On the read / watch later queue. Missing on links saved before the library existed: then it's !readAt (see isLater). */
  later?: boolean
  /** A short note on why it was saved. */
  note?: string
  /** Pinned links sit at the top of their column / list. */
  pinned?: boolean
  /** Position set by dragging within a column. Lower comes first. New links get -Date.now() so they land on top. */
  order?: number
  /** Preview image, site icon and description from the link lookup. */
  image?: string
  icon?: string
  description?: string
  /** When a preview lookup last ran, found or not, so it isn't retried on every visit or device. */
  previewAt?: string
  /** Which version of the lookup last ran. Bumping PREVIEW_VERSION retries links that came back without an image. */
  previewV?: number
}

export interface Streak {
  id: string
  name: string
  createdAt: string
  checkins: DayKey[]
  /** When true, missing a day sets the streak back to 0. Off by default. */
  autoReset: boolean
  /** Check-ins before this day don't count (set by a manual reset). */
  countFrom: DayKey | null
  best: number
  /** Days added on top of the logged days, from "Set length". Counted from countFrom. Missing on older saved streaks. */
  bonus?: number
}

export type Theme = 'dark' | 'light'

export interface Settings {
  showQuote: boolean
  /** Color theme. Missing on older saved settings, which means dark. */
  theme?: Theme
}

export interface WeekReflection {
  wins: string
  blockers: string
  focus: string
}

/** A to-do item inside a project list. Simpler than a Task: no dates, scopes or repeats. */
export interface TodoItem {
  id: string
  title: string
  done: boolean
  createdAt: string
  /** How far it's nested under the item above it: 1 is a sub-to-do. Missing means top level. */
  depth?: number
}

export interface TodoList {
  id: string
  title: string
  /**
   * Open and done items, in the order they were arranged. A top-level item and the
   * deeper ones after it form a group; groups whose top item is done show last.
   */
  items: TodoItem[]
  createdAt: string
}

/** A project keeps its own lists and notes. They only show inside the project. */
export interface Project {
  id: string
  name: string
  color: string
  createdAt: string
  lists: TodoList[]
  /** Same shape as dashboard notes; categoryId stays null. */
  notes: Note[]
  /** Share of the width given to the to-do lists (0 to 1), set by dragging the divider. Missing means the default. */
  split?: number
  /** When the project was marked done (ISO). Resolved projects leave the tile and the main list until reopened. */
  resolvedAt?: string
}
