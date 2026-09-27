import { wallClock } from '../shared/time'
import type { ExistingSession, Meeting } from '../shared/types'
import { getSettings, readState, withState } from './store'
import { supabase } from './supabase'
import { payloadRows } from './tracker'

export const MAX_ATTEMPTS = 5

export interface UploadOptions {
  courseId?: string
  /** remember this meeting code for the chosen course */
  remember?: boolean
  mode?: 'create' | 'replace' | 'append'
  sessionId?: string
}

interface CourseInfo {
  id: string
  slug: string
  name: string
  timezone: string
}

type Outcome =
  | { status: 'uploaded'; course: CourseInfo; sessionId: string }
  | { status: 'conflict'; course: CourseInfo; existing: ExistingSession }
  | { status: 'needs-course' }
  | { status: 'needs-sign-in' }
  | { status: 'discarded'; error: string }
  | { status: 'error'; error: string }

async function courseFor(m: Meeting, courseId?: string): Promise<CourseInfo | null> {
  if (courseId) {
    const { data, error } = await supabase.from('courses').select('id, slug, name, timezone').eq('id', courseId).maybeSingle()
    if (error) throw error
    return data
  }
  const { data, error } = await supabase
    .from('course_meeting_codes')
    .select('course_id, courses(id, slug, name, timezone)')
    .eq('meeting_code', m.code)
    .maybeSingle()
  if (error) throw error
  const c = (data as { courses: CourseInfo | CourseInfo[] | null } | null)?.courses
  return (Array.isArray(c) ? c[0] : c) ?? null
}

async function attempt(m: Meeting, opts: UploadOptions): Promise<Outcome> {
  const { data: session } = await supabase.auth.getSession()
  if (!session.session) return { status: 'needs-sign-in' }

  const course = await courseFor(m, opts.courseId ?? m.courseId)
  if (!course) return { status: 'needs-course' }

  const clock = (ms: number) => wallClock(ms, course.timezone)
  const rows = payloadRows(m, clock)
  if (rows.length === 0) return { status: 'discarded', error: 'Nobody was in the call long enough to be counted.' }
  if (rows.length > 2000) return { status: 'error', error: 'More than 2000 people; upload the CSV in the web app instead.' }

  const { data, error } = await supabase.rpc('ingest_session', {
    payload: {
      course_id: course.id,
      mode: opts.mode ?? 'create',
      ...(opts.sessionId ? { session_id: opts.sessionId } : {}),
      meeting_code: m.code,
      save_meeting_code: Boolean(opts.remember),
      started_at: clock(m.startedAt),
      // the database needs end > start, to the second
      ended_at: clock(Math.max(m.lastTickAt, m.startedAt + 1000)),
      source_filename: `Chrome extension (${m.code})`,
      rows,
      aliases: [],
    },
  })
  if (error) return { status: 'error', error: error.message }
  const res = data as { status: 'ok'; session: { id: string } } | { status: 'exists'; existing: ExistingSession }
  return res.status === 'exists'
    ? { status: 'conflict', course, existing: res.existing }
    : { status: 'uploaded', course, sessionId: res.session.id }
}

/** Upload one finished meeting and record the outcome on it. */
export async function uploadMeeting(id: string, opts: UploadOptions = {}): Promise<Meeting | undefined> {
  const m = (await readState()).meetings[id]
  if (!m || m.status === 'recording' || m.status === 'uploaded') return m

  let outcome: Outcome
  try {
    outcome = await attempt(m, opts)
  } catch (e) {
    outcome = { status: 'error', error: e instanceof Error ? e.message : String(e) }
  }

  return withState((s) => {
    const cur = s.meetings[id]
    if (!cur) return undefined
    cur.status = outcome.status
    cur.error = 'error' in outcome ? outcome.error : undefined
    cur.existing = undefined
    if (outcome.status === 'uploaded' || outcome.status === 'conflict') {
      cur.courseId = outcome.course.id
      cur.courseSlug = outcome.course.slug
    }
    if (outcome.status === 'uploaded') {
      cur.sessionId = outcome.sessionId
      cur.uploadedAt = Date.now()
      cur.attempts = 0
    }
    if (outcome.status === 'conflict') cur.existing = outcome.existing
    if (outcome.status === 'error') cur.attempts = (cur.attempts ?? 0) + 1
    return cur
  })
}

/** Upload everything that has finished, if automatic upload is on. */
export async function processQueue(): Promise<Meeting[]> {
  if (!(await getSettings()).autoUpload) return []
  const pending = Object.values((await readState()).meetings).filter(
    (m) =>
      m.status === 'ended' ||
      m.status === 'needs-sign-in' ||
      (m.status === 'error' && (m.attempts ?? 0) < MAX_ATTEMPTS),
  )
  const done: Meeting[] = []
  for (const m of pending) {
    const r = await uploadMeeting(m.id)
    if (r) done.push(r)
  }
  return done
}
