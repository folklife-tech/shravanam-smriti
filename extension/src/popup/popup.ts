import { csvFileName, meetingCsv } from '../shared/csv'
import type { Meeting, Settings, State } from '../shared/types'

interface PopupState {
  state: State
  settings: Settings
  user: { email: string; me: { email: string; role: string } | null } | null
  appUrl: string
  dev: boolean
}
interface Course {
  id: string
  name: string
  slug: string
}

const app = document.getElementById('app')!
let courses: Course[] | null = null
const openDetails = new Set<string>()
/** course picks survive the frequent re-renders while a call is recording */
const picks = new Map<string, { courseId: string; remember: boolean }>()
let flash: { kind: 'error' | 'info'; text: string } | null = null

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
async function call<T>(req: object): Promise<T> {
  const res = await chrome.runtime.sendMessage(req)
  if (!res?.ok) throw new Error(res?.error ?? 'The extension did not respond')
  return res.result as T
}

type Child = Node | string | null | undefined | false
/** Build an element. Text is always set as text, never parsed as HTML. */
function h(tag: string, attrs: Record<string, unknown> = {}, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener)
    else if (k === 'class') el.className = String(v)
    else if (typeof v === 'boolean') el.toggleAttribute(k, v)
    else el.setAttribute(k, String(v))
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c)
  return el
}

const counted = (m: Meeting) => Object.values(m.participants).filter((p) => p.seconds >= 1).length
const minutes = (ms: number) => Math.max(0, Math.round(ms / 60000))
const when = (ms: number) => new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

async function act(label: string, fn: () => Promise<unknown>) {
  try {
    flash = { kind: 'info', text: `${label}...` }
    await render()
    await fn()
    flash = null
  } catch (e) {
    flash = { kind: 'error', text: e instanceof Error ? e.message : String(e) }
  }
  await render()
}

