import { useQuery } from '@tanstack/react-query'
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Badge, Button, Card, CardHeader, Empty, ErrorBox, Select, Spinner } from '../../components/ui'
import { api } from '../../lib/api'
import { fmtDate, fmtDuration, fmtHours, fmtTime } from '../../lib/format'
import {
  addDays,
  courseTable,
  devotees,
  kpis,
  needsCall,
  newcomers,
  weeklyByCourse,
  weeklyVisits,
  type Devotee,
  type OverviewData,
} from '../../lib/overview'
import type { CourseCard } from '../../lib/types'
import { useAuth } from '../auth/AuthProvider'
import { courseColorVar, TrendChart, VisitsChart } from './charts'

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <div className="h-10" />
  const w = 160
  const h = 40
  const max = Math.max(...values, 1)
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 4 - (v / max) * (h - 8)])
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const [lx, ly] = pts[pts.length - 1]
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-10 w-40" aria-label={`Recent headcounts: ${values.join(', ')}`} role="img">
      <path d={`${d} L${w},${h} L0,${h} Z`} fill="var(--s1)" opacity="0.1" />
      <path d={d} fill="none" stroke="var(--s1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r="3" fill="var(--s1)" stroke="var(--surface)" strokeWidth="2" />
    </svg>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-xl font-semibold text-ink">{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  )
}

function CourseTile({ c }: { c: CourseCard }) {
  return (
    <Link
      to={`/c/${c.slug}`}
      className="group block rounded-2xl border border-line bg-surface p-5 transition hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-2xl leading-tight font-semibold text-ink group-hover:text-brand">{c.name}</h3>
          {c.schedule_note && <p className="mt-0.5 text-sm text-muted">{c.schedule_note}</p>}
        </div>
        {c.status !== 'active' && <Badge tone={c.status === 'paused' ? 'gold' : 'neutral'}>{c.status}</Badge>}
      </div>
      <div className="mt-5 flex items-end justify-between gap-4">
        <div className="grid grid-cols-3 gap-5">
          <Stat label="sessions" value={c.sessions} />
          <Stat label="devotees" value={c.participants} />
          <Stat label="avg / session" value={c.avg_headcount ?? '-'} />
        </div>
        <Sparkline values={c.spark} />
      </div>
      <p className="mt-4 text-xs text-muted">Last session: {fmtDate(c.last_session_date)}</p>
    </Link>
  )
}

const todayIso = () => {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

const PERIODS: { value: string; label: string; from: () => string | undefined }[] = [
  { value: '30d', label: 'Last 30 days', from: () => addDays(todayIso(), -30) },
  { value: '90d', label: 'Last 90 days', from: () => addDays(todayIso(), -90) },
  { value: 'year', label: 'This year', from: () => `${todayIso().slice(0, 4)}-01-01` },
  { value: 'all', label: 'All time', from: () => undefined },
]

function Kpi({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-5 py-4">
      <div className="text-xs font-medium tracking-wide text-muted uppercase">{label}</div>
      <div className="mt-1 text-3xl font-semibold text-ink">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  )
}

function Dot({ index }: { index: number }) {
  return (
    <span
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ background: `var(${courseColorVar(index)})` }}
      aria-hidden="true"
    />
  )
}

function PeopleList({
  people,
  empty,
  detail,
  colorIndex,
}: {
  people: Devotee[]
  empty: string
  detail: (p: Devotee) => string
  colorIndex: (id: string) => number
}) {
  if (!people.length) return <p className="text-sm text-muted">{empty}</p>
  return (
    <ol className="divide-y divide-[var(--line)] text-sm">
      {people.slice(0, 8).map((p) => (
        <li key={p.id} className="flex items-center justify-between gap-3 py-2">
          <Link to={`/d/${p.id}`} className="min-w-0 truncate font-medium text-ink hover:text-brand">
            {p.name}
          </Link>
          <span className="flex shrink-0 items-center gap-2 text-xs text-muted">
            <span className="flex gap-1" aria-label={`${p.courseIds.length} course(s)`}>
              {p.courseIds.map((c) => (
                <Dot key={c} index={colorIndex(c)} />
              ))}
            </span>
            {detail(p)}
          </span>
        </li>
      ))}
    </ol>
  )
}

