import { useState, type CSSProperties, type ReactNode } from 'react'
import { addDays, fmt, type DayKey } from '../lib/dates'
import {
  DAYS_AHEAD,
  SETUP_GUIDE,
  eventDays,
  eventsOn,
  looksLikeClientId,
  stateAt,
  timeLabel,
  untilLabel,
  useGcal,
  type CalEvent,
  type Gcal,
} from '../lib/gcal'
import { Card, type FocusProps } from './Card'

const dayName = (d: DayKey, today: DayKey) =>
  d === today ? 'Today' : d === addDays(today, 1) ? 'Tomorrow' : fmt(d, { weekday: 'long' })

/** Events shown under tomorrow on the tile before "N more". */
const TOMORROW_MAX = 4

/**
 * Google Calendar: today's events and tomorrow's first few on the tile, the
 * next week by day in the full view (#/calendar). Read-only; tapping an
 * event opens it in Google Calendar.
 */
export function CalendarPanel({ today, ...focus }: { today: DayKey } & FocusProps) {
  const g = useGcal(today)
  const connected = g.status === 'ready' || g.status === 'expired'
  const todays = eventsOn(g.events, today)
  const upcoming = todays.filter((e) => !e.allDay && stateAt(e, g.now) !== 'past')

  const summary = !connected
    ? null
    : (() => {
        const cur = upcoming.find((e) => stateAt(e, g.now) === 'now')
        const nxt = upcoming.find((e) => stateAt(e, g.now) === 'later')
        if (cur) return `Now: ${cur.title}`
        if (nxt) return `${timeLabel(nxt.start)} ${nxt.title}`
        return todays.length ? 'Done for today' : 'Nothing today'
      })()

  return (
    <Card
      title="Calendar"
      className={`calendar ${focus.expanded ? 'cal-full' : ''}`}
      id="calendar"
      foldId="calendar"
      foldedSummary={summary}
      {...focus}
      actions={connected && <RefreshButton g={g} />}
    >
      {g.status === 'no-client' && <ClientIdSetup g={g} intro />}
      {g.status === 'signed-out' && <ConnectPrompt g={g} />}
      {connected &&
        (focus.expanded ? (
          <>
            <CalendarFilter g={g} />
            <div className="cal-week">
              {Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(today, i)).map((d) => (
                <section key={d} className="cal-day">
                  <h3>
                    {dayName(d, today)}
                    <span className="muted"> {fmt(d, { month: 'short', day: 'numeric' })}</span>
                  </h3>
                  <DayList events={eventsOn(g.events, d)} day={d} today={today} now={g.now} showPast />
                </section>
              ))}
            </div>
            <AccountLine g={g} />
          </>
        ) : (
          <TileBody g={g} today={today} onMore={focus.onExpand} />
        ))}
      {g.error && <p className="cal-error small">{g.error}</p>}
      {connected && <SyncedLine g={g} />}
    </Card>
  )
}

function TileBody({ g, today, onMore }: { g: Gcal; today: DayKey; onMore?: () => void }) {
  const [showPast, setShowPast] = useState(false)
  const tomorrow = addDays(today, 1)
  const todays = eventsOn(g.events, today)
  const past = todays.filter((e) => !e.allDay && stateAt(e, g.now) === 'past').length
  const next = eventsOn(g.events, tomorrow)
  return (
    <div className="cal-tile">
      <div className="cal-day-head">
        <h3>Today</h3>
        {past > 0 && (
          <button className="link-btn small" onClick={() => setShowPast((v) => !v)} aria-expanded={showPast}>
            {showPast ? 'Hide earlier' : `${past} earlier`}
          </button>
        )}
      </div>
      <DayList events={todays} day={today} today={today} now={g.now} showPast={showPast} />
      <div className="cal-day-head">
        <h3>Tomorrow</h3>
      </div>
      <DayList events={next.slice(0, TOMORROW_MAX)} day={tomorrow} today={today} now={g.now} />
      {next.length > TOMORROW_MAX && (
        <button className="link-btn small cal-more" onClick={onMore}>
          {next.length - TOMORROW_MAX} more tomorrow ›
        </button>
      )}
    </div>
  )
}