function downloadCsv(m: Meeting) {
  const blob = new Blob([meetingCsv(m)], { type: 'text/csv;charset=utf-8' })
  const a = h('a', { href: URL.createObjectURL(blob), download: csvFileName(m) }) as HTMLAnchorElement
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

// ---------------------------------------------------------------------------
// sections
// ---------------------------------------------------------------------------
function account(d: PopupState) {
  if (d.user) {
    return h(
      'section',
      { class: 'card' },
      h('div', { class: 'row' }, h('div', {}, 'Signed in as ', h('strong', {}, d.user.email)), h('button', { class: 'link', onclick: () => act('Signing out', () => call({ type: 'signOut' })) }, 'Sign out')),
      !d.user.me && h('p', { class: 'error' }, "This account isn't an admin, so attendance can't be saved. Ask a super admin to add this email in Users."),
    )
  }
  const password = d.dev
    ? h(
        'form',
        {
          class: 'stack',
          onsubmit: (e: Event) => {
            e.preventDefault()
            const f = e.target as HTMLFormElement
            const email = (f.elements.namedItem('email') as HTMLInputElement).value
            act('Signing in', () => call({ type: 'signInPassword', email, password: 'hare-krishna' }))
          },
        },
        h('div', { class: 'muted' }, 'Development build: demo account'),
        h('input', { type: 'email', name: 'email', value: 'admin@example.com', 'aria-label': 'Demo email' }),
        h('button', { type: 'submit' }, 'Sign in (demo)'),
      )
    : null
  return h(
    'section',
    { class: 'card stack' },
    h('div', {}, 'Sign in with the Google account you use for Shravanam Smriti.'),
    h('button', { class: 'primary', onclick: () => act('Opening Google sign-in', () => call({ type: 'signIn' })) }, 'Sign in with Google'),
    password,
  )
}

function recording(m: Meeting) {
  const open = openDetails.has(m.id)
  const now = m.lastNames ?? []
  const people = Object.values(m.participants).sort((a, b) => b.seconds - a.seconds)
  return h(
    'section',
    { class: 'card stack' },
    h('div', { class: 'row' }, h('span', {}, h('span', { class: 'chip rec' }, 'REC'), ' ', h('strong', {}, m.code)), h('span', { class: 'muted' }, `${minutes(m.lastTickAt - m.startedAt)} min`)),
    h('div', { class: 'row' }, h('div', {}, h('div', { class: 'big' }, String(now.length)), h('div', { class: 'muted' }, 'in the call now')), h('div', {}, h('div', { class: 'big' }, String(people.length)), h('div', { class: 'muted' }, 'seen so far'))),
    m.lastSources && m.lastSources.panel === 0
      ? h('div', { class: 'error' }, "The People list isn't open in Meet, so only visible video tiles are counted. Open People in Meet for a complete count.")
      : null,
    h(
      'div',
      { class: 'row' },
      h('button', { class: 'link', onclick: () => (open ? openDetails.delete(m.id) : openDetails.add(m.id), render()) }, open ? 'Hide names' : 'Show names'),
      h('button', { onclick: () => act('Ending', () => call({ type: 'endNow', id: m.id })) }, 'End and save now'),
    ),
    open &&
      h(
        'ul',
        { class: 'names' },
        ...people.map((p) => h('li', {}, h('span', {}, p.name), h('span', { class: 'muted' }, `${Math.round(p.seconds / 60)} min`))),
      ),
  )
}

function courseChooser(m: Meeting) {
  if (!courses) {
    call<Course[]>({ type: 'courses' }).then(
      (c) => ((courses = c), render()),
      (e) => ((flash = { kind: 'error', text: e.message }), render()),
    )
    return h('div', { class: 'muted' }, 'Loading courses...')
  }
  const pick = picks.get(m.id) ?? { courseId: '', remember: true }
  const select = h(
    'select',
    { 'aria-label': 'Course', onchange: () => picks.set(m.id, { ...pick, courseId: select.value }) },
    h('option', { value: '' }, 'Choose a course...'),
    ...courses.map((c) => h('option', { value: c.id, selected: c.id === pick.courseId }, c.name)),
  ) as HTMLSelectElement
  const remember = h('input', {
    type: 'checkbox',
    checked: pick.remember,
    onchange: () => picks.set(m.id, { courseId: select.value, remember: remember.checked }),
  }) as HTMLInputElement
  return h(
    'div',
    { class: 'stack' },
    select,
    h('label', { class: 'toggle' }, remember, `Always use this course for ${m.code}`),
    h('button', { class: 'primary', onclick: () => select.value && act('Saving', () => call({ type: 'upload', id: m.id, options: { courseId: select.value, remember: remember.checked } })) }, 'Save attendance'),
  )
}

function attention(m: Meeting) {
  const title = h('div', { class: 'row' }, h('strong', {}, m.code), h('span', { class: 'muted' }, `${when(m.startedAt)} - ${counted(m)} people`))
  const discard = h('button', { onclick: () => confirm('Discard this attendance record? It will not be saved.') && act('Discarding', () => call({ type: 'discard', id: m.id })) }, 'Discard')
  const csv = h('button', { onclick: () => downloadCsv(m) }, 'CSV')
  let body: Child
  switch (m.status) {
    case 'needs-course':
      body = h('div', { class: 'stack' }, h('div', {}, "This meeting code isn't linked to a course yet."), courseChooser(m))
      break
    case 'conflict':
      body = h(
        'div',
        { class: 'stack' },
        h('div', {}, `A session at this time already exists (${m.existing?.rows ?? '?'} people, ${m.existing?.source_filename ?? 'uploaded earlier'}).`),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'primary', onclick: () => act('Replacing', () => call({ type: 'upload', id: m.id, options: { courseId: m.courseId, mode: 'replace', sessionId: m.existing?.id } })) }, 'Replace it'),
          h('button', { onclick: () => act('Saving', () => call({ type: 'upload', id: m.id, options: { courseId: m.courseId, mode: 'append' } })) }, 'Keep both'),
        ),
      )
      break
    case 'needs-sign-in':
      body = h('div', {}, 'Sign in above and it will be saved automatically.')
      break
    case 'ended':
      body = h('button', { class: 'primary', onclick: () => act('Saving', () => call({ type: 'upload', id: m.id })) }, 'Save attendance')
      break
    default:
      body = h('div', { class: 'stack' }, h('div', { class: 'error' }, m.error ?? 'Saving failed.'), h('button', { onclick: () => act('Retrying', () => call({ type: 'upload', id: m.id })) }, 'Try again'))
  }
  return h('section', { class: 'card stack' }, title, body, h('div', { class: 'row' }, csv, discard))
}

