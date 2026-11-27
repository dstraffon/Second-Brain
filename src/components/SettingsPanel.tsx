import { useRef, useState } from 'react'
import type { Settings } from '../types'
import { store } from '../lib/storage'
import { syncConfigured } from '../lib/sync/config'
import { SyncSettings } from './SyncSettings'
import { CalendarSettings } from './CalendarPanel'
import { todayKey } from '../lib/dates'
import { confirmDelete } from '../lib/confirm'

export interface TileSetting {
  id: string
  name: string
  blurb: string
  shown: boolean
}

export function SettingsPanel(props: {
  settings: Settings
  onChange: (s: Settings) => void
  onClose: () => void
  /** Every dashboard module, for showing and hiding them. */
  tiles: TileSetting[]
  onShowTile: (id: string, show: boolean) => void
  /** Closes Settings and starts arranging the dashboard. */
  onArrange: () => void
}) {
  const { settings: s } = props
  const file = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState('')

  const exportData = () => {
    const blob = new Blob([JSON.stringify({ app: 'second-brain', version: 1, data: store.exportAll() }, null, 2)], {
      type: 'application/json',
    })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `second-brain-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const importData = async (f: File) => {
    try {
      const parsed = JSON.parse(await f.text())
      if (parsed?.app !== 'second-brain' || typeof parsed.data !== 'object') throw new Error()
      store.importAll(parsed.data)
      setMsg('Backup restored.')
    } catch {
      setMsg('That file isn’t a Second Brain backup.')
    }
  }

  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <div className="sheet" role="dialog" aria-label="Settings" onClick={(e) => e.stopPropagation()}>
        <header className="card-head">
          <h2>Settings</h2>
          <button className="icon-btn subtle" aria-label="Close settings" onClick={props.onClose}>
            ×
          </button>
        </header>
        <h3>Appearance</h3>
        <label className="switch">
          <input
            type="checkbox"
            checked={s.theme === 'light'}
            onChange={(e) => props.onChange({ ...s, theme: e.target.checked ? 'light' : 'dark' })}
          />
          <span>Light mode</span>
        </label>

        <h3>Dashboard</h3>
        <p className="muted small">Choose which tiles show. Hidden tiles keep their data and their spot. Saved on this device.</p>
        <ul className="tile-switches">
          {props.tiles.map((t) => (
            <li key={t.id}>
              <label className="switch">
                <input type="checkbox" checked={t.shown} onChange={(e) => props.onShowTile(t.id, e.target.checked)} />
                <span>
                  {t.name}
                  <span className="muted small tile-blurb">{t.blurb}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <div className="row">
          <button className="btn" onClick={props.onArrange}>
            Arrange and resize tiles
          </button>
        </div>

        <h3>Google Calendar</h3>
        <CalendarSettings today={todayKey()} />

        <h3>{syncConfigured() ? 'Sync' : 'Your data'}</h3>
        <SyncSettings />
        {syncConfigured() && <h3>Backup</h3>}
        <p className="muted small">
          A backup file has everything, including your projects with their lists and notes.
        </p>
        <div className="row">
          <button className="btn" onClick={exportData}>
            Export backup
          </button>
          <button className="btn" onClick={() => file.current?.click()}>
            Import backup
          </button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              confirmDelete({
                title: 'Replace everything with this backup?',
                name: f.name,
                detail: 'Your current tasks, notes, links, streaks and projects are replaced by what’s in the file.',
                action: 'Replace',
                footnote: 'Export a backup first if you might want today’s data back.',
                onConfirm: () => void importData(f),
              })
            }}
          />
        </div>
        {msg && <p className="small">{msg}</p>}

        <h3>Shortcuts</h3>
        <p className="muted small">
          <kbd>t</kbd> new task · <kbd>n</kbd> new note · <kbd>l</kbd> new link · <kbd>p</kbd> new project · <kbd>r</kbd> weekly review · <kbd>Esc</kbd> back
        </p>
      </div>
    </div>
  )
}
