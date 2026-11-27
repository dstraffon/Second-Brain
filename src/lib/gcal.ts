import { useCallback, useEffect, useRef, useState } from 'react'
import { store, usePersisted } from './storage'
import { addDays, toKey, type DayKey } from './dates'

/**
 * Google Calendar, read-only, straight from the browser.
 *
 * Sign-in uses Google Identity Services' token model: a popup asks once for
 * read access to your calendars and hands back an access token that lasts
 * about an hour. There is no server, so there is no refresh token; when the
 * token runs out the tile keeps showing the last events it fetched and one
 * tap on Refresh gets a new token (no consent screen the second time).
 *
 * What's kept where:
 * - `gcal` (synced): the OAuth client ID and which calendars are switched off.
 *   Paste the client ID once and every device has it.
 * - `ui:gcal-token`, `ui:gcal-cache` (this device only): the access token and
 *   the last fetched events. A token never leaves the device it was made on.
 *
 * Setup steps for the Google Cloud side: docs/google-calendar-setup.md.
 */

const env = import.meta.env as Record<string, string | undefined>
/** A build can bake in a client ID (repository variable GOOGLE_CLIENT_ID); one pasted in the app wins. */
export const BUILD_CLIENT_ID = env.VITE_GOOGLE_CLIENT_ID || ''

export const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'
export const SETUP_GUIDE = 'https://github.com/dstraffon/second-brain/blob/main/docs/google-calendar-setup.md'
const API = 'https://www.googleapis.com/calendar/v3'
/** How far ahead to fetch. The tile shows today and tomorrow; the full view shows all of it. */
export const DAYS_AHEAD = 7
const REFETCH_MS = 10 * 60_000

export interface GcalSettings {
  clientId?: string
  /** Calendars switched off in the full view. */
  hidden?: string[]
}

interface Token {
  accessToken: string
  expiresAt: number
  /** The account's address (its primary calendar's id), used as a login hint so reconnecting skips the account picker. */
  email?: string
}

export interface CalInfo {
  id: string
  name: string
  color: string
  primary?: boolean
}

export interface CalEvent {
  /** Calendar id + event id: the same event can sit on two calendars. */
  key: string
  calendarId: string
  title: string
  /** ISO for timed events; YYYY-MM-DD for all-day ones. */
  start: string
  end: string
  allDay: boolean
  location?: string
  link?: string
  meet?: string
  color: string
  /** You said no to it. Shown struck through. */
  declined?: boolean
}

interface Cache {
  fetchedAt: number
  /** First day fetched. A cache from an earlier day is stale even if the token is fresh. */
  from: DayKey
  calendars: CalInfo[]
  events: CalEvent[]
}

const SETTINGS_KEY = 'gcal'
const TOKEN_KEY = 'ui:gcal-token'
const CACHE_KEY = 'ui:gcal-cache'

export const clientIdOf = (s: GcalSettings) => (s.clientId || BUILD_CLIENT_ID).trim()

/** Client IDs look like 1234-abc.apps.googleusercontent.com. */
export const looksLikeClientId = (s: string) => /^[\w-]+\.apps\.googleusercontent\.com$/.test(s.trim())

/* ---------- Google Identity Services ---------- */

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    google?: any
  }
}

let gisLoading: Promise<void> | null = null
function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  if (!gisLoading) {
    gisLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = 'https://accounts.google.com/gsi/client'
      s.async = true
      s.onload = () => resolve()
      s.onerror = () => {
        gisLoading = null
        reject(new Error('Couldn’t load Google sign-in. Check your connection and try again.'))
      }
      document.head.appendChild(s)
    })
  }
  return gisLoading
}

/** Opens Google's popup and resolves with a token. Must run from a click, or the browser blocks the popup. */
function requestToken(clientId: string, hint?: string): Promise<Token> {
  return loadGis().then(
    () =>
      new Promise<Token>((resolve, reject) => {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: SCOPE,
          login_hint: hint,
          callback: (r: any) => {
            if (r.error) reject(new Error(r.error_description || r.error))
            else if (!window.google.accounts.oauth2.hasGrantedAllScopes(r, SCOPE))
              reject(new Error('Calendar access wasn’t allowed. Try again and tick the calendar box.'))
            else resolve({ accessToken: r.access_token, expiresAt: Date.now() + (Number(r.expires_in) - 60) * 1000, email: hint })
          },
          error_callback: (e: any) =>
            reject(new Error(e?.type === 'popup_closed' ? 'The Google window was closed before finishing.' : e?.type === 'popup_failed_to_open' ? 'The browser blocked the Google window. Allow popups for this site.' : 'Google sign-in failed.')),
        })
        // An empty prompt shows the consent screen only the first time.
        client.requestAccessToken({ prompt: '' })
      }),
  )
}