function recent(ms: Meeting[], appUrl: string) {
  if (!ms.length) return null
  const chip = (m: Meeting) =>
    m.status === 'uploaded' ? h('span', { class: 'chip good' }, 'saved') : m.status === 'discarded' ? h('span', { class: 'chip' }, 'discarded') : h('span', { class: 'chip warn' }, m.status)
  return h(
    'section',
    { class: 'card' },
    h('h2', {}, 'Recent meetings'),
    h(
      'ul',
      { class: 'names' },
      ...ms.map((m) =>
        h(
          'li',
          {},
          h('span', {}, `${when(m.startedAt)} - ${m.code} - ${counted(m)}`),
          h(
            'span',
            {},
            chip(m),
            ' ',
            m.status === 'uploaded' && m.courseSlug && m.sessionId
              ? h('a', { href: `${appUrl}#/c/${m.courseSlug}?session=${m.sessionId}`, target: '_blank', rel: 'noreferrer' }, 'open')
              : null,
            ' ',
            h('button', { class: 'link', onclick: () => downloadCsv(m) }, 'CSV'),
          ),
        ),
      ),
    ),
  )
}

function settingsCard(s: Settings, appUrl: string) {
  const toggle = (key: keyof Settings, label: string) =>
    h(
      'label',
      { class: 'toggle' },
      h('input', { type: 'checkbox', checked: s[key], onchange: (e: Event) => act('Saving settings', () => call({ type: 'settings', patch: { [key]: (e.target as HTMLInputElement).checked } })) }),
      label,
    )
  return h(
    'section',
    { class: 'card stack' },
    h('h2', {}, 'Settings'),
    toggle('autoUpload', 'Save automatically when the meeting ends'),
    toggle('openPeoplePanel', "Open Meet's People list automatically (needed for a full count)"),
    h('a', { href: appUrl, target: '_blank', rel: 'noreferrer' }, 'Open Shravanam Smriti'),
  )
}

// ---------------------------------------------------------------------------
async function render() {
  let d: PopupState
  try {
    d = await call<PopupState>({ type: 'state' })
  } catch (e) {
    app.replaceChildren(h('p', { class: 'error' }, e instanceof Error ? e.message : String(e)))
    return
  }
  const all = Object.values(d.state.meetings).sort((a, b) => b.startedAt - a.startedAt)
  const live = all.filter((m) => m.status === 'recording')
  const needs = all.filter((m) => ['needs-course', 'needs-sign-in', 'conflict', 'error', 'ended'].includes(m.status))
  const done = all.filter((m) => m.status === 'uploaded' || m.status === 'discarded').slice(0, 8)

  app.replaceChildren(
    ...[
      flash && h('p', { class: flash.kind === 'error' ? 'error' : 'muted' }, flash.text),
      account(d),
      ...(live.length ? live.map(recording) : [h('section', { class: 'card muted' }, 'Not recording. Join a Google Meet call and attendance is counted automatically.')]),
      ...needs.map(attention),
      recent(done, d.appUrl),
      settingsCard(d.settings, d.appUrl),
    ].filter((x): x is HTMLElement => Boolean(x)),
  )
}

let pending: number | undefined
chrome.storage.onChanged.addListener(() => {
  clearTimeout(pending)
  pending = window.setTimeout(render, 250)
})
render()