/** One day's events: all-day ones first as a strip, then timed ones by start. */
function DayList({ events, day, today, now, showPast }: { events: CalEvent[]; day: DayKey; today: DayKey; now: number; showPast?: boolean }) {
  const allDay = events.filter((e) => e.allDay)
  const timed = events.filter((e) => !e.allDay)
  const isToday = day === today
  const visible = isToday && !showPast ? timed.filter((e) => stateAt(e, now) !== 'past') : timed
  // The first event still to come today gets a countdown; a line marks "now" between past and upcoming.
  const nextKey = isToday ? timed.find((e) => stateAt(e, now) === 'later')?.key : undefined
  const anyNow = isToday && timed.some((e) => stateAt(e, now) === 'now')
  const nowLineBefore = isToday && showPast && !anyNow ? (visible.find((e) => stateAt(e, now) === 'later')?.key ?? 'end') : null

  if (!events.length) return <p className="empty cal-empty">Nothing scheduled</p>
  return (
    <>
      {allDay.length > 0 && (
        <ul className="cal-allday">
          {allDay.map((e) => {
            const days = eventDays(e)
            const n = days.indexOf(day)
            return (
              <li key={e.key}>
                <EventLink e={e} className="cal-allday-item">
                  <span className="cal-dot" style={{ '--cal': e.color } as CSSProperties} aria-hidden />
                  <span className="cal-title">{e.title}</span>
                  {days.length > 1 && <span className="muted small">{`day ${n + 1} of ${days.length}`}</span>}
                </EventLink>
              </li>
            )
          })}
        </ul>
      )}
      {visible.length > 0 && (
        <ul className="cal-list">
          {visible.map((e) => (
            <li key={e.key}>
              {nowLineBefore === e.key && <NowLine now={now} />}
              <EventRow e={e} day={day} now={now} isToday={isToday} isNext={e.key === nextKey} />
            </li>
          ))}
          {nowLineBefore === 'end' && (
            <li>
              <NowLine now={now} />
            </li>
          )}
        </ul>
      )}
      {isToday && !visible.length && timed.length > 0 && <p className="empty cal-empty">Nothing else today</p>}
    </>
  )
}

function NowLine({ now }: { now: number }) {
  return (
    <div className="cal-now-line" role="separator" aria-label={`Now, ${timeLabel(new Date(now).toISOString())}`}>
      <span>{timeLabel(new Date(now).toISOString())}</span>
    </div>
  )
}

function EventRow({ e, day, now, isToday, isNext }: { e: CalEvent; day: DayKey; now: number; isToday: boolean; isNext: boolean }) {
  const state = isToday ? stateAt(e, now) : 'later'
  // An overnight event shows on its second day as "until 2 AM".
  const startsEarlier = eventDays(e)[0] < day
  const endsLater = eventDays(e).slice(-1)[0] > day
  const when = startsEarlier ? 'Until' : timeLabel(e.start)
  const until = startsEarlier ? timeLabel(e.end) : endsLater ? 'overnight' : timeLabel(e.end)
  const meta =
    state === 'now' ? `Now · until ${timeLabel(e.end)}` : isNext ? untilLabel(e.start, now) : e.location
  return (
    <EventLink e={e} className={`cal-ev is-${state} ${isNext ? 'is-next' : ''} ${e.declined ? 'is-declined' : ''}`}>
      <span className="cal-time">
        <span>{when}</span>
        <span className="muted">{until}</span>
      </span>
      <span className="cal-bar" style={{ '--cal': e.color } as CSSProperties} aria-hidden />
      <span className="cal-main">
        <span className="cal-title">{e.title}</span>
        {meta && <span className={`cal-meta ${state === 'now' || isNext ? 'hot' : ''}`}>{meta}</span>}
        {state === 'now' && e.location && <span className="cal-meta">{e.location}</span>}
      </span>
      {e.meet && (state === 'now' || isNext) && (
        <a
          className="chip small cal-join"
          href={e.meet}
          target="_blank"
          rel="noreferrer"
          onClick={(ev) => ev.stopPropagation()}
        >
          Join
        </a>
      )}
    </EventLink>
  )
}

function EventLink({ e, className, children }: { e: CalEvent; className: string; children: ReactNode }) {
  return e.link ? (
    <a className={className} href={e.link} target="_blank" rel="noreferrer" title="Open in Google Calendar">
      {children}
    </a>
  ) : (
    <div className={className}>{children}</div>
  )
}

function RefreshButton({ g }: { g: Gcal }) {
  return g.status === 'expired' ? (
    <button className="chip small cal-refresh-chip" onClick={g.refresh} disabled={g.busy} title="Sign-in lasts an hour. One tap renews it.">
      {g.busy ? 'Refreshing…' : '↻ Refresh'}
    </button>
  ) : (
    <button className={`icon-btn subtle cal-refresh ${g.busy ? 'spin' : ''}`} onClick={g.refresh} disabled={g.busy} aria-label="Refresh calendar" title="Refresh">
      ↻
    </button>
  )
}

