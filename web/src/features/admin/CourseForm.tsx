import { useState, type KeyboardEvent } from 'react'
import { Button, Field, FieldGroup, Input, Select } from '../../components/ui'
import { slugify } from '../../lib/format'
import type { Course, CourseStatus } from '../../lib/types'

export type CourseDraft = Pick<
  Course,
  | 'name'
  | 'slug'
  | 'description'
  | 'schedule_note'
  | 'timezone'
  | 'start_date'
  | 'end_date'
  | 'status'
  | 'min_present_minutes'
  | 'regular_threshold_pct'
  | 'host_names'
>

export const emptyDraft: CourseDraft = {
  name: '',
  slug: '',
  description: '',
  schedule_note: '',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata',
  start_date: null,
  end_date: null,
  status: 'active',
  min_present_minutes: 10,
  regular_threshold_pct: 50,
  host_names: [],
}

const timezones: string[] = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf('timeZone')
  } catch {
    return ['Asia/Kolkata', 'UTC']
  }
})()

export function ChipsInput({
  values,
  onChange,
  placeholder,
  normalize = (s) => s.trim(),
  validate,
  ariaLabel,
}: {
  ariaLabel?: string
  values: string[]
  onChange: (v: string[]) => void
  placeholder: string
  normalize?: (s: string) => string
  validate?: (s: string) => string | null
}) {
  const [text, setText] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const add = () => {
    const v = normalize(text)
    if (!v) return
    const e = validate?.(v) ?? null
    if (e) return setErr(e)
    if (!values.includes(v)) onChange([...values, v])
    setText('')
    setErr(null)
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      add()
    } else if (e.key === 'Backspace' && !text && values.length) {
      onChange(values.slice(0, -1))
    }
  }
  return (
    <div>
      <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1.5 focus-within:border-brand">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-0.5 text-sm text-ink">
            {v}
            <button type="button" aria-label={`Remove ${v}`} className="text-muted hover:text-danger" onClick={() => onChange(values.filter((x) => x !== v))}>
              ✕
            </button>
          </span>
        ))}
        <input
          aria-label={ariaLabel ?? placeholder}
          className="min-w-32 flex-1 bg-transparent px-1 text-sm text-ink outline-none placeholder:text-muted"
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          onBlur={add}
        />
      </div>
      {err && <p className="mt-1 text-xs text-danger">{err}</p>}
    </div>
  )
}

export function CourseForm({
  initial,
  onSubmit,
  submitLabel,
  busy,
  isNew,
}: {
  initial: CourseDraft
  onSubmit: (d: CourseDraft) => void
  submitLabel: string
  busy?: boolean
  isNew?: boolean
}) {
  const [d, setD] = useState<CourseDraft>(initial)
  const [slugTouched, setSlugTouched] = useState(!isNew)
  const set = <K extends keyof CourseDraft>(k: K, v: CourseDraft[K]) => setD((x) => ({ ...x, [k]: v }))

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(d)
      }}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Name">
          <Input
            required
            maxLength={120}
            value={d.name}
            onChange={(e) => {
              set('name', e.target.value)
              if (!slugTouched) set('slug', slugify(e.target.value))
            }}
          />
        </Field>
        <Field label="URL slug" hint="Lowercase letters, numbers and dashes. Changing it changes the page link.">
          <Input
            required
            pattern="[a-z0-9][a-z0-9-]{1,62}"
            value={d.slug}
            onChange={(e) => {
              setSlugTouched(true)
              set('slug', e.target.value.toLowerCase())
            }}
          />
        </Field>
        <Field label="Schedule" hint="Shown under the name, e.g. 'Daily, 8:30 PM'">
          <Input maxLength={200} value={d.schedule_note} onChange={(e) => set('schedule_note', e.target.value)} />
        </Field>
        <Field label="Status">
          <Select value={d.status} onChange={(e) => set('status', e.target.value as CourseStatus)}>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="archived">Archived (hidden from home, data kept)</option>
          </Select>
        </Field>
      </div>
      <Field label="Description">
        <textarea
          maxLength={2000}
          rows={2}
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none"
          value={d.description}
          onChange={(e) => set('description', e.target.value)}
        />
      </Field>
      <div className="grid gap-4 md:grid-cols-4">
        <Field label="Timezone" hint="Meet exports use local time">
          <Select value={d.timezone} onChange={(e) => set('timezone', e.target.value)}>
            {!timezones.includes(d.timezone) && <option value={d.timezone}>{d.timezone}</option>}
            {timezones.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Start date">
          <Input type="date" value={d.start_date ?? ''} onChange={(e) => set('start_date', e.target.value || null)} />
        </Field>
        <Field label="End date">
          <Input type="date" value={d.end_date ?? ''} onChange={(e) => set('end_date', e.target.value || null)} />
        </Field>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Counts as present after (minutes)" hint="Shorter visits are ignored in stats. Applies to past sessions too.">
          <Input type="number" min={0} max={600} value={d.min_present_minutes} onChange={(e) => set('min_present_minutes', Number(e.target.value))} />
        </Field>
        <Field label="Regular devotee threshold (%)" hint="Attendance rate needed to be labelled 'Regular'.">
          <Input type="number" min={1} max={100} value={d.regular_threshold_pct} onChange={(e) => set('regular_threshold_pct', Number(e.target.value))} />
        </Field>
      </div>
      <FieldGroup label="Host accounts" hint="Names excluded from stats (e.g. the shared host login). Press Enter to add.">
        <ChipsInput values={d.host_names} onChange={(v) => set('host_names', v)} placeholder="Add a name..." ariaLabel="Add a host account name" />
      </FieldGroup>
      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'Saving...' : submitLabel}
        </Button>
      </div>
    </form>
  )
}
