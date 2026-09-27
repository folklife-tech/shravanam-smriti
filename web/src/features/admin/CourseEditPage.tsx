import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, Card, CardHeader, Empty, ErrorBox, Input, Modal, Spinner } from '../../components/ui'
import { api } from '../../lib/api'
import { useAuth } from '../auth/AuthProvider'
import { useCourses } from '../course/hooks'
import { invalidateCourseData } from '../../lib/queries'
import { ChipsInput, CourseForm, type CourseDraft } from './CourseForm'

const CODE_RE = /^[a-z0-9][a-z0-9-]{2,63}$/

export function CourseEditPage() {
  const { courseId } = useParams()
  const { me } = useAuth()
  const courses = useCourses()
  const course = courses.data?.find((c) => c.id === courseId)
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [saved, setSaved] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [typed, setTyped] = useState('')

  const codes = useQuery({ queryKey: ['meetingCodes'], queryFn: api.meetingCodes })
  const myCodes = (codes.data ?? []).filter((c) => c.course_id === courseId).map((c) => c.meeting_code)

  const afterChange = () => {
    qc.invalidateQueries({ queryKey: ['courses'] })
    invalidateCourseData(qc)
  }

  const update = useMutation({
    mutationFn: (d: CourseDraft) => api.updateCourse(courseId!, d),
    onSuccess: () => {
      afterChange()
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    },
  })
  const setCodes = useMutation({
    mutationFn: (list: string[]) => api.setMeetingCodes(courseId!, list),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meetingCodes'] }),
  })
  const remove = useMutation({
    mutationFn: () => api.deleteCourse(courseId!, typed),
    onSuccess: () => {
      afterChange()
      qc.invalidateQueries({ queryKey: ['me'] })
      navigate('/admin/courses')
    },
  })

  if (courses.isLoading) return <Spinner />
  if (!course) return <Empty title="Course not found" />

  return (
    <div className="space-y-6">
      <div>
        <Link to="/admin/courses" className="text-sm text-muted hover:text-ink">
          ← Manage courses
        </Link>
        <h1 className="mt-1 font-display text-4xl font-semibold text-ink">{course.name}</h1>
        <p className="mt-1 text-sm">
          <Link to={`/c/${course.slug}`} className="text-brand underline">
            Open dashboard
          </Link>
        </p>
      </div>

      <Card>
        <CardHeader title="Details" subtitle="All fields are editable. Threshold changes apply to past sessions too." actions={saved && <span className="text-sm text-good">Saved ✓</span>} />
        {update.error && (
          <div className="mb-4">
            <ErrorBox error={update.error} />
          </div>
        )}
        <CourseForm key={course.updated_at} initial={course} submitLabel="Save changes" busy={update.isPending} onSubmit={(d) => update.mutate(d)} />
      </Card>

      <Card>
        <CardHeader
          title="Google Meet codes"
          subtitle="Uploads with these meeting codes are matched to this course automatically. A code belongs to one course."
        />
        <ChipsInput
          values={myCodes}
          placeholder="Add a code, e.g. abc-defg-hij"
          normalize={(s) => s.trim().toLowerCase()}
          validate={(s) => (CODE_RE.test(s) ? null : 'Use letters, numbers and dashes (e.g. abc-defg-hij)')}
          onChange={(list) => setCodes.mutate(list)}
        />
        {setCodes.error && (
          <div className="mt-3">
            <ErrorBox error={setCodes.error} />
          </div>
        )}
      </Card>

      {me?.role === 'super_admin' && (
        <Card className="border-[color-mix(in_oklab,var(--danger)_35%,transparent)]">
          <CardHeader
            title="Delete course"
            subtitle={
              course.status === 'archived'
                ? 'Permanently removes the course, its sessions and attendance.'
                : 'Archive the course first (Status → Archived). Archiving hides it but keeps all data.'
            }
            actions={
              <Button variant="danger" disabled={course.status !== 'archived'} onClick={() => setConfirmDelete(true)}>
                Delete...
              </Button>
            }
          />
        </Card>
      )}

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this course permanently?"
        footer={
          <>
            <Button onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button variant="danger" disabled={typed !== course.slug || remove.isPending} onClick={() => remove.mutate()}>
              Delete forever
            </Button>
          </>
        }
      >
        <p>
          This cannot be undone. Type <code className="rounded bg-surface-2 px-1">{course.slug}</code> to confirm.
        </p>
        <Input className="mt-3" value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Course slug confirmation" />
        {remove.error && (
          <div className="mt-3">
            <ErrorBox error={remove.error} />
          </div>
        )}
      </Modal>
    </div>
  )
}
