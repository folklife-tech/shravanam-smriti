import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Badge, Button, Card, CardHeader, Empty, ErrorBox, Modal, Spinner } from '../../components/ui'
import { api } from '../../lib/api'
import { invalidateCourseData } from '../../lib/queries'
import { fmtDate, fmtDateTime, fmtDuration, fmtTime } from '../../lib/format'
import type { SessionRecord } from '../../lib/types'
import { useCourseBySlug } from './hooks'


export function SessionsPage() {
  const { slug } = useParams()
  const { course, isLoading } = useCourseBySlug(slug)
  const qc = useQueryClient()
  const [toDelete, setToDelete] = useState<SessionRecord | null>(null)

  const sessions = useQuery({ queryKey: ['sessions', course?.id], queryFn: () => api.sessions(course!.id), enabled: Boolean(course) })
  const log = useQuery({ queryKey: ['uploadLog', course?.id], queryFn: () => api.uploadLog(course!.id), enabled: Boolean(course) })

  const del = useMutation({
    mutationFn: (id: string) => api.deleteSession(id),
    onSuccess: () => {
      setToDelete(null)
      invalidateCourseData(qc)
    },
  })

  if (isLoading) return <Spinner />
  if (!course) return <Empty title="Course not found" />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link to={`/c/${course.slug}`} className="text-sm text-muted hover:text-ink">
            ← {course.name}
          </Link>
          <h1 className="mt-1 font-display text-4xl font-semibold text-ink">Sessions</h1>
          <p className="mt-1 text-sm text-muted">Every uploaded session. Replace a day's file or remove it entirely.</p>
        </div>
        <Link to={`/upload?course=${course.id}`}>
          <Button variant="primary">Upload</Button>
        </Link>
      </div>

      <Card className="!p-0">
        {sessions.isLoading ? (
          <div className="p-5">
            <Spinner />
          </div>
        ) : sessions.error ? (
          <div className="p-5">
            <ErrorBox error={sessions.error} />
          </div>
        ) : !sessions.data?.length ? (
          <div className="p-5">
            <Empty title="No sessions yet" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="tabular w-full min-w-[760px] text-sm">
              <thead className="bg-surface-2 text-left text-xs tracking-wide text-ink-2 uppercase">
                <tr>
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Time</th>
                  <th className="px-4 py-2.5 text-right">Rows</th>
                  <th className="px-4 py-2.5">Meeting</th>
                  <th className="px-4 py-2.5">Uploaded</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {sessions.data.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-2.5 font-medium text-ink">
                      {fmtDate(s.session_date)} {s.seq > 1 && <Badge tone="saffron">session {s.seq}</Badge>}
                    </td>
                    <td className="px-4 py-2.5 text-ink-2">
                      {fmtTime(s.started_at, course.timezone)}-{fmtTime(s.ended_at, course.timezone)} · {fmtDuration(s.duration_sec)}
                    </td>
                    <td className="px-4 py-2.5 text-right">{s.rows}</td>
                    <td className="px-4 py-2.5 text-ink-2">{s.meeting_code ?? '-'}</td>
                    <td className="px-4 py-2.5 text-xs text-muted">
                      {fmtDateTime(s.uploaded_at)}
                      {s.uploaded_by_email && <> · {s.uploaded_by_email}</>}
                      {s.replaced_at && (
                        <>
                          {' '}
                          <Badge>replaced</Badge>
                        </>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <Link to={`/upload?course=${course.id}&replace=${s.id}`}>
                        <Button size="sm">Replace</Button>
                      </Link>{' '}
                      <Button size="sm" variant="ghost" className="!text-danger" onClick={() => setToDelete(s)}>
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Activity" subtitle="Uploads, replacements and deletions (newest first)." />
        {log.data?.length ? (
          <ul className="divide-y divide-[var(--line)] text-sm">
            {log.data.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <Badge tone={l.action === 'delete' ? 'danger' : l.action === 'replace' ? 'gold' : 'teal'}>{l.action}</Badge>{' '}
                  <span className="text-ink">{fmtDate(String(l.details.session_date ?? ''))}</span>{' '}
                  <span className="text-muted">
                    · {l.rows} rows{l.details.filename ? ` · ${String(l.details.filename)}` : ''}
                  </span>
                </span>
                <span className="text-xs text-muted">
                  {l.email} · {fmtDateTime(l.at)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No activity yet.</p>
        )}
      </Card>

      <Modal
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        title="Delete this session?"
        footer={
          <>
            <Button onClick={() => setToDelete(null)}>Cancel</Button>
            <Button variant="danger" disabled={del.isPending} onClick={() => toDelete && del.mutate(toDelete.id)}>
              {del.isPending ? 'Deleting...' : 'Delete session'}
            </Button>
          </>
        }
      >
        {toDelete && (
          <p>
            The session on <strong>{fmtDate(toDelete.session_date)}</strong> and its {toDelete.rows} attendance rows will be removed
            permanently. Stats update immediately. This is recorded in the activity log.
          </p>
        )}
        {del.error && (
          <div className="mt-3">
            <ErrorBox error={del.error} />
          </div>
        )}
      </Modal>
    </div>
  )
}