/* ---------- Calendar API ---------- */

class AuthError extends Error {}

async function api(token: string, path: string, params: Record<string, string> = {}) {
  const res = await fetch(`${API}${path}?${new URLSearchParams(params)}`, { headers: { Authorization: `Bearer ${token}` } })
  if (res.status === 401) throw new AuthError('Signed out')
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const reason = body?.error?.errors?.[0]?.reason ?? body?.error?.status
    if (reason === 'accessNotConfigured' || reason === 'SERVICE_DISABLED')
      throw new Error('The Google Calendar API isn’t turned on for your Google Cloud project yet (step 2 of the setup guide).')
    throw new Error(body?.error?.message || `Google Calendar answered ${res.status}.`)
  }
  return res.json()
}

const dayStartIso = (k: DayKey) => {
  const [y, m, d] = k.split('-').map(Number)
  return new Date(y, m - 1, d).toISOString()
}

async function fetchAll(token: string, today: DayKey): Promise<Cache> {
  const list = await api(token, '/users/me/calendarList', { minAccessRole: 'reader', maxResults: '250' })
  const calendars: CalInfo[] = (list.items ?? [])
    .filter((c: any) => c.selected !== false || c.primary)
    .map((c: any) => ({ id: c.id, name: c.summaryOverride || c.summary || c.id, color: c.backgroundColor || '#7aa2f7', primary: !!c.primary }))
    .sort((a: CalInfo, b: CalInfo) => Number(!!b.primary) - Number(!!a.primary) || a.name.localeCompare(b.name))
  const timeMin = dayStartIso(today)
  const timeMax = dayStartIso(addDays(today, DAYS_AHEAD))
  const per = await Promise.all(
    calendars.map(async (cal) => {
      try {
        const r = await api(token, `/calendars/${encodeURIComponent(cal.id)}/events`, {
          timeMin,
          timeMax,
          singleEvents: 'true',
          orderBy: 'startTime',
          maxResults: '250',
        })
        return (r.items ?? [])
          .filter((e: any) => e.status !== 'cancelled' && e.start)
          .map(
            (e: any): CalEvent => ({
              key: `${cal.id}|${e.id}`,
              calendarId: cal.id,
              title: e.summary || '(No title)',
              start: e.start.dateTime ?? e.start.date,
              end: e.end?.dateTime ?? e.end?.date ?? e.start.dateTime ?? e.start.date,
              allDay: !e.start.dateTime,
              location: e.location || undefined,
              link: e.htmlLink || undefined,
              meet: e.hangoutLink || undefined,
              color: cal.color,
              declined: (e.attendees ?? []).some((a: any) => a.self && a.responseStatus === 'declined') || undefined,
            }),
          )
      } catch (err) {
        if (err instanceof AuthError) throw err
        return [] // One calendar failing (a holiday feed, say) shouldn't hide the rest.
      }
    }),
  )
  return { fetchedAt: Date.now(), from: today, calendars, events: per.flat() }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/* ---------- Days and times ---------- */

/** Days an event touches, as day keys. All-day ends are exclusive in Google's data. */
export function eventDays(e: CalEvent): DayKey[] {
  const first = e.allDay ? e.start : toKey(new Date(e.start))
  let last = e.allDay ? addDays(e.end, -1) : toKey(new Date(new Date(e.end).getTime() - 1))
  if (last < first) last = first
  const out: DayKey[] = []
  for (let d = first; d <= last && out.length < 60; d = addDays(d, 1)) out.push(d)
  return out
}

export const eventsOn = (events: CalEvent[], day: DayKey) =>
  events
    .filter((e) => eventDays(e).includes(day))
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start) || a.title.localeCompare(b.title))

export const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).replace(':00', '').replace(/\s/g, ' ')

export type EventState = 'past' | 'now' | 'next' | 'later'

/** Where a timed event sits relative to now. */
export const stateAt = (e: CalEvent, now: number): Exclude<EventState, 'next'> => {
  if (e.allDay) return 'later'
  const s = new Date(e.start).getTime()
  const en = new Date(e.end).getTime()
  return en <= now ? 'past' : s <= now ? 'now' : 'later'
}

