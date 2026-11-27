import type { ReactNode } from 'react'
import type { DayKey } from '../lib/dates'
import type { FocusProps } from '../components/Card'
import { TasksPanel } from '../components/TasksPanel'
import { NotesPanel } from '../components/NotesPanel'
import { FocusQuote } from '../components/FocusQuote'
import { ProjectsPanel } from '../components/ProjectsPanel'
import { StreaksPanel } from '../components/StreaksPanel'
import { LinksPanel } from '../components/LinksPanel'
import { CalendarPanel } from '../components/CalendarPanel'

/** What a module gets from the app when it renders. */
export interface ModuleContext {
  today: DayKey
  /** Props for the tile's header: open the full view at #/<id>, or close it. */
  focus: FocusProps
  openProject: (id: string) => void
}

/**
 * One dashboard module. To add a module, write its tile component and add an
 * entry here: it shows up on the dashboard (in `column`), in Settings →
 * Dashboard, in the arrange mode, and, with `full`, at #/<id>.
 */
export interface ModuleDef {
  id: string
  /** Name in Settings and on the tile's handle while arranging. */
  name: string
  /** One line for Settings. */
  blurb: string
  /** Column it starts in on a wide screen (0-based). Also where it lands the first time an existing layout sees it. */
  column: number
  /** Lands at the top of its column, not the bottom, the first time an existing layout sees it. */
  first?: boolean
  /** Grows to fill the rest of its column when it's the last tile there (long lists like Tasks and Notes). */
  stretch?: boolean
  /** Quick key that focuses `inputId` (folded tiles unfold first; hidden tiles open their full view). */
  key?: string
  inputId?: string
  tile: (ctx: ModuleContext) => ReactNode
  /** The full view at #/<id>. Tiles without one have no full view. */
  full?: (ctx: ModuleContext) => ReactNode
}

export const MODULES: ModuleDef[] = [
  {
    id: 'tasks',
    name: 'Tasks',
    blurb: 'Today, this week, this month and someday',
    column: 0,
    stretch: true,
    key: 't',
    inputId: 'quick-task',
    tile: (c) => <TasksPanel today={c.today} {...c.focus} />,
    full: (c) => <TasksPanel today={c.today} {...c.focus} />,
  },
  {
    id: 'notes',
    name: 'Notes',
    blurb: 'Quick notes by category',
    column: 1,
    stretch: true,
    key: 'n',
    inputId: 'quick-note',
    tile: (c) => <NotesPanel {...c.focus} />,
    full: (c) => <NotesPanel {...c.focus} />,
  },
  {
    id: 'calendar',
    name: 'Calendar',
    blurb: 'Today and tomorrow from Google Calendar',
    column: 2,
    first: true,
    tile: (c) => <CalendarPanel today={c.today} {...c.focus} />,
    full: (c) => <CalendarPanel today={c.today} {...c.focus} />,
  },
  {
    id: 'quote',
    name: 'Focus quote',
    blurb: 'A short line for the day',
    column: 2,
    tile: (c) => <FocusQuote today={c.today} />,
  },
  {
    id: 'projects',
    name: 'Projects',
    blurb: 'Lists and notes per project',
    column: 2,
    key: 'p',
    inputId: 'quick-project',
    tile: (c) => <ProjectsPanel {...c.focus} onOpen={c.openProject} />,
    full: (c) => <ProjectsPanel {...c.focus} onOpen={c.openProject} />,
  },
  {
    id: 'streaks',
    name: 'Streaks',
    blurb: 'Habits and how long they’ve run',
    column: 2,
    tile: (c) => <StreaksPanel today={c.today} {...c.focus} />,
    full: (c) => <StreaksPanel today={c.today} {...c.focus} />,
  },
  {
    id: 'links',
    name: 'Link library',
    blurb: 'Read and watch later',
    column: 2,
    key: 'l',
    inputId: 'quick-link',
    tile: (c) => <LinksPanel {...c.focus} />,
    full: (c) => <LinksPanel {...c.focus} />,
  },
]

export const moduleById = (id: string) => MODULES.find((m) => m.id === id)
