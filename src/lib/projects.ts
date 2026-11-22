import type { Project, TodoItem, TodoList } from '../types'
import { usePersisted } from './storage'
import { uid } from './id'

export const PROJECT_COLORS = ['#7aa2f7', '#9ece6a', '#e0af68', '#bb9af7', '#f7768e', '#7dcfff', '#ff9e64', '#73daca']

export function newProject(name: string, existing: Project[]): Project {
  return {
    id: uid(),
    name,
    color: PROJECT_COLORS[existing.length % PROJECT_COLORS.length],
    createdAt: new Date().toISOString(),
    lists: [],
    notes: [],
  }
}

export const newList = (title: string): TodoList => ({ id: uid(), title, items: [], createdAt: new Date().toISOString() })
export const newItem = (title: string, depth = 0): TodoItem => ({ id: uid(), title, done: false, createdAt: new Date().toISOString(), ...(depth ? { depth } : {}) })

export function projectStats(p: Project) {
  let open = 0
  let done = 0
  for (const l of p.lists) for (const i of l.items) i.done ? done++ : open++
  return { open, done, total: open + done, lists: p.lists.length, notes: p.notes.length }
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** "2 lists · 3 notes", or a nudge when the project is empty. */
export function projectSummary(p: Project) {
  const s = projectStats(p)
  const parts = []
  if (s.lists) parts.push(plural(s.lists, 'list'))
  if (s.notes) parts.push(plural(s.notes, 'note'))
  return parts.length ? parts.join(' · ') : 'Empty so far'
}

export { plural }

/** Open projects in their saved order, and resolved ones newest first. */
export function splitProjects(projects: Project[]) {
  const active = projects.filter((p) => !p.resolvedAt)
  const resolved = projects.filter((p) => p.resolvedAt).sort((a, b) => b.resolvedAt!.localeCompare(a.resolvedAt!))
  return { active, resolved }
}

/** Mark done, or reopen. Reopening drops the field so the stored shape stays as it was. */
export const resolveProject = (p: Project): Project => ({ ...p, resolvedAt: new Date().toISOString() })
export const reopenProject = ({ resolvedAt: _, ...p }: Project): Project => p

/** "Nov 19", or "Nov 19, 2025" when it isn't this year. */
export function resolvedLabel(iso: string) {
  const d = new Date(iso)
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric'
  return d.toLocaleDateString(undefined, opts)
}

/** All projects, plus a helper to change one in place. */
export function useProjects() {
  const [projects, setProjects] = usePersisted<Project[]>('projects', [])
  const updateProject = (id: string, fn: (p: Project) => Project) => setProjects((ps) => ps.map((p) => (p.id === id ? fn(p) : p)))
  return { projects, setProjects, updateProject }
}
