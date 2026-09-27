import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { EChart } from '../../components/charts/EChart'
import { barTop, chrome } from '../../components/charts/chartTheme'
import { Badge, Card, CardHeader, Empty, ErrorBox, Segmented, Spinner } from '../../components/ui'
import { api } from '../../lib/api'
import { milestones, participantMonthly, participantTimeline, type ProfileSession } from '../../lib/derive'
import { fmtDate, fmtDuration, fmtHours, fmtMonth, fmtTime, sessionLabeler } from '../../lib/format'
import { useCourseBySlug, useDashboard } from '../course/hooks'
import { SEGMENT_META } from '../course/segments'

function Timeline({ tl, mode, tz }: { tl: ProfileSession[]; mode: 'bar' | 'line'; tz: string }) {
  const label = sessionLabeler(tl.map((x) => x.session), tz)
  return (
    <EChart
      ariaLabel="Minutes attended in each session"
      deps={[tl, mode]}
      height={260}
      build={() => {
        const t = chrome()
        const n = tl.length
        return {
          ...t.base,
          grid: { ...t.base.grid, top: 24, bottom: n > 40 ? 32 : 8 },
          tooltip: {
            ...t.base.tooltip,
            trigger: 'axis',
            formatter: (ps: { dataIndex: number }[]) => {
              const x = tl[ps[0].dataIndex]
              const status = x.seconds == null ? 'Absent' : x.present ? `${Math.round(x.seconds / 60)} min` : `${Math.round(x.seconds / 60)} min (below threshold)`
              return `<b>${fmtDate(x.session.date)} · ${fmtTime(x.session.started_at, tz)}</b><br/>${status} of ${Math.round(x.session.duration_sec / 60)}${x.joinDelay != null ? `<br/>Joined +${Math.round(x.joinDelay / 60)} min` : ''}`
            },
          },
          xAxis: { ...t.categoryAxis, data: tl.map((x) => label(x.session)), boundaryGap: mode === 'bar' },
          yAxis: { ...t.valueAxis, name: 'minutes' },
          dataZoom: n > 40 ? [{ type: 'inside', start: 100 - (40 / n) * 100, end: 100 }, { type: 'slider', height: 18, bottom: 4, showDetail: false, start: 100 - (40 / n) * 100, end: 100 }] : [],
          series: [
            mode === 'bar'
              ? {
                  type: 'bar',
                  barMaxWidth: 16,
                  data: tl.map((x) => ({
                    value: x.seconds == null ? 0 : Math.round(x.seconds / 60),
                    itemStyle: { color: t.colors.s1, opacity: x.present ? 1 : 0.35, ...barTop },
                  })),
                }
              : {
                  type: 'line',
                  data: tl.map((x) => (x.seconds == null ? 0 : Math.round(x.seconds / 60))),
                  showSymbol: n <= 60,
                  symbolSize: 8,
                  lineStyle: { width: 2, color: t.colors.s1 },
                  itemStyle: { color: t.colors.s1, borderColor: t.colors.surface, borderWidth: 2 },
                  areaStyle: { color: t.colors.s1, opacity: 0.08 },
                },
          ],
        }
      }}
    />
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-0.5 text-xl font-semibold text-ink">{value}</div>
    </div>
  )
}

