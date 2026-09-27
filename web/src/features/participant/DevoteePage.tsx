import { useQueries, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { EChart } from '../../components/charts/EChart'
import { barTop, chrome } from '../../components/charts/chartTheme'
import { Badge, Card, CardHeader, Empty, ErrorBox, Spinner } from '../../components/ui'
import { api } from '../../lib/api'
import { byWeekdayIndex, participantTimeline, type ProfileSession } from '../../lib/derive'
import { fmtDate, fmtDuration, fmtHours, fmtMonth, fmtTime, monthKey } from '../../lib/format'
import type { Dashboard, ParticipantStat } from '../../lib/types'
import { allTimeDashboardQuery } from '../course/hooks'
import { SEGMENT_META } from '../course/segments'

const SERIES = ['--s1', '--s2', '--s3', '--s4', '--s5']

interface Enrolment {
  d: Dashboard
  stat: ParticipantStat | undefined
  timeline: ProfileSession[]
  color: string
}

function MonthlyByCourse({ rows }: { rows: Enrolment[] }) {
  const months = [...new Set(rows.flatMap((r) => r.timeline.filter((t) => t.present).map((t) => monthKey(t.session.date))))].sort()
  const shown = rows.slice(0, 5)
  return (
    <EChart
      ariaLabel="Hours of hearing per month, by course"
      deps={[rows]}
      height={280}
      build={() => {
        const t = chrome()
        return {
          ...t.base,
          legend: { ...t.legend, data: shown.map((r) => r.d.course.name) },
          tooltip: {
            ...t.base.tooltip,
            trigger: 'axis',
            axisPointer: { type: 'shadow' },
            valueFormatter: (v: number) => `${v} h`,
          },
          xAxis: { ...t.categoryAxis, data: months.map(fmtMonth) },
          yAxis: { ...t.valueAxis, name: 'hours' },
          series: shown.map((r, i) => ({
            name: r.d.course.name,
            type: 'bar',
            stack: 'h',
            barMaxWidth: 28,
            itemStyle: {
              color: t.colors[`s${i + 1}` as 's1'],
              borderColor: t.colors.surface,
              borderWidth: 1,
              ...(i === shown.length - 1 ? barTop : {}),
            },
            data: months.map((m) => {
              const s = r.timeline.filter((x) => x.present && monthKey(x.session.date) === m).reduce((a, x) => a + (x.seconds ?? 0), 0)
              return Math.round((s / 3600) * 10) / 10
            }),
          })),
        }
      }}
    />
  )
}

function WeekdayPattern({ rows }: { rows: Enrolment[] }) {
  const present = rows.flatMap((r) => r.timeline.filter((t) => t.present))
  const counts = byWeekdayIndex(present.map((t) => t.session.date))
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  return (
    <EChart
      ariaLabel="Sessions attended by weekday"
      deps={[rows]}
      height={240}
      build={() => {
        const t = chrome()
        return {
          ...t.base,
          grid: { ...t.base.grid, top: 24 },
          tooltip: { ...t.base.tooltip, trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: number) => `${v} sessions` },
          xAxis: { ...t.categoryAxis, data: labels },
          yAxis: { ...t.valueAxis, name: 'sessions', minInterval: 1 },
          series: [{ type: 'bar', data: counts, barMaxWidth: 28, itemStyle: { color: t.colors.s1, ...barTop } }],
        }
      }}
    />
  )
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-0.5 text-xl font-semibold text-ink">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  )
}

