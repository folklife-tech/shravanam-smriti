import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Badge, Button, Card, Empty, ErrorBox, Field, Select, Spinner } from '../../components/ui'
import { api } from '../../lib/api'
import { fmtClock, fmtDate, fmtDateTime, fmtDuration, fmtTime } from '../../lib/format'
import { nameKey } from '../../lib/nameKey'
import { MeetParseError, parseMeetCsv, type ParsedMeeting } from '../../lib/parseMeetCsv'
import type { Course, IngestMode, SessionRecord } from '../../lib/types'
import { useCourses } from '../course/hooks'
import { invalidateCourseData } from '../../lib/queries'

const MAX_FILE_BYTES = 2 * 1024 * 1024

interface Item {
  id: string
  fileName: string
  parsed?: ParsedMeeting
  error?: string
}

let seq = 0

export function UploadPage() {
  const [sp] = useSearchParams()
  const replaceId = sp.get('replace')
  const presetCourse = sp.get('course')
  const courses = useCourses()
  const codes = useQuery({ queryKey: ['meetingCodes'], queryFn: api.meetingCodes })
  const [items, setItems] = useState<Item[]>([])
  const [drag, setDrag] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const replaceSession = useQuery({
    queryKey: ['sessions', presetCourse],
    queryFn: () => api.sessions(presetCourse!),
    enabled: Boolean(replaceId && presetCourse),
    select: (list) => list.find((s) => s.id === replaceId),
  })

  const addFiles = async (files: FileList | File[]) => {
    const list = [...files].slice(0, replaceId ? 1 : 50)
    const next: Item[] = []
    for (const f of list) {
      const id = `f${++seq}`
      if (f.size > MAX_FILE_BYTES) {
        next.push({ id, fileName: f.name, error: 'File is larger than 2 MB - is this a Meet attendance export?' })
        continue
      }
      try {
        next.push({ id, fileName: f.name, parsed: parseMeetCsv(await f.text(), f.name) })
      } catch (e) {
        next.push({ id, fileName: f.name, error: e instanceof MeetParseError ? e.message : 'Could not read this file.' })
      }
    }
    setItems((prev) => (replaceId ? next : [...prev, ...next]))
  }

  const activeCourses = (courses.data ?? []).filter((c) => c.status !== 'archived')
  const codeMap = useMemo(() => new Map((codes.data ?? []).map((c) => [c.meeting_code, c.course_id])), [codes.data])

  if (courses.isLoading || codes.isLoading) return <Spinner />
  if (courses.error) return <ErrorBox error={courses.error} />
  if (!courses.data?.length) return <Empty title="No courses yet">Create a course before uploading attendance.</Empty>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl font-semibold text-ink">{replaceId ? 'Replace session' : 'Upload attendance'}</h1>
        <p className="mt-1 text-sm text-muted">
          Drop Google Meet attendance exports (.csv). Files are read <strong>in your browser</strong> - only names, join times and
          minutes are saved; the file itself is never uploaded or stored.
        </p>
        {replaceId && replaceSession.data && (
          <p className="mt-3 rounded-xl border border-line bg-surface-2 px-4 py-2 text-sm text-ink-2">
            Replacing the session on <strong>{fmtDate(replaceSession.data.session_date)}</strong> ({replaceSession.data.rows} rows,
            uploaded {fmtDateTime(replaceSession.data.uploaded_at)}). The new file's rows will take its place.
          </p>
        )}
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          addFiles(e.dataTransfer.files)
        }}
        className={`rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${drag ? 'border-brand bg-surface-2' : 'border-line bg-surface'}`}
      >
        <p className="font-display text-2xl text-ink">Drop CSV files here</p>
        <p className="mt-1 text-sm text-muted">{replaceId ? 'One file' : 'One or many'} · up to 2 MB each</p>
        <Button className="mt-4" onClick={() => input.current?.click()}>
          Choose files
        </Button>
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv"
          multiple={!replaceId}
          hidden
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {items.map((it) =>
        it.error || !it.parsed ? (
          <Card key={it.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-ink">{it.fileName}</p>
                <div className="mt-2">
                  <ErrorBox error={it.error} />
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setItems((p) => p.filter((x) => x.id !== it.id))}>
                Remove
              </Button>
            </div>
          </Card>
        ) : (
          <UploadCard
            key={it.id}
            m={it.parsed}
            courses={activeCourses}
            initialCourse={
              (it.parsed.meetingCode && codeMap.get(it.parsed.meetingCode)) || presetCourse || (activeCourses.length === 1 ? activeCourses[0].id : '')
            }
            codeKnown={Boolean(it.parsed.meetingCode && codeMap.has(it.parsed.meetingCode))}
            replaceTarget={replaceId && replaceSession.data ? replaceSession.data : undefined}
            onRemove={() => setItems((p) => p.filter((x) => x.id !== it.id))}
          />
        ),
      )}
    </div>
  )
}

type Choice = 'replace' | 'append' | 'skip' | ''

