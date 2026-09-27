import { useMemo } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Badge, Button, Card, CardHeader, Empty, ErrorBox, Field, Input, Select, Spinner } from '../../components/ui'
import { filterParticipants, presentCells, segmentCounts, type ClientFilters } from '../../lib/derive'
import { fmtDate, fmtDuration, fmtHours, sessionLabeler } from '../../lib/format'
import type { Dashboard, ParticipantStat, Segment } from '../../lib/types'
import {
  AttendanceHeatmap,
  AvgMinutesChart,
  JoinTimeChart,
  MonthChart,
  SessionsChart,
  TimeInCallChart,
  WeekdayChart,
} from './charts'
import { useCourseBySlug, useDashboard } from './hooks'
import { Leaderboard } from './Leaderboard'
import { SEGMENT_META } from './segments'

const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)

function presetRange(p: string): { from?: string; to?: string } {
  const now = new Date()
  const back = (days: number) => iso(new Date(now.getTime() - days * 86400000))
  switch (p) {
    case '30d':
      return { from: back(30) }
    case '90d':
      return { from: back(90) }
    case 'month':
      return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)) }
    case 'year':
      return { from: `${now.getFullYear()}-01-01` }
    default:
      return {}
  }
}

function useFilters() {
  const [sp, setSp] = useSearchParams()
  const get = (k: string) => sp.get(k) ?? ''
  const set = (patch: Record<string, string | number | null | undefined>) => {
    const next = new URLSearchParams(sp)
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === undefined || v === '' || v === 0) next.delete(k)
      else next.set(k, String(v))
    }
    setSp(next, { replace: true })
  }
  return { get, set, sp, clear: () => setSp(new URLSearchParams(), { replace: true }) }
}

function Kpi({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-5 py-4">
      <div className="text-xs font-medium tracking-wide text-muted uppercase">{label}</div>
      <div className="mt-1 text-3xl font-semibold text-ink">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  )
}

function Spotlight({ people, slug }: { people: ParticipantStat[]; slug: string }) {
  const top = [...people].sort((a, b) => b.sessions_attended - a.sessions_attended || b.total_seconds - a.total_seconds).slice(0, 3)
  if (!top.length) return null
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {top.map((p, i) => (
        <Link
          key={p.id}
          to={`/c/${slug}/p/${p.id}`}
          className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-4 transition hover:shadow-md"
        >
          <span
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-lg font-bold text-white"
            style={{ background: ['var(--gold)', 'var(--brand)', 'var(--teal)'][i] }}
            aria-label={`Rank ${i + 1}`}
          >
            {i + 1}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-semibold text-ink">{p.name}</span>
            <span className="block text-xs text-muted">
              {p.sessions_attended} sessions · {Math.round(p.attendance_pct)}% · best streak {p.longest_streak}
            </span>
          </span>
        </Link>
      ))}
    </div>
  )
}