export function DevoteePage() {
  const { participantId = '' } = useParams()
  const person = useQuery({ queryKey: ['participant', participantId], queryFn: () => api.participant(participantId) })
  const courseIds = useQuery({ queryKey: ['participantCourses', participantId], queryFn: () => api.participantCourseIds(participantId) })
  const dashboards = useQueries({ queries: (courseIds.data ?? []).map((id) => allTimeDashboardQuery(id)) })

  const loading = person.isLoading || courseIds.isLoading || dashboards.some((q) => q.isLoading)
  const error = person.error || courseIds.error || dashboards.find((q) => q.error)?.error

  const rows: Enrolment[] = useMemo(
    () =>
      dashboards
        .map((q) => q.data)
        .filter((d): d is Dashboard => Boolean(d))
        .map((d) => ({ d, stat: d.participants.find((p) => p.id === participantId), timeline: participantTimeline(d, participantId) }))
        .sort((a, b) => (b.stat?.sessions_attended ?? 0) - (a.stat?.sessions_attended ?? 0))
        .map((r, i) => ({ ...r, color: `var(${SERIES[i % SERIES.length]})` })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dashboards.map((q) => q.dataUpdatedAt).join(','), participantId],
  )

  if (loading) return <Spinner />
  if (error) return <ErrorBox error={error} />
  if (!person.data) return <Empty title="Devotee not found">They may have been merged into another name.</Empty>

  const p = person.data
  const aliases = p.participant_aliases.map((a) => a.alias_key)
  const attended = rows.flatMap((r) => r.timeline.filter((t) => t.present).map((t) => ({ ...t, course: r.d.course, color: r.color })))
  const totalSeconds = attended.reduce((a, t) => a + (t.seconds ?? 0), 0)
  // sessions held in each course since the devotee first attended it
  const held = rows.reduce((a, r) => a + (r.stat ? r.d.sessions.filter((s) => s.date >= (r.stat!.first_ever_date ?? r.stat!.first_date)).length : 0), 0)
  const firstDate = attended.map((t) => t.session.date).sort()[0]
  const lastDate = attended.map((t) => t.session.date).sort().at(-1)
  const recent = [...attended].sort((a, b) => b.session.started_at.localeCompare(a.session.started_at)).slice(0, 12)

  return (
    <div className="space-y-6">
      <div>
        <Link to="/admin/participants" className="text-sm text-muted hover:text-ink">
          ← Devotees
        </Link>
        <h1 className="mt-1 font-display text-4xl font-semibold text-ink">{p.display_name}</h1>
        <p className="mt-1 text-sm text-muted">
          {firstDate ? `First heard ${fmtDate(firstDate)} · last seen ${fmtDate(lastDate)}` : 'No sessions above the present threshold yet'}
          {aliases.length > 0 && <> · also appears as {aliases.join(', ')}</>}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Courses" value={rows.length} />
        <Stat label="Sessions attended" value={attended.length} />
        <Stat label="Since joining" value={held ? `${Math.round((attended.length / held) * 100)}%` : '-'} sub={`of ${held} sessions held`} />
        <Stat label="Total hearing" value={fmtHours(totalSeconds)} />
        <Stat label="Avg per session" value={attended.length ? fmtDuration(totalSeconds / attended.length) : '-'} />
        <Stat label="Best streak" value={Math.max(0, ...rows.map((r) => r.stat?.longest_streak ?? 0))} sub="in any course" />
      </div>

      <Card>
        <CardHeader title="Courses" subtitle="Open a course to see this devotee's journey there." />
        {rows.length === 0 ? (
          <p className="text-sm text-muted">Not enrolled in any course you can see.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {rows.map((r) => {
              const s = r.stat
              return (
                <Link
                  key={r.d.course.id}
                  to={`/c/${r.d.course.slug}/p/${participantId}`}
                  className="block rounded-xl border border-line p-4 transition hover:bg-surface-2"
                  style={{ borderLeft: `4px solid ${r.color}` }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-display text-xl font-semibold text-ink">{r.d.course.name}</p>
                    {s && (
                      <span title={SEGMENT_META[s.segment].hint}>
                        <Badge tone={SEGMENT_META[s.segment].tone}>{SEGMENT_META[s.segment].label}</Badge>
                      </span>
                    )}
                  </div>
                  {s ? (
                    <div className="tabular mt-3 grid grid-cols-4 gap-3 text-sm">
                      <div>
                        <div className="font-semibold text-ink">
                          {s.sessions_attended}/{r.d.sessions.length}
                        </div>
                        <div className="text-xs text-muted">sessions</div>
                      </div>
                      <div>
                        <div className="font-semibold text-ink">{Math.round(s.attendance_pct)}%</div>
                        <div className="text-xs text-muted">attendance</div>
                      </div>
                      <div>
                        <div className="font-semibold text-ink">{fmtHours(s.total_seconds)}</div>
                        <div className="text-xs text-muted">hearing</div>
                      </div>
                      <div>
                        <div className="font-semibold text-ink">
                          {s.current_streak} / {s.longest_streak}
                        </div>
                        <div className="text-xs text-muted">streak now / best</div>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-muted">Joined, but no visit reached the {r.d.min_minutes}-minute threshold.</p>
                  )}
                  {s && <p className="mt-2 text-xs text-muted">Last attended {fmtDate(s.last_date)}</p>}
                </Link>
              )
            })}
          </div>
        )}
      </Card>

      {attended.length > 0 && (
        <>
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="Hearing per month" subtitle="Hours attended, stacked by course." />
              <MonthlyByCourse rows={rows} />
            </Card>
            <Card>
              <CardHeader title="By weekday" subtitle="Sessions attended" />
              <WeekdayPattern rows={rows} />
            </Card>
          </div>

          <Card>
            <CardHeader title="Recent sessions" subtitle="Across all courses, newest first." />
            <ul className="tabular divide-y divide-[var(--line)] text-sm">
              {recent.map((t) => (
                <li key={t.session.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.color }} aria-hidden="true" />
                    <span className="text-ink">
                      {fmtDate(t.session.date)} <span className="text-muted">· {fmtTime(t.session.started_at, t.course.timezone)}</span>
                    </span>
                    <Link to={`/c/${t.course.slug}`} className="text-muted hover:text-brand">
                      {t.course.name}
                    </Link>
                  </span>
                  <span className="text-ink-2">
                    {Math.round((t.seconds ?? 0) / 60)} of {Math.round(t.session.duration_sec / 60)} min
                    {t.joinDelay != null && t.joinDelay >= 120 && <span className="text-muted"> · joined +{Math.round(t.joinDelay / 60)} min</span>}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  )
}