function UploadCard({
  m,
  courses,
  initialCourse,
  codeKnown,
  replaceTarget,
  onRemove,
}: {
  m: ParsedMeeting
  courses: Course[]
  initialCourse: string
  codeKnown: boolean
  replaceTarget?: SessionRecord
  onRemove: () => void
}) {
  const qc = useQueryClient()
  const [courseId, setCourseId] = useState(initialCourse)
  const [saveCode, setSaveCode] = useState(!codeKnown && Boolean(m.meetingCode))
  const [choice, setChoice] = useState<Choice>('')
  const [targetId, setTargetId] = useState<string>('')
  const [aliases, setAliases] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [done, setDone] = useState<{ action: string; newPeople: number; session: SessionRecord } | null>(null)

  const course = courses.find((c) => c.id === courseId)
  const hostKeys = new Set((course?.host_names ?? []).map(nameKey))
  const uniqueNames = [...new Map(m.rows.map((r) => [nameKey(r.name), r.name])).values()]
  const hosts = uniqueNames.filter((n) => hostKeys.has(nameKey(n)))

  const preview = useQuery({
    queryKey: ['uploadPreview', courseId, m.startedAt, m.endedAt, m.fileName, m.rows.length],
    queryFn: () => api.uploadPreview(courseId, m, uniqueNames),
    enabled: Boolean(courseId),
    staleTime: 0,
  })

  const tz = course?.timezone
  const at = (s: SessionRecord) => `${fmtTime(s.started_at, tz)}-${fmtTime(s.ended_at, tz)}`
  // Sessions that day (other than the one being replaced). Only a session whose
  // time overlaps this file is the "same" session; others are separate classes.
  const sameDay = (preview.data?.existing ?? []).filter((s) => s.id !== replaceTarget?.id)
  const overlapping = sameDay.filter((s) => s.overlaps)
  const otherTimes = sameDay.filter((s) => !s.overlaps)
  const newNames = (preview.data?.names ?? []).filter((n) => n.is_new && !hostKeys.has(n.key))
  const needsChoice = !replaceTarget && overlapping.length > 0

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      let mode: IngestMode = 'create'
      let sessionId: string | undefined
      if (replaceTarget) {
        mode = 'replace'
        sessionId = replaceTarget.id
      } else if (needsChoice) {
        mode = choice === 'append' ? 'append' : 'replace'
        sessionId = choice === 'replace' ? targetId || overlapping[0].id : undefined
      }
      const res = await api.ingest(m, {
        courseId,
        mode,
        sessionId,
        saveMeetingCode: saveCode,
        aliases: Object.entries(aliases)
          .filter(([, pid]) => pid)
          .map(([name, participant_id]) => ({ name, participant_id })),
      })
      if (res.status === 'exists') {
        await preview.refetch()
        setError(new Error('A session at this time already exists. Choose whether to replace it or keep both.'))
      } else {
        setDone({ action: res.action, newPeople: res.new_participants, session: res.session })
        invalidateCourseData(qc)
        qc.invalidateQueries({ queryKey: ['meetingCodes'] })
      }
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <Card className="border-[color-mix(in_oklab,var(--good)_40%,transparent)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink">
            <span className="text-good">✓</span> <strong>{m.fileName}</strong> - {done.action === 'replace' ? 'replaced' : 'imported'}{' '}
            {fmtDate(done.session.session_date)}
            {done.session.seq > 1 ? ` (session ${done.session.seq})` : ''}: {done.session.rows} devotees, {done.newPeople} new.
          </p>
          {course && (
            <Link to={`/c/${course.slug}`} className="text-sm text-brand underline">
              View {course.name}
            </Link>
          )}
        </div>
      </Card>
    )
  }

  const blockedReplace = Boolean(replaceTarget) && overlapping.length > 0
  const canSubmit = courseId && !busy && !preview.isLoading && !blockedReplace && (!needsChoice || (choice !== '' && choice !== 'skip'))

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-ink" title={m.fileName}>
            {m.fileName}
          </p>
          <p className="mt-0.5 text-sm text-muted">
            {fmtDate(m.sessionDate)} · {fmtClock(m.startedAt)}-{fmtClock(m.endedAt)} · {fmtDuration(m.durationSec)} ·{' '}
            {uniqueNames.length} people{m.meetingCode ? ` · ${m.meetingCode}` : ''}
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={onRemove}>
          Remove
        </Button>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="Course" hint={codeKnown ? 'Matched by meeting code' : undefined}>
          <Select value={courseId} onChange={(e) => setCourseId(e.target.value)} disabled={Boolean(replaceTarget)}>
            <option value="">Choose a course...</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        {!codeKnown && m.meetingCode && courseId && (
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-ink-2">
            <input type="checkbox" checked={saveCode} onChange={(e) => setSaveCode(e.target.checked)} />
            Remember <code className="rounded bg-surface-2 px-1">{m.meetingCode}</code> for this course
          </label>
        )}
      </div>

      {m.warnings.length > 0 && (
        <ul className="mt-4 space-y-1 text-sm text-gold">
          {m.warnings.map((w) => (
            <li key={w}>⚠ {w}</li>
          ))}
        </ul>
      )}
      {hosts.length > 0 && <p className="mt-2 text-sm text-muted">Host accounts excluded from stats: {hosts.join(', ')}</p>}

      {preview.error && (
        <div className="mt-4">
          <ErrorBox error={preview.error} />
        </div>
      )}

      {otherTimes.length > 0 && !needsChoice && !blockedReplace && (
        <p className="mt-4 rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm text-ink-2">
          This course has {otherTimes.length === 1 ? 'another session' : `${otherTimes.length} other sessions`} on {fmtDate(m.sessionDate)} (
          {otherTimes.map(at).join(', ')}). This file is at a different time, so it will be saved as a separate session.
        </p>
      )}

      {blockedReplace && (
        <div className="mt-4">
          <ErrorBox
            error={`This file (${fmtClock(m.startedAt)}-${fmtClock(m.endedAt)}) overlaps a different session (${overlapping.map(at).join(', ')}). Replace that session instead, or upload the file normally.`}
          />
        </div>
      )}

      {needsChoice && (
        <fieldset className="mt-4 rounded-xl border border-[color-mix(in_oklab,var(--saffron)_45%,transparent)] bg-[color-mix(in_oklab,var(--saffron)_7%,transparent)] p-4">
          <legend className="px-1 text-sm font-semibold text-saffron">
            A session at this time already exists on {fmtDate(m.sessionDate)}
          </legend>
          <div className="mb-3 grid gap-2 text-sm md:grid-cols-2">
            {overlapping.map((s) => (
              <div key={s.id} className="rounded-lg bg-surface px-3 py-2">
                <span className="font-medium text-ink">Existing {at(s)}:</span> {s.rows} rows · {fmtDuration(s.duration_sec)} ·{' '}
                {s.source_filename ?? 'unknown file'}
              </div>
            ))}
            <div className="rounded-lg bg-surface px-3 py-2">
              <span className="font-medium text-ink">
                This file {fmtClock(m.startedAt)}-{fmtClock(m.endedAt)}:
              </span>{' '}
              {m.rows.length} rows · {fmtDuration(m.durationSec)}
            </div>
          </div>
          <div className="space-y-2 text-sm">
            {overlapping.map((s) => (
              <label key={s.id} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`choice-${m.fileName}`}
                  checked={choice === 'replace' && (targetId || overlapping[0].id) === s.id}
                  onChange={() => {
                    setChoice('replace')
                    setTargetId(s.id)
                  }}
                />
                Replace the {at(s)} session
              </label>
            ))}
            <label className="flex items-center gap-2">
              <input type="radio" name={`choice-${m.fileName}`} checked={choice === 'append'} onChange={() => setChoice('append')} />
              Keep both - save as a separate session
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name={`choice-${m.fileName}`} checked={choice === 'skip'} onChange={() => setChoice('skip')} />
              Skip this file
            </label>
          </div>
        </fieldset>
      )}

      {newNames.length > 0 && (
        <details className="mt-4 rounded-xl border border-line p-4" open={newNames.some((n) => n.suggestions.length > 0)}>
          <summary className="cursor-pointer text-sm font-medium text-ink">
            {newNames.length} new name{newNames.length === 1 ? '' : 's'}
            {newNames.some((n) => n.suggestions.length) && ' - some look like existing devotees'}
          </summary>
          <ul className="mt-3 space-y-2 text-sm">
            {newNames.map((n) => (
              <li key={n.key} className="flex flex-wrap items-center gap-2">
                <Badge tone="brand">new</Badge>
                <span className="text-ink">{n.name}</span>
                {n.suggestions.map((s) => {
                  const on = aliases[n.name] === s.id
                  return (
                    <button
                      key={s.id}
                      onClick={() => setAliases((a) => ({ ...a, [n.name]: on ? '' : s.id }))}
                      className={`rounded-full border px-2.5 py-0.5 text-xs transition ${on ? 'border-teal bg-teal text-white' : 'border-line text-ink-2 hover:bg-surface-2'}`}
                      aria-pressed={on}
                    >
                      {on ? '✓ ' : ''}same as {s.name} <span className="opacity-60">{Math.round(s.score * 100)}%</span>
                    </button>
                  )
                })}
              </li>
            ))}
          </ul>
        </details>
      )}

      {error != null && (
        <div className="mt-4">
          <ErrorBox error={error} />
        </div>
      )}

      <div className="mt-5 flex items-center justify-end gap-3">
        {preview.isFetching && <span className="text-xs text-muted">Checking...</span>}
        {choice === 'skip' ? (
          <Button onClick={onRemove}>Remove from list</Button>
        ) : (
          <Button variant="primary" disabled={!canSubmit} onClick={submit}>
            {busy ? 'Saving...' : replaceTarget || choice === 'replace' ? 'Replace session' : 'Import'}
          </Button>
        )}
      </div>
    </Card>
  )
}
