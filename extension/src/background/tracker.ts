// Pure attendance bookkeeping. Every few seconds the content script reports
// who is visible in the call; this turns those checks into first-seen times
// and time-in-call per person.
import { nameKey } from '../shared/names'
import type { Meeting, State } from '../shared/types'

/** Longest gap between two checks that still counts as continuous presence.
 * Chrome slows timers in background tabs to about once a minute. */
export const MAX_STEP_MS = 75_000
/** No checks for this long means the meeting has ended (tab closed, left the call). */
export const END_GRACE_MS = 3 * 60_000
/** Checks for the same code after this long start a new meeting. */
export const REJOIN_GAP_MS = 20 * 60_000
/** How many finished meetings to keep in the browser. */
export const KEEP_MEETINGS = 40

export const emptyState = (): State => ({ meetings: {}, active: {} })

export function applyTick(state: State, code: string, names: string[], at: number, tabId?: number): Meeting {
  let m = state.active[code] ? state.meetings[state.active[code]] : undefined
  if (m && (m.status !== 'recording' || at - m.lastTickAt > REJOIN_GAP_MS)) {
    if (m.status === 'recording') m.status = 'ended'
    m = undefined
  }
  if (!m) {
    m = { id: `${code}-${at}`, code, startedAt: at, lastTickAt: at, participants: {}, peak: 0, status: 'recording', tabId }
    state.meetings[m.id] = m
    state.active[code] = m.id
  }

  const step = Math.max(0, Math.min(at - m.lastTickAt, MAX_STEP_MS))
  const seen = new Set<string>()
  for (const name of names) {
    const key = nameKey(name)
    if (!key || seen.has(key)) continue
    seen.add(key)
    const p = m.participants[key]
    if (!p) {
      m.participants[key] = { name, firstSeen: at, lastSeen: at, seconds: 0 }
    } else {
      // Count the time since the previous check only if they were there then too.
      if (p.lastSeen === m.lastTickAt) p.seconds += step / 1000
      p.lastSeen = at
    }
  }
  m.lastTickAt = Math.max(m.lastTickAt, at)
  m.peak = Math.max(m.peak, seen.size)
  if (tabId !== undefined) m.tabId = tabId
  return m
}

/** Mark a meeting as finished (left the call, closed the tab, or "End now"). */
export function endMeeting(state: State, id: string): Meeting | undefined {
  const m = state.meetings[id]
  if (!m || m.status !== 'recording') return m
  m.status = 'ended'
  if (state.active[m.code] === id) delete state.active[m.code]
  return m
}

/** End every recording meeting that hasn't had a check recently. */
export function endStale(state: State, now: number): Meeting[] {
  return Object.values(state.meetings)
    .filter((m) => m.status === 'recording' && now - m.lastTickAt > END_GRACE_MS)
    .map((m) => endMeeting(state, m.id)!)
}

/** Drop the oldest finished meetings beyond KEEP_MEETINGS. */
export function prune(state: State): void {
  const done = Object.values(state.meetings)
    .filter((m) => m.status === 'uploaded' || m.status === 'discarded')
    .sort((a, b) => b.startedAt - a.startedAt)
  for (const m of done.slice(KEEP_MEETINGS)) delete state.meetings[m.id]
}

/** Rows for ingest_session. Times are wall-clock in the course's timezone. */
export function payloadRows(m: Meeting, wallClock: (ms: number) => string) {
  return Object.values(m.participants)
    .filter((p) => p.seconds >= 1)
    .map((p) => ({ name: p.name, first_seen: wallClock(p.firstSeen), seconds: Math.round(p.seconds) }))
}
