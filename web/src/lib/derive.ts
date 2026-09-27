import { monthKey } from './format'
import type { AttendanceCell, Dashboard, ParticipantStat, Segment, SessionStat } from './types'

export interface ClientFilters {
  q: string
  minSessions: number
  minStreak: number
  segment: Segment | 'all'
  sessionId: string | null
}

/** Attendance cells that count as "present" under the dashboard's threshold. */
export function presentCells(d: Dashboard): AttendanceCell[] {
  const min = d.min_minutes * 60
  return d.attendance.filter((c) => c[2] >= min)
}

export function filterParticipants(d: Dashboard, f: ClientFilters): ParticipantStat[] {
  const q = f.q.trim().toLowerCase()
  let inSession: Set<string> | null = null
  if (f.sessionId) {
    inSession = new Set(presentCells(d).filter((c) => c[0] === f.sessionId).map((c) => c[1]))
  }
  return d.participants.filter(
    (p) =>
      (!q || p.name.toLowerCase().includes(q)) &&
      p.sessions_attended >= f.minSessions &&
      p.longest_streak >= f.minStreak &&
      (f.segment === 'all' || p.segment === f.segment) &&
      (!inSession || inSession.has(p.id)),
  )
}

export function segmentCounts(ps: ParticipantStat[]): Record<Segment, number> {
  const out: Record<Segment, number> = { regular: 0, occasional: 0, new: 0, lapsed: 0 }
  for (const p of ps) out[p.segment]++
  return out
}

/** Histogram over fixed-width bins; the last bin is open-ended. */
export function histogram(values: number[], binSize: number, maxBins: number): { label: string; count: number }[] {
  const bins = Array.from({ length: maxBins }, (_, i) => ({
    label: i === maxBins - 1 ? `${i * binSize}+` : `${i * binSize}-${(i + 1) * binSize}`,
    count: 0,
  }))
  for (const v of values) bins[Math.min(Math.floor(v / binSize), maxBins - 1)].count++
  return bins
}

export const JOIN_BUCKETS = [
  { label: 'On time', max: 120 },
  { label: '2-5 min', max: 300 },
  { label: '5-10 min', max: 600 },
  { label: '10-20 min', max: 1200 },
  { label: '20+ min', max: Infinity },
]

export function joinBuckets(delays: number[]): { label: string; count: number }[] {
  const out = JOIN_BUCKETS.map((b) => ({ label: b.label, count: 0 }))
  for (const d of delays) out[JOIN_BUCKETS.findIndex((b) => d < b.max)].count++
  return out
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function weekdayOf(date: string): number {
  return (new Date(date + 'T12:00:00Z').getUTCDay() + 6) % 7
}

/** Count of dates per weekday, Monday first. */
export function byWeekdayIndex(dates: string[]): number[] {
  const out = [0, 0, 0, 0, 0, 0, 0]
  for (const d of dates) out[weekdayOf(d)]++
  return out
}

export function byWeekday(sessions: SessionStat[]): { label: string; sessions: number; avgHeadcount: number }[] {
  const acc = WEEKDAYS.map((label) => ({ label, sessions: 0, total: 0 }))
  for (const s of sessions) {
    const w = acc[weekdayOf(s.date)]
    w.sessions++
    w.total += s.headcount
  }
  return acc.map((w) => ({ label: w.label, sessions: w.sessions, avgHeadcount: w.sessions ? w.total / w.sessions : 0 }))
}

export function byMonth(d: Dashboard): { month: string; sessions: number; avgHeadcount: number; unique: number }[] {
  const sessionMonth = new Map(d.sessions.map((s) => [s.id, monthKey(s.date)]))
  const m = new Map<string, { sessions: number; total: number; people: Set<string> }>()
  for (const s of d.sessions) {
    const k = monthKey(s.date)
    const e = m.get(k) ?? { sessions: 0, total: 0, people: new Set() }
    e.sessions++
    e.total += s.headcount
    m.set(k, e)
  }
  for (const c of presentCells(d)) m.get(sessionMonth.get(c[0])!)?.people.add(c[1])
  return [...m.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, e]) => ({ month, sessions: e.sessions, avgHeadcount: e.total / e.sessions, unique: e.people.size }))
}

export interface ProfileSession {
  session: SessionStat
  seconds: number | null
  joinDelay: number | null
  present: boolean
}

export function participantTimeline(d: Dashboard, participantId: string): ProfileSession[] {
  const mine = new Map(d.attendance.filter((c) => c[1] === participantId).map((c) => [c[0], c]))
  return d.sessions.map((s) => {
    const c = mine.get(s.id)
    return {
      session: s,
      seconds: c ? c[2] : null,
      joinDelay: c ? c[3] : null,
      present: Boolean(c && c[2] >= d.min_minutes * 60),
    }
  })
}

export function participantMonthly(tl: ProfileSession[]) {
  const m = new Map<string, { held: number; attended: number; seconds: number }>()
  for (const t of tl) {
    const k = monthKey(t.session.date)
    const e = m.get(k) ?? { held: 0, attended: 0, seconds: 0 }
    e.held++
    if (t.present) {
      e.attended++
      e.seconds += t.seconds ?? 0
    }
    m.set(k, e)
  }
  return [...m.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, e]) => ({ month, ...e, rate: e.held ? (e.attended / e.held) * 100 : 0, avgSeconds: e.attended ? e.seconds / e.attended : 0 }))
}

export const MILESTONES = [1, 10, 25, 50, 108, 250, 500, 1008]

export function milestones(tl: ProfileSession[]): { count: number; date: string | null }[] {
  const dates = tl.filter((t) => t.present).map((t) => t.session.date)
  // Every milestone reached, plus the next one to aim for.
  const next = MILESTONES.find((n) => n > dates.length)
  const shown = MILESTONES.filter((n) => n <= dates.length).concat(next ? [next] : [])
  return shown.map((n) => ({ count: n, date: dates[n - 1] ?? null }))
}