export function CoursePage() {
  const { slug } = useParams()
  const { course, isLoading: coursesLoading, error: coursesError } = useCourseBySlug(slug)
  const f = useFilters()

  const preset = f.get('range') || 'all'
  const range = preset === 'custom' ? { from: f.get('from') || undefined, to: f.get('to') || undefined } : presetRange(preset)
  const minParam = f.get('min')
  const minMinutes = minParam === '' ? undefined : Number(minParam)

  const dash = useDashboard(course?.id, { ...range, minMinutes })
  const d = dash.data

  const filters: ClientFilters = {
    q: f.get('q'),
    minSessions: Number(f.get('ms')) || 0,
    minStreak: Number(f.get('st')) || 0,
    segment: (f.get('seg') as Segment) || 'all',
    sessionId: f.get('session') || null,
  }
  const people = useMemo(() => (d ? filterParticipants(d, filters) : []), [d, filters.q, filters.minSessions, filters.minStreak, filters.segment, filters.sessionId]) // eslint-disable-line react-hooks/exhaustive-deps
  const segCounts = useMemo(() => segmentCounts(d?.participants ?? []), [d])
  const selectedSession = d?.sessions.find((s) => s.id === filters.sessionId)
  const sessionIds = useMemo(
    () => new Set(filters.sessionId ? [filters.sessionId] : (d?.sessions ?? []).map((s) => s.id)),
    [d, filters.sessionId],
  )
  const sessionMinutes = useMemo(() => {
    if (!d || !filters.sessionId) return undefined
    return new Map(presentCells(d).filter((c) => c[0] === filters.sessionId).map((c) => [c[1], Math.round(c[2] / 60)]))
  }, [d, filters.sessionId])

  if (coursesLoading) return <Spinner />
  if (coursesError) return <ErrorBox error={coursesError} />
  if (!course) return <Empty title="Course not found">It may have been renamed. <Link className="text-brand underline" to="/">Back to courses</Link></Empty>

  const hasClientFilters = Boolean(filters.q || filters.minSessions || filters.minStreak || filters.segment !== 'all' || filters.sessionId)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <Link to="/" className="text-sm text-muted hover:text-ink">
            ← Courses
          </Link>
          <h1 className="mt-1 font-display text-4xl font-semibold text-ink">{course.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {[course.schedule_note, course.description].filter(Boolean).join(' · ')}{' '}
            {course.status !== 'active' && <Badge tone="gold">{course.status}</Badge>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/c/${course.slug}/sessions`}>
            <Button>Sessions</Button>
          </Link>
          <Link to={`/admin/courses/${course.id}`}>
            <Button>Edit course</Button>
          </Link>
          <Link to={`/upload?course=${course.id}`}>
            <Button variant="primary">Upload</Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <Card className="!p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          <Field label="Period">
            <Select value={preset} onChange={(e) => f.set({ range: e.target.value === 'all' ? null : e.target.value, session: null })}>
              <option value="all">All time</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="month">This month</option>
              <option value="year">This year</option>
              <option value="custom">Custom...</option>
            </Select>
          </Field>
          {preset === 'custom' && (
            <>
              <Field label="From">
                <Input type="date" value={f.get('from')} onChange={(e) => f.set({ from: e.target.value, session: null })} />
              </Field>
              <Field label="To">
                <Input type="date" value={f.get('to')} onChange={(e) => f.set({ to: e.target.value, session: null })} />
              </Field>
            </>
          )}
          <Field label="Counts as present" hint={minParam === '' ? `Course default: ${course.min_present_minutes} min` : undefined}>
            <Select value={minParam} onChange={(e) => f.set({ min: e.target.value === '' ? null : e.target.value })}>
              <option value="">Course default</option>
              {[1, 10, 20, 35, 45].map((m) => (
                <option key={m} value={m}>
                  {m}+ min
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Min sessions">
            <Input type="number" min={0} value={f.get('ms')} placeholder="0" onChange={(e) => f.set({ ms: e.target.value })} />
          </Field>
          <Field label="Min best streak">
            <Input type="number" min={0} value={f.get('st')} placeholder="0" onChange={(e) => f.set({ st: e.target.value })} />
          </Field>
          <Field label="Search">
            <Input type="search" placeholder="Name..." value={f.get('q')} onChange={(e) => f.set({ q: e.target.value })} />
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">Segment:</span>
          {(['all', 'regular', 'occasional', 'new', 'lapsed'] as const).map((s) => {
            const active = filters.segment === s
            const count = s === 'all' ? d?.participants.length : segCounts[s]
            return (
              <button
                key={s}
                onClick={() => f.set({ seg: s === 'all' ? null : s })}
                title={s === 'all' ? undefined : SEGMENT_META[s].hint}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${active ? 'border-brand bg-brand text-brand-ink' : 'border-line text-ink-2 hover:bg-surface-2'}`}
              >
                {s === 'all' ? 'Everyone' : SEGMENT_META[s].label} {count != null && <span className="opacity-70">{count}</span>}
              </button>
            )
          })}
          {selectedSession && (
            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-[color-mix(in_oklab,var(--saffron)_16%,transparent)] px-3 py-1 text-xs font-medium text-saffron">
              Session: {sessionLabeler(d!.sessions, course.timezone, true)(selectedSession)}
              <button aria-label="Clear session filter" className="ml-1" onClick={() => f.set({ session: null })}>
                ✕
              </button>
            </span>
          )}
          {(hasClientFilters || preset !== 'all' || minParam !== '') && (
            <Button size="sm" variant="ghost" className="ml-auto" onClick={f.clear}>
              Reset filters
            </Button>
          )}
        </div>
      </Card>

      {dash.error ? (
        <ErrorBox error={dash.error} />
      ) : !d ? (
        <Spinner />
      ) : d.sessions.length === 0 ? (
        <Empty title="No sessions in this period">
          <Link className="text-brand underline" to={`/upload?course=${course.id}`}>
            Upload an attendance file
          </Link>{' '}
          or widen the period.
        </Empty>
      ) : (
        <DashboardBody d={d} people={people} slug={course.slug} selected={filters.sessionId} sessionIds={sessionIds}
          sessionMinutes={sessionMinutes} onSelectSession={(id) => f.set({ session: id })} fetching={dash.isFetching} />
      )}
    </div>
  )
}

