import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card, CardHeader, ErrorBox, Field, Input, Modal, Select, Spinner } from '../../components/ui'
import { api } from '../../lib/api'
import { fmtDate } from '../../lib/format'
import type { DirectoryEntry } from '../../lib/types'
import { useCourses } from '../course/hooks'
import { invalidateCourseData } from '../../lib/queries'

export function ParticipantsAdminPage() {
  const courses = useCourses()
  const [courseId, setCourseId] = useState('')
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [keep, setKeep] = useState<string>('')
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  const qc = useQueryClient()

  const dir = useQuery({ queryKey: ['directory', courseId || null], queryFn: () => api.directory(courseId || undefined) })
  const done = () => {
    invalidateCourseData(qc)
    setPicked([])
    setKeep('')
    setEditing(null)
  }
  const merge = useMutation({ mutationFn: ({ k, m }: { k: string; m: string }) => api.mergeParticipants(k, m), onSuccess: done })
  const rename = useMutation({ mutationFn: ({ id, name }: { id: string; name: string }) => api.renameParticipant(id, name), onSuccess: done })
  const unalias = useMutation({ mutationFn: (key: string) => api.removeAlias(key), onSuccess: done })

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (dir.data ?? []).filter((p) => !needle || p.name.toLowerCase().includes(needle) || p.aliases.some((a) => a.includes(needle)))
  }, [dir.data, q])
  const byId = new Map((dir.data ?? []).map((p) => [p.id, p]))
  const pickedEntries = picked.map((id) => byId.get(id)).filter(Boolean) as DirectoryEntry[]
  const courseById = new Map((courses.data ?? []).map((c) => [c.id, c]))

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 2 ? [p[1], id] : [...p, id]))

  const err = merge.error || rename.error || unalias.error

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl font-semibold text-ink">Devotees</h1>
        <p className="mt-1 text-sm text-muted">
          Tidy up names. Merging two entries combines their attendance; the merged spelling is remembered so future uploads match.
        </p>
      </div>

      <Card className="!p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Course">
            <Select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              <option value="">All my courses</option>
              {courses.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Search">
            <Input type="search" placeholder="Name or alias..." value={q} onChange={(e) => setQ(e.target.value)} />
          </Field>
          <div className="flex items-end">
            <Button variant="primary" disabled={picked.length !== 2} onClick={() => setKeep(picked[0])} className="w-full">
              Merge selected ({picked.length}/2)
            </Button>
          </div>
        </div>
      </Card>

      {err && <ErrorBox error={err} />}

      <Card className="!p-0">
        <CardHeader title={<span className="px-5 pt-5 block">{list.length} devotees</span>} />
        {dir.isLoading ? (
          <div className="p-5">
            <Spinner />
          </div>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {list.slice(0, 300).map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <input
                  type="checkbox"
                  aria-label={`Select ${p.name} for merging`}
                  checked={picked.includes(p.id)}
                  onChange={() => toggle(p.id)}
                />
                <div className="min-w-0 flex-1">
                  {editing?.id === p.id ? (
                    <form
                      className="flex gap-2"
                      onSubmit={(e) => {
                        e.preventDefault()
                        rename.mutate(editing)
                      }}
                    >
                      <Input autoFocus value={editing.name} maxLength={200} onChange={(e) => setEditing({ id: p.id, name: e.target.value })} />
                      <Button size="sm" type="submit" variant="primary">
                        Save
                      </Button>
                      <Button size="sm" type="button" variant="ghost" onClick={() => setEditing(null)}>
                        Cancel
                      </Button>
                    </form>
                  ) : (
                    <>
                      <p className="font-medium text-ink">
                        <Link to={`/d/${p.id}`} className="hover:text-brand hover:underline" title="Open profile">
                          {p.name}
                        </Link>{' '}
                        <button className="text-xs text-muted hover:text-brand" onClick={() => setEditing({ id: p.id, name: p.name })}>
                          rename
                        </button>
                      </p>
                      <p className="text-xs text-muted">
                        {p.sessions} sessions · last {fmtDate(p.last_date)} ·{' '}
                        {p.courses.map((c, i) => {
                          const course = courseById.get(c)
                          return course ? (
                            <span key={c}>
                              {i > 0 && ', '}
                              <Link to={`/c/${course.slug}/p/${p.id}`} className="hover:text-brand hover:underline">
                                {course.name}
                              </Link>
                            </span>
                          ) : null
                        })}
                      </p>
                    </>
                  )}
                  {p.aliases.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {p.aliases.map((a) => (
                        <span key={a} className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-0.5 text-xs text-ink-2">
                          aka "{a}"
                          <button aria-label={`Detach alias ${a}`} title="Detach: future uploads with this spelling become a separate person" className="hover:text-danger" onClick={() => unalias.mutate(a)}>
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={Boolean(keep) && pickedEntries.length === 2}
        onClose={() => setKeep('')}
        title="Merge two devotees"
        footer={
          <>
            <Button onClick={() => setKeep('')}>Cancel</Button>
            <Button
              variant="primary"
              disabled={merge.isPending}
              onClick={() => merge.mutate({ k: keep, m: pickedEntries.find((p) => p.id !== keep)!.id })}
            >
              Merge
            </Button>
          </>
        }
      >
        <p className="mb-3">Choose the name to keep. The other becomes an alias, and its attendance moves over.</p>
        <div className="space-y-2">
          {pickedEntries.map((p) => (
            <label key={p.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2">
              <input type="radio" name="keep" checked={keep === p.id} onChange={() => setKeep(p.id)} />
              <span className="text-ink">{p.name}</span>
              <span className="text-xs text-muted">· {p.sessions} sessions</span>
            </label>
          ))}
        </div>
      </Modal>
    </div>
  )
}
