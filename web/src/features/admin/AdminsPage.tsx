import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useRef, useState } from 'react'
import { Badge, Button, Card, CardHeader, ErrorBox, Field, FieldGroup, Input, Modal, Segmented, Spinner } from '../../components/ui'
import { api } from '../../lib/api'
import { fmtDate, fmtDateTime } from '../../lib/format'
import type { AdminEntry, AdminLogEntry, AdminRole, Course } from '../../lib/types'
import { useAuth } from '../auth/AuthProvider'
import { useCourses } from '../course/hooks'

const ROLE_OPTIONS: { value: AdminRole; label: string }[] = [
  { value: 'course_admin', label: 'Course admin' },
  { value: 'super_admin', label: 'Super admin' },
]

const siteUrl = () => window.location.origin + import.meta.env.BASE_URL

function CourseChips({
  courses,
  selected,
  onToggle,
  disabled,
}: {
  courses: Course[]
  selected: string[]
  onToggle: (id: string) => void
  disabled?: boolean
}) {
  if (!courses.length) return <p className="text-xs text-muted">No courses yet.</p>
  return (
    <div className="flex flex-wrap gap-2">
      {courses.map((c) => {
        const on = selected.includes(c.id)
        return (
          <button
            key={c.id}
            type="button"
            disabled={disabled}
            aria-pressed={on}
            onClick={() => onToggle(c.id)}
            className={`rounded-full border px-3 py-1 text-xs transition disabled:opacity-50 ${on ? 'border-brand bg-brand text-brand-ink' : 'border-line text-ink-2 hover:bg-surface-2'}`}
          >
            {on ? '✓ ' : ''}
            {c.name}
            {c.status === 'archived' && ' (archived)'}
          </button>
        )
      })}
    </div>
  )
}

function Status({ a }: { a: AdminEntry }) {
  return a.signed_up ? (
    <span title={a.last_sign_in_at ? `Last signed in ${fmtDateTime(a.last_sign_in_at)}` : undefined}>
      <Badge tone="teal">Active{a.last_sign_in_at ? ` · ${fmtDate(a.last_sign_in_at)}` : ''}</Badge>
    </span>
  ) : (
    <span title="They have access but haven't signed in yet">
      <Badge tone="gold">Invited</Badge>
    </span>
  )
}

function describe(l: AdminLogEntry): string {
  const d = l.details
  const label = (r?: string) => (r === 'super_admin' ? 'super admin' : 'course admin')
  switch (l.action) {
    case 'invite':
      return `granted ${l.target_email} access as ${label(d.role)}`
    case 'role':
      return `changed ${l.target_email} from ${label(d.from)} to ${label(d.to)}`
    case 'courses': {
      const parts = []
      if (d.added?.length) parts.push(`added ${d.added.join(', ')}`)
      if (d.removed?.length) parts.push(`removed ${d.removed.join(', ')}`)
      return `${parts.join('; ') || 'updated courses'} for ${l.target_email}`
    }
    case 'remove':
      return `removed ${l.target_email}'s access`
    case 'dismiss':
      return `dismissed the access request from ${l.target_email}`
  }
}