function DashboardBody({
  d,
  people,
  slug,
  selected,
  sessionIds,
  sessionMinutes,
  onSelectSession,
  fetching,
}: {
  d: Dashboard
  people: ParticipantStat[]
  slug: string
  selected: string | null
  sessionIds: Set<string>
  sessionMinutes?: Map<string, number>
  onSelectSession: (id: string | null) => void
  fetching: boolean
}) {
  const totalHeadcount = d.sessions.reduce((a, s) => a + s.headcount, 0)
  const present = presentCells(d)
  const avgSeconds = present.length ? present.reduce((a, c) => a + c[2], 0) / present.length : 0
  const totalSeconds = people.reduce((a, p) => a + p.total_seconds, 0)
  const regulars = people.filter((p) => p.segment === 'regular').length

  return (
    <div className={`space-y-6 transition-opacity ${fetching ? 'opacity-60' : ''}`}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Sessions" value={d.sessions.length} sub={`${fmtDate(d.sessions[0].date)} - ${fmtDate(d.sessions[d.sessions.length - 1].date)}`} />
        <Kpi label="Devotees" value={people.length} sub={people.length !== d.participants.length ? `of ${d.participants.length} in period` : 'attended at least once'} />
        <Kpi label="Avg per session" value={(totalHeadcount / d.sessions.length).toFixed(1)} sub={`present ≥ ${d.min_minutes} min`} />
        <Kpi label="Avg time in call" value={fmtDuration(avgSeconds)} sub={`${fmtHours(totalSeconds)} of hearing in total`} />
        <Kpi label="Regulars" value={regulars} sub={`≥ ${d.course.regular_threshold_pct}% of sessions`} />
      </div>

      <Spotlight people={people} slug={slug} />

      <Card>
        <CardHeader title="Attendance per session" subtitle="Click a bar to see who attended that session." />
        <SessionsChart sessions={d.sessions} selected={selected} onSelect={onSelectSession} tz={d.course.timezone} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Average minutes in call" subtitle="Per session, among devotees counted present." />
          <AvgMinutesChart sessions={d.sessions} tz={d.course.timezone} />
        </Card>
        <Card>
          <CardHeader title="Month by month" subtitle="Average headcount and unique devotees." />
          <MonthChart d={d} />
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Devotee × session heatmap"
          subtitle={`Stronger colour = more minutes. Showing ${Math.min(people.length, 40)} of ${people.length} devotees (current filters, most sessions first). Click a cell to open a profile.`}
        />
        <AttendanceHeatmap d={d} people={[...people].sort((a, b) => b.sessions_attended - a.sessions_attended)} slug={slug} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Time in call" subtitle={selected ? 'Selected session' : 'All visits, minutes'} />
          <TimeInCallChart d={d} sessionIds={sessionIds} />
        </Card>
        <Card>
          <CardHeader title="Joining time" subtitle="Minutes after the session started" />
          <JoinTimeChart d={d} sessionIds={sessionIds} />
        </Card>
        <Card>
          <CardHeader title="By weekday" subtitle="Average devotees per session" />
          <WeekdayChart sessions={d.sessions} />
        </Card>
      </div>

      <Card>
        <CardHeader title="Devotees" subtitle="Sortable. Click a name for their journey." />
        <Leaderboard people={people} slug={slug} courseName={d.course.name} sessionMinutes={sessionMinutes} />
      </Card>
    </div>
  )
}