function Analytics({ data, selected, periodStart }: { data: OverviewData; selected: Set<string>; periodStart: string | undefined }) {
  const colorIndex = useMemo(() => {
    const idx = new Map(data.courses.map((c, i) => [c.id, i]))
    return (id: string) => idx.get(id) ?? 0
  }, [data])
  const k = useMemo(() => kpis(data, selected, periodStart ?? null), [data, selected, periodStart])
  const people = useMemo(() => devotees(data, selected), [data, selected])
  const trend = useMemo(() => weeklyByCourse(data, selected), [data, selected])
  const visits = useMemo(() => weeklyVisits(data, selected), [data, selected])
  const table = useMemo(() => courseTable(data, selected), [data, selected])

  const sessions = data.sessions.filter((s) => selected.has(s[1]))
  if (!sessions.length) {
    return <Empty title="No sessions in this period">Choose a longer period, or upload attendance for these courses.</Empty>
  }

  const latestDate = sessions[sessions.length - 1][2]
  const courseById = new Map(data.courses.map((c) => [c.id, c]))
  const recent = [...sessions].reverse().slice(0, 8)
  const top = [...people].sort((a, b) => b.sessions - a.sessions || b.seconds - a.seconds)
  const call = needsCall(people, latestDate)
  const fresh = newcomers(people, latestDate)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Courses" value={k.courses} />
        <Kpi label="Sessions" value={k.sessions} sub={`${fmtDate(sessions[0][2])} - ${fmtDate(latestDate)}`} />
        <Kpi label="Devotees" value={k.devotees} sub="attended at least once" />
        <Kpi label="Avg per session" value={k.avgPerSession.toFixed(1)} />
        <Kpi label="Hearing" value={fmtHours(k.seconds)} sub={`${fmtDuration(k.avgSecondsPerVisit)} per visit`} />
        <Kpi label="New devotees" value={k.newDevotees} sub={periodStart ? 'first came in this period' : 'all time'} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Attendance trend" subtitle="Average devotees per session each week, by course." />
          <TrendChart weeks={trend.weeks} series={trend.series} colorIndex={colorIndex} />
        </Card>
        <Card>
          <CardHeader title="Latest sessions" subtitle="Click one to see who attended." />
          <ul className="divide-y divide-[var(--line)] text-sm">
            {recent.map((s) => {
              const c = courseById.get(s[1])!
              return (
                <li key={s[0]}>
                  <Link to={`/c/${c.slug}?session=${s[0]}`} className="flex items-center justify-between gap-3 py-2 hover:text-brand">
                    <span className="flex min-w-0 items-center gap-2">
                      <Dot index={colorIndex(c.id)} />
                      <span className="min-w-0">
                        <span className="block truncate text-ink">{c.name}</span>
                        <span className="block text-xs text-muted">
                          {fmtDate(s[2])} · {fmtTime(s[3], c.timezone)}
                        </span>
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-semibold text-ink">{s[5]}</span>
                      <span className="block text-xs text-muted">{s[6] ? `${s[6]} new` : 'present'}</span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Visits per week" subtitle="Returning devotees and first-time visitors, all selected courses." />
          <VisitsChart rows={visits} />
        </Card>
        <Card>
          <CardHeader title="Courses at a glance" subtitle="For the selected period." />
          <div className="overflow-x-auto">
            <table className="tabular w-full min-w-[480px] text-sm">
              <thead className="text-left text-xs tracking-wide text-muted uppercase">
                <tr>
                  <th className="py-2 pr-3">Course</th>
                  <th className="py-2 pr-3 text-right">Sessions</th>
                  <th className="py-2 pr-3 text-right">Devotees</th>
                  <th className="py-2 pr-3 text-right">Avg / session</th>
                  <th className="py-2 pr-3 text-right">Avg min</th>
                  <th className="py-2 text-right">Regulars</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {table.map((r) => (
                  <tr key={r.course.id}>
                    <td className="py-2 pr-3">
                      <Link to={`/c/${r.course.slug}`} className="flex items-center gap-2 font-medium text-ink hover:text-brand">
                        <Dot index={colorIndex(r.course.id)} />
                        {r.course.name}
                      </Link>
                      <span className="block pl-[18px] text-xs text-muted">last {fmtDate(r.lastDate)}</span>
                    </td>
                    <td className="py-2 pr-3 text-right">{r.sessions}</td>
                    <td className="py-2 pr-3 text-right">{r.devotees}</td>
                    <td className="py-2 pr-3 text-right">{r.avgPerSession.toFixed(1)}</td>
                    <td className="py-2 pr-3 text-right">{Math.round(r.avgMinutes)}</td>
                    <td className="py-2 text-right">{r.regulars}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Most devoted" subtitle="Most sessions in this period." />
          <PeopleList
            people={top}
            empty="No attendance yet."
            colorIndex={colorIndex}
            detail={(p) => `${p.sessions} sessions · ${Math.round(p.rate * 100)}%`}
          />
        </Card>
        <Card>
          <CardHeader title="Needs a gentle call" subtitle="Came 3+ times, but not in the last 2 weeks." />
          <PeopleList
            people={call}
            empty="Everyone who comes regularly has been seen recently."
            colorIndex={colorIndex}
            detail={(p) => `last ${fmtDate(p.lastDate)}`}
          />
        </Card>
        <Card>
          <CardHeader title="Newcomers" subtitle="First came in the last 2 weeks. Welcome them!" />
          <PeopleList
            people={fresh}
            empty="No new devotees in the last 2 weeks."
            colorIndex={colorIndex}
            detail={(p) => `since ${fmtDate(p.firstDate)} · ${p.sessions}×`}
          />
        </Card>
      </div>
    </div>
  )
}

export function OverviewPage() {
  const { me } = useAuth()
  const [sp, setSp] = useSearchParams()
  const [showArchived, setShowArchived] = useState(false)
  const period = PERIODS.find((p) => p.value === sp.get('period')) ?? PERIODS[1]
  const from = period.from()

  const cards = useQuery({ queryKey: ['overview'], queryFn: api.coursesOverview })
  const analytics = useQuery({
    queryKey: ['overviewAnalytics', from ?? 'all'],
    queryFn: () => api.overview(from),
    placeholderData: (prev) => prev,
  })

  const data = analytics.data
  const coursesParam = sp.get('courses') ?? ''
  const picked = coursesParam.split(',').filter(Boolean)
  const selected = useMemo(
    () => new Set(picked.length ? picked : (data?.courses ?? []).map((c) => c.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, coursesParam],
  )
  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(sp)
    if (v) next.set(k, v)
    else next.delete(k)
    setSp(next, { replace: true })
  }
  const toggleCourse = (id: string) => {
    const all = (data?.courses ?? []).map((c) => c.id)
    const cur = new Set(picked.length ? picked : [])
    if (cur.has(id)) cur.delete(id)
    else cur.add(id)
    setParam('courses', cur.size === 0 || cur.size === all.length ? null : [...cur].join(','))
  }

  if (cards.isLoading || analytics.isLoading) return <Spinner />
  if (cards.error) return <ErrorBox error={cards.error} />
  const allCards = cards.data ?? []
  const shownCards = allCards.filter((c) => showArchived || c.status !== 'archived')
  const archived = allCards.length - allCards.filter((c) => c.status !== 'archived').length

  if (allCards.length === 0) {
    return (
      <Empty title="No courses yet">
        {me?.role === 'super_admin' ? (
          <Link className="text-brand underline" to="/admin/courses">
            Create the first course
          </Link>
        ) : (
          'Ask a super admin to give you access to a course.'
        )}
      </Empty>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-semibold text-ink">Overview</h1>
          <p className="mt-1 text-sm text-muted">
            {me?.role === 'super_admin' ? 'All courses' : 'Your courses'} · who is hearing, how often, and for how long.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label="Period"
            value={period.value}
            onChange={(e) => setParam('period', e.target.value === '90d' ? null : e.target.value)}
            className="!w-40"
          >
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
          <Link to="/upload">
            <Button variant="primary">Upload attendance</Button>
          </Link>
        </div>
      </div>

      {data && data.courses.length > 1 && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Courses to include">
          <span className="text-xs text-muted">Courses:</span>
          <button
            onClick={() => setParam('courses', null)}
            aria-pressed={!picked.length}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${!picked.length ? 'border-brand bg-brand text-brand-ink' : 'border-line text-ink-2 hover:bg-surface-2'}`}
          >
            All
          </button>
          {data.courses.map((c, i) => {
            const on = picked.includes(c.id)
            return (
              <button
                key={c.id}
                aria-pressed={on}
                onClick={() => toggleCourse(c.id)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${on ? 'border-ink bg-surface-2 text-ink' : 'border-line text-ink-2 hover:bg-surface-2'}`}
              >
                <Dot index={i} />
                {c.name}
              </button>
            )
          })}
        </div>
      )}

      {analytics.error ? (
        <ErrorBox error={analytics.error} />
      ) : data ? (
        <div className={`transition-opacity ${analytics.isFetching ? 'opacity-60' : ''}`}>
          <Analytics data={data} selected={selected} periodStart={from} />
        </div>
      ) : null}

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <h2 className="font-display text-2xl font-semibold text-ink">Courses</h2>
          {archived > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setShowArchived((v) => !v)}>
              {showArchived ? 'Hide' : 'Show'} archived ({archived})
            </Button>
          )}
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shownCards.map((c) => (
            <CourseTile key={c.id} c={c} />
          ))}
        </div>
      </section>
    </div>
  )
}