export function ParticipantPage() {
  const { slug, participantId } = useParams()
  const { course, isLoading } = useCourseBySlug(slug)
  const dash = useDashboard(course?.id, {})
  const dir = useQuery({ queryKey: ['directory', course?.id], queryFn: () => api.directory(course!.id), enabled: Boolean(course) })
  const [mode, setMode] = useState<'bar' | 'line'>('bar')

  const d = dash.data
  const p = d?.participants.find((x) => x.id === participantId)
  const tl = useMemo(() => (d && participantId ? participantTimeline(d, participantId) : []), [d, participantId])
  const monthly = useMemo(() => participantMonthly(tl), [tl])
  const ms = useMemo(() => milestones(tl), [tl])
  const aliases = dir.data?.find((x) => x.id === participantId)?.aliases ?? []

  if (isLoading || dash.isLoading) return <Spinner />
  if (dash.error) return <ErrorBox error={dash.error} />
  if (!course || !d) return <Empty title="Course not found" />
  if (!p) return <Empty title="No attendance for this devotee in this course">They may be below the "present" threshold or merged into another name.</Empty>

  const recent = tl.slice(-12)
  const recentRate = recent.length ? Math.round((recent.filter((x) => x.present).length / recent.length) * 100) : 0
  const meta = SEGMENT_META[p.segment]

  return (
    <div className="space-y-6">
      <div>
        <Link to={`/c/${course.slug}`} className="text-sm text-muted hover:text-ink">
          ← {course.name}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-4xl font-semibold text-ink">{p.name}</h1>
          <span title={meta.hint}>
            <Badge tone={meta.tone}>{meta.label}</Badge>
          </span>
        </div>
        <p className="mt-1 text-sm text-muted">
          First heard {fmtDate(p.first_ever_date ?? p.first_date)} · last seen {fmtDate(p.last_date)}
          {aliases.length > 0 && <> · also appears as {aliases.join(', ')}</>} ·{' '}
          <Link to={`/d/${p.id}`} className="text-brand hover:underline">
            All courses & overall profile →
          </Link>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Stat label="Sessions" value={`${p.sessions_attended} / ${d.sessions.length}`} />
        <Stat label="Attendance" value={`${Math.round(p.attendance_pct)}%`} />
        <Stat label="Total hearing" value={fmtHours(p.total_seconds)} />
        <Stat label="Avg per session" value={fmtDuration(p.avg_seconds)} />
        <Stat label="Of each session" value={`${Math.round(p.avg_pct_of_session)}%`} />
        <Stat label="Best streak" value={p.longest_streak} />
        <Stat label="Current streak" value={p.current_streak} />
        <Stat label="Avg join delay" value={`${Math.round(p.avg_join_delay_sec / 60)} min`} />
      </div>

      <Card>
        <CardHeader
          title="Session timeline"
          subtitle={`Minutes attended per session. Faded bars are below the ${d.min_minutes}-minute threshold.`}
          actions={<Segmented label="Chart type" value={mode} onChange={setMode} options={[{ value: 'bar', label: 'Bars' }, { value: 'line', label: 'Line' }]} />}
        />
        <Timeline tl={tl} mode={mode} tz={course.timezone} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Consistency" subtitle={`Last ${recent.length} sessions`} />
          <p className="text-4xl font-semibold text-ink">{recentRate}%</p>
          <p className="mt-1 text-sm text-muted">
            {recentRate >= 75 ? 'Steady and devoted.' : recentRate >= 40 ? 'Coming fairly often.' : 'Could use a gentle call.'}
          </p>
          <div className="mt-4 flex flex-wrap gap-1.5" aria-label="Recent sessions, oldest first">
            {recent.map((x) => (
              <span
                key={x.session.id}
                title={`${fmtDate(x.session.date)} ${fmtTime(x.session.started_at, course.timezone)}: ${x.present ? 'present' : 'absent'}`}
                className={`h-5 w-5 rounded-md ${x.present ? 'bg-[var(--s1)]' : 'border border-line bg-surface-2'}`}
              />
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="Milestones" />
          <ol className="space-y-2 text-sm">
            {ms.map((m) => (
              <li key={m.count} className="flex items-center justify-between gap-3">
                <span className={m.date ? 'text-ink' : 'text-muted'}>
                  {m.date ? '✦' : '○'} {m.count === 1 ? 'First session' : `${m.count} sessions`}
                </span>
                <span className="text-muted">{m.date ? fmtDate(m.date) : `${m.count - p.sessions_attended} to go`}</span>
              </li>
            ))}
          </ol>
        </Card>
        <Card>
          <CardHeader title="Monthly" />
          <div className="max-h-72 overflow-y-auto">
            <table className="tabular w-full text-sm">
              <thead className="text-left text-xs text-muted uppercase">
                <tr>
                  <th className="py-1">Month</th>
                  <th className="py-1 text-right">Attended</th>
                  <th className="py-1 text-right">Rate</th>
                  <th className="py-1 text-right">Avg min</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {monthly.map((m) => (
                  <tr key={m.month}>
                    <td className="py-1.5">{fmtMonth(m.month)}</td>
                    <td className="py-1.5 text-right">
                      {m.attended}/{m.held}
                    </td>
                    <td className="py-1.5 text-right">{Math.round(m.rate)}%</td>
                    <td className="py-1.5 text-right">{Math.round(m.avgSeconds / 60)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  )
}