export function AdminsPage() {
  const { me } = useAuth()
  const qc = useQueryClient()
  const courses = useCourses()
  const dir = useQuery({ queryKey: ['adminDirectory'], queryFn: api.adminDirectory })
  const requests = useQuery({ queryKey: ['accessRequests'], queryFn: api.accessRequests })
  const activity = useQuery({ queryKey: ['adminActivity'], queryFn: api.adminActivity })

  const [email, setEmail] = useState('')
  const [role, setRole] = useState<AdminRole>('course_admin')
  const [inviteCourses, setInviteCourses] = useState<string[]>([])
  const [invited, setInvited] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [confirm, setConfirm] = useState<{ kind: 'remove' | 'dismiss' | 'promote'; email: string } | null>(null)
  const inviteRef = useRef<HTMLInputElement>(null)

  const refresh = () => {
    for (const k of ['adminDirectory', 'accessRequests', 'adminActivity', 'courseAdmins', 'admins']) qc.invalidateQueries({ queryKey: [k] })
  }
  const invite = useMutation({
    mutationFn: () => api.inviteAdmin(email.trim(), role, role === 'course_admin' ? inviteCourses : []),
    onSuccess: () => {
      setInvited(email.trim().toLowerCase())
      setEmail('')
      setInviteCourses([])
      refresh()
    },
  })
  const setRoleM = useMutation({ mutationFn: ({ e, r }: { e: string; r: AdminRole }) => api.upsertAdmin(e, r), onSuccess: refresh })
  const assign = useMutation({ mutationFn: ({ e, ids }: { e: string; ids: string[] }) => api.setAdminCourses(e, ids), onSuccess: refresh })
  const remove = useMutation({ mutationFn: (e: string) => api.removeAdmin(e), onSuccess: () => (setConfirm(null), refresh()) })
  const dismiss = useMutation({ mutationFn: (e: string) => api.dismissAccessRequest(e), onSuccess: () => (setConfirm(null), refresh()) })

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (dir.data ?? []).filter((a) => !needle || a.email.includes(needle))
  }, [dir.data, q])

  if (dir.isLoading) return <Spinner />
  const allCourses = courses.data ?? []
  const counts = { super: (dir.data ?? []).filter((a) => a.role === 'super_admin').length, course: (dir.data ?? []).filter((a) => a.role === 'course_admin').length }
  const err = dir.error || requests.error || invite.error || setRoleM.error || assign.error || remove.error || dismiss.error
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl font-semibold text-ink">Users & access</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Access is granted by email: the person then signs in with that Google account. <strong>Super admins</strong> see and manage
          everything, including this page. <strong>Course admins</strong> see, upload and edit only the courses ticked for them.
        </p>
      </div>
      {err && <ErrorBox error={err} />}

      {/* Invite */}
      <Card>
        <CardHeader title="Give someone access" subtitle="They can sign in straight away. Nothing is emailed; share the link below with them." />
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (role === 'super_admin') setConfirm({ kind: 'promote', email: email.trim().toLowerCase() })
            else invite.mutate()
          }}
        >
          <div className="grid gap-4 md:grid-cols-[1fr_auto]">
            <Field label="Google account email">
              <Input ref={inviteRef} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
            </Field>
            <FieldGroup label="Role">
              <Segmented label="Role" value={role} onChange={setRole} options={ROLE_OPTIONS} />
            </FieldGroup>
          </div>
          {role === 'course_admin' ? (
            <FieldGroup label="Courses they can manage">
              <CourseChips courses={allCourses} selected={inviteCourses} onToggle={(id) => setInviteCourses((l) => toggle(l, id))} />
            </FieldGroup>
          ) : (
            <p className="text-sm text-gold">Super admins can see every course, add or remove other admins, and delete courses.</p>
          )}
          <div className="flex flex-wrap items-center justify-end gap-3">
            {role === 'course_admin' && inviteCourses.length === 0 && <span className="text-xs text-muted">No courses ticked: they will see nothing until you add some.</span>}
            <Button type="submit" variant="primary" disabled={invite.isPending || !email.trim()}>
              {invite.isPending ? 'Saving...' : 'Grant access'}
            </Button>
          </div>
        </form>
        {invited && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-2 px-4 py-3 text-sm">
            <span className="text-ink-2">
              <span className="text-good">✓</span> <strong>{invited}</strong> can now sign in at <code className="text-ink">{siteUrl()}</code>
            </span>
            <Button size="sm" onClick={() => navigator.clipboard?.writeText(siteUrl())}>
              Copy link
            </Button>
          </div>
        )}
      </Card>

      {/* Access requests */}
      {(requests.data?.length ?? 0) > 0 && (
        <Card className="border-[color-mix(in_oklab,var(--saffron)_40%,transparent)]">
          <CardHeader title={`Waiting for access (${requests.data!.length})`} subtitle="These people signed in but have no access yet." />
          <ul className="divide-y divide-[var(--line)]">
            {requests.data!.map((r) => (
              <li key={r.email} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium text-ink">{r.email}</p>
                  <p className="text-xs text-muted">First signed in {fmtDateTime(r.created_at)}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      setEmail(r.email)
                      setRole('course_admin')
                      inviteRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                      inviteRef.current?.focus()
                    }}
                  >
                    Grant access...
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirm({ kind: 'dismiss', email: r.email })}>
                    Dismiss
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Admin list */}
      <Card className="!p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
          <div>
            <h2 className="text-base font-semibold text-ink">People with access</h2>
            <p className="text-sm text-muted">
              {counts.super} super admin{counts.super === 1 ? '' : 's'} · {counts.course} course admin{counts.course === 1 ? '' : 's'}
            </p>
          </div>
          <Input type="search" placeholder="Search email..." value={q} onChange={(e) => setQ(e.target.value)} className="!w-64" />
        </div>
        <ul className="mt-4 divide-y divide-[var(--line)]">
          {list.map((a) => {
            const self = a.email === me?.email
            return (
              <li key={a.email} className="px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">{a.email}</span>
                    {self && <Badge>you</Badge>}
                    <Status a={a} />
                  </div>
                  <div className="flex items-center gap-2">
                    {self ? (
                      <Badge tone="gold">Super admin</Badge>
                    ) : (
                      <>
                        <Segmented
                          label={`Role for ${a.email}`}
                          value={a.role}
                          options={ROLE_OPTIONS}
                          onChange={(r) =>
                            r === 'super_admin' ? setConfirm({ kind: 'promote', email: a.email }) : setRoleM.mutate({ e: a.email, r })
                          }
                        />
                        <Button size="sm" variant="ghost" className="!text-danger" onClick={() => setConfirm({ kind: 'remove', email: a.email })}>
                          Remove
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                <div className="mt-3">
                  {a.role === 'super_admin' ? (
                    <p className="text-xs text-muted">All courses</p>
                  ) : (
                    <CourseChips
                      courses={allCourses}
                      selected={a.course_ids}
                      disabled={assign.isPending}
                      onToggle={(id) => assign.mutate({ e: a.email, ids: toggle(a.course_ids, id) })}
                    />
                  )}
                </div>
              </li>
            )
          })}
          {list.length === 0 && <li className="px-5 py-6 text-sm text-muted">No matches.</li>}
        </ul>
      </Card>

      {/* Activity */}
      <Card>
        <CardHeader title="Recent changes" subtitle="Who granted, changed or removed access." />
        {activity.data?.length ? (
          <ul className="divide-y divide-[var(--line)] text-sm">
            {activity.data.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-ink-2">
                  <span className="text-ink">{l.actor_email ?? 'system'}</span> {describe(l)}
                </span>
                <span className="text-xs text-muted">{fmtDateTime(l.at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No changes yet.</p>
        )}
      </Card>

      <Modal
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        title={confirm?.kind === 'remove' ? 'Remove access?' : confirm?.kind === 'dismiss' ? 'Dismiss request?' : 'Make super admin?'}
        footer={
          <>
            <Button onClick={() => setConfirm(null)}>Cancel</Button>
            {confirm?.kind === 'remove' && (
              <Button variant="danger" disabled={remove.isPending} onClick={() => remove.mutate(confirm.email)}>
                Remove access
              </Button>
            )}
            {confirm?.kind === 'dismiss' && (
              <Button variant="danger" disabled={dismiss.isPending} onClick={() => dismiss.mutate(confirm.email)}>
                Dismiss
              </Button>
            )}
            {confirm?.kind === 'promote' && (
              <Button
                variant="primary"
                disabled={invite.isPending || setRoleM.isPending}
                onClick={() => {
                  const e = confirm.email
                  setConfirm(null)
                  if ((dir.data ?? []).some((a) => a.email === e)) setRoleM.mutate({ e, r: 'super_admin' })
                  else invite.mutate()
                }}
              >
                Make super admin
              </Button>
            )}
          </>
        }
      >
        {confirm?.kind === 'remove' && (
          <p>
            <strong>{confirm.email}</strong> will immediately lose access to every course. Their past uploads stay. You can grant access
            again at any time.
          </p>
        )}
        {confirm?.kind === 'dismiss' && (
          <p>
            <strong>{confirm.email}</strong>'s sign-in will be deleted. They haven't been given access to anything.
          </p>
        )}
        {confirm?.kind === 'promote' && (
          <p>
            <strong>{confirm.email}</strong> will see every course and be able to add or remove admins (including you) and delete
            courses.
          </p>
        )}
      </Modal>
    </div>
  )
}