function SyncedLine({ g }: { g: Gcal }) {
  if (!g.fetchedAt) return g.busy ? <p className="empty">Loading your calendar…</p> : null
  const at = timeLabel(new Date(g.fetchedAt).toISOString())
  const day = new Date(g.fetchedAt).toDateString() === new Date(g.now).toDateString() ? '' : ` ${new Date(g.fetchedAt).toLocaleDateString(undefined, { weekday: 'short' })}`
  return <p className="cal-synced muted small">{g.status === 'expired' ? `Last updated${day} ${at}. Refresh to check for changes.` : `Updated ${at}`}</p>
}

function CalendarFilter({ g }: { g: Gcal }) {
  if (g.calendars.length < 2) return null
  return (
    <div className="chips cal-filter" aria-label="Calendars shown">
      {g.calendars.map((c) => (
        <button
          key={c.id}
          className={`chip small ${g.hidden.has(c.id) ? '' : 'on'}`}
          style={{ '--chip': c.color } as CSSProperties}
          aria-pressed={!g.hidden.has(c.id)}
          onClick={() => g.toggleCalendar(c.id)}
        >
          <span className="dot" aria-hidden />
          {c.name}
        </button>
      ))}
    </div>
  )
}

function AccountLine({ g }: { g: Gcal }) {
  return (
    <p className="cal-account muted small">
      {g.email ? `Signed in as ${g.email}. ` : ''}
      <a href="https://calendar.google.com" target="_blank" rel="noreferrer">
        Open Google Calendar ↗
      </a>
    </p>
  )
}

function ConnectPrompt({ g }: { g: Gcal }) {
  return (
    <div className="cal-setup">
      <p className="empty">See today’s events from Google Calendar here. Read-only: the app can’t change your calendar.</p>
      <div className="row">
        <button className="btn primary" onClick={g.connect} disabled={g.busy}>
          {g.busy ? 'Connecting…' : 'Connect Google Calendar'}
        </button>
      </div>
    </div>
  )
}

/** Paste the OAuth client ID. Shown on the tile until there is one, and in Settings. */
export function ClientIdSetup({ g, intro }: { g: Gcal; intro?: boolean }) {
  const [draft, setDraft] = useState(g.pastedClientId)
  const ok = looksLikeClientId(draft)
  return (
    <div className="cal-setup">
      {intro && (
        <p className="empty">
          Show your Google Calendar here. It needs a one-time setup in Google Cloud (about 15 minutes), then you paste the client ID it gives you below.
        </p>
      )}
      <form
        className="quick-add"
        onSubmit={(e) => {
          e.preventDefault()
          if (ok) g.setClientId(draft)
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="1234…apps.googleusercontent.com"
          aria-label="Google OAuth client ID"
          spellCheck={false}
          autoComplete="off"
        />
        <button type="submit" className="btn primary" disabled={!ok || draft.trim() === g.pastedClientId}>
          Save
        </button>
      </form>
      {draft.trim() && !ok && <p className="cal-error small">That doesn’t look like a client ID. It ends in .apps.googleusercontent.com.</p>}
      <p className="small">
        <a href={SETUP_GUIDE} target="_blank" rel="noreferrer">
          Setup steps ↗
        </a>
      </p>
    </div>
  )
}

/** Settings → Google Calendar. */
export function CalendarSettings({ today }: { today: DayKey }) {
  const g = useGcal(today)
  const connected = g.status === 'ready' || g.status === 'expired'
  return (
    <div className="cal-settings">
      <p className="muted small">
        {connected
          ? `Connected${g.email ? ` as ${g.email}` : ''}. Read-only. The client ID syncs to your other devices; each device signs in once.`
          : g.clientId
            ? 'Client ID saved. Connect to show your events on the Calendar tile.'
            : 'Paste the OAuth client ID from your Google Cloud project.'}
      </p>
      {!connected && <ClientIdSetup g={g} />}
      <div className="row">
        {g.status === 'signed-out' && (
          <button className="btn primary" onClick={g.connect} disabled={g.busy}>
            Connect Google Calendar
          </button>
        )}
        {connected && (
          <button className="btn" onClick={g.disconnect}>
            Disconnect this device
          </button>
        )}
      </div>
      {g.error && <p className="cal-error small">{g.error}</p>}
    </div>
  )
}