/** "in 25 min", "in 2 h". */
export function untilLabel(iso: string, now: number) {
  const m = Math.round((new Date(iso).getTime() - now) / 60_000)
  if (m <= 1) return 'starting'
  if (m < 60) return `in ${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r && h < 3 ? `in ${h} h ${r} min` : `in ${h} h`
}

/* ---------- The hook ---------- */

export type Status =
  | 'no-client' // no client ID yet: show the setup steps
  | 'signed-out' // client ID, never connected (or disconnected)
  | 'expired' // was connected; the hour-long token ran out, one tap renews it
  | 'ready'

export function useGcal(today: DayKey) {
  const [settings, setSettings] = usePersisted<GcalSettings>(SETTINGS_KEY, {})
  const [token, setToken] = usePersisted<Token | null>(TOKEN_KEY, null)
  const [cache, setCache] = usePersisted<Cache | null>(CACHE_KEY, null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now)
  const inflight = useRef(false)

  const clientId = clientIdOf(settings)
  const live = !!token && token.expiresAt > now
  const status: Status = !clientId ? 'no-client' : live ? 'ready' : token || cache ? 'expired' : 'signed-out'

  const load = useCallback(
    async (t: Token) => {
      if (inflight.current) return
      inflight.current = true
      setBusy(true)
      try {
        const c = await fetchAll(t.accessToken, today)
        setCache(c)
        setError('')
        const primary = c.calendars.find((x) => x.primary)?.id
        if (primary && primary.includes('@') && t.email !== primary) setToken({ ...t, email: primary })
      } catch (err) {
        if (err instanceof AuthError) setToken((cur) => (cur ? { ...cur, expiresAt: 0 } : cur))
        else setError(err instanceof Error ? err.message : 'Couldn’t reach Google Calendar.')
      } finally {
        inflight.current = false
        setBusy(false)
      }
    },
    [today, setCache, setToken],
  )

  /** Sign in (or renew the token) and fetch. Call from a click. */
  const connect = useCallback(async () => {
    if (!clientId) return
    setBusy(true)
    setError('')
    try {
      const t = await requestToken(clientId, store.get<Token | null>(TOKEN_KEY, null)?.email)
      setToken(t)
      setBusy(false)
      await load(t)
    } catch (err) {
      setBusy(false)
      setError(err instanceof Error ? err.message : 'Google sign-in failed.')
    }
  }, [clientId, load, setToken])

  /** Refetch with the current token, or renew it first if it ran out. */
  const refresh = useCallback(() => {
    const t = store.get<Token | null>(TOKEN_KEY, null)
    if (t && t.expiresAt > Date.now()) void load(t)
    else void connect()
  }, [connect, load])

  const disconnect = useCallback(() => {
    const t = store.get<Token | null>(TOKEN_KEY, null)
    if (t && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(t.accessToken, () => {})
    else if (t) void fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(t.accessToken)}`, { method: 'POST' }).catch(() => {})
    setToken(null)
    setCache(null)
    setError('')
  }, [setToken, setCache])

  // A clock for "now" lines and countdowns.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  // Fetch when the page opens, on a new day, when the tab comes back, and every 10 minutes, while the token lasts.
  useEffect(() => {
    if (!live || !token) return
    const stale = !cache || cache.from !== today || Date.now() - cache.fetchedAt > REFETCH_MS
    if (stale) void load(token)
    const tick = () => {
      const c = store.get<Cache | null>(CACHE_KEY, null)
      const t = store.get<Token | null>(TOKEN_KEY, null)
      if (document.visibilityState === 'visible' && t && t.expiresAt > Date.now() && (!c || Date.now() - c.fetchedAt > REFETCH_MS || c.from !== today)) void load(t)
    }
    const id = window.setInterval(tick, 60_000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, today, token?.accessToken])

  const hidden = new Set(settings.hidden ?? [])
  const calendars = cache?.calendars ?? []
  const events = (cache?.events ?? []).filter((e) => !hidden.has(e.calendarId))
  const toggleCalendar = (id: string) =>
    setSettings((s) => {
      const h = new Set(s.hidden ?? [])
      if (h.has(id)) h.delete(id)
      else h.add(id)
      return { ...s, hidden: [...h] }
    })
  const setClientId = (id: string) => setSettings((s) => ({ ...s, clientId: id.trim() || undefined }))

  return {
    status,
    busy,
    error,
    now,
    clientId,
    /** Client ID pasted in the app (as opposed to baked into the build). */
    pastedClientId: settings.clientId ?? '',
    setClientId,
    email: token?.email,
    calendars,
    hidden,
    toggleCalendar,
    events,
    /** Events are from an earlier day: the tile says so instead of showing yesterday as today. */
    staleDay: !!cache && cache.from !== today,
    fetchedAt: cache?.fetchedAt,
    connect,
    refresh,
    disconnect,
  }
}

export type Gcal = ReturnType<typeof useGcal>
