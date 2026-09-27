import type { Meeting, Settings } from '../shared/types'
import { CONFIG } from './config'
import { getSettings, readState, setSettings, withState } from './store'
import { currentUser, signInWithGoogle, signInWithPassword, supabase } from './supabase'
import { applyTick, endMeeting, endStale, prune } from './tracker'
import { MAX_ATTEMPTS, processQueue, uploadMeeting, type UploadOptions } from './upload'

const CODE_RE = /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/
const ATTENTION = new Set(['needs-course', 'needs-sign-in', 'conflict'])

// ---------------------------------------------------------------------------
// Badge and notifications
// ---------------------------------------------------------------------------
async function refreshBadge() {
  const meetings = Object.values((await readState()).meetings)
  const recording = meetings.some((m) => m.status === 'recording')
  const attention = meetings.filter((m) => ATTENTION.has(m.status) || (m.status === 'error' && (m.attempts ?? 0) >= MAX_ATTEMPTS)).length
  await chrome.action.setBadgeText({ text: recording ? 'REC' : attention ? String(attention) : '' })
  await chrome.action.setBadgeBackgroundColor({ color: recording ? '#c0392b' : '#d9661f' })
}

function notify(m: Meeting) {
  const count = Object.values(m.participants).filter((p) => p.seconds >= 1).length
  const messages: Partial<Record<Meeting['status'], string>> = {
    uploaded: `Saved attendance for ${count} devotee${count === 1 ? '' : 's'} (${m.code}).`,
    'needs-course': `Meeting ${m.code} isn't linked to a course yet. Open the extension to choose one.`,
    'needs-sign-in': 'Sign in to the extension so finished meetings can be saved.',
    conflict: `A session at this time already exists for ${m.code}. Open the extension to decide.`,
  }
  const message = messages[m.status]
  if (!message) return
  chrome.notifications.create(`m:${m.id}:${m.status}`, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
    title: 'Shravanam Smriti',
    message,
  })
}

/** Run an upload step, then notify once per status change (not on every retry). */
async function uploadAndNotify(run: () => Promise<Meeting[] | Meeting | undefined>) {
  const changed = [await run()].flat().filter((m): m is Meeting => Boolean(m) && m!.notifiedStatus !== m!.status)
  if (changed.length) {
    await withState((s) => {
      for (const m of changed) if (s.meetings[m.id]) s.meetings[m.id].notifiedStatus = m.status
    })
    changed.forEach(notify)
  }
  await refreshBadge()
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------
type PopupRequest =
  | { type: 'state' }
  | { type: 'courses' }
  | { type: 'endNow'; id: string }
  | { type: 'upload'; id: string; options?: UploadOptions }
  | { type: 'discard'; id: string }
  | { type: 'signIn' }
  | { type: 'signInPassword'; email: string; password: string }
  | { type: 'signOut' }
  | { type: 'settings'; patch: Partial<Settings> }

function isValidTick(msg: { code?: unknown; names?: unknown; at?: unknown }): boolean {
  return (
    typeof msg.code === 'string' &&
    CODE_RE.test(msg.code) &&
    Array.isArray(msg.names) &&
    msg.names.length <= 2000 &&
    msg.names.every((n) => typeof n === 'string' && n.length > 0 && n.length <= 200) &&
    typeof msg.at === 'number' &&
    Math.abs(msg.at - Date.now()) < 5 * 60_000
  )
}

async function handleContent(msg: { type: string; code: string; names: string[]; sources: Meeting['lastSources']; at: number }, tabId?: number) {
  if (msg.type === 'tick' && isValidTick(msg)) {
    await withState((s) => {
      const m = applyTick(s, msg.code, msg.names, msg.at, tabId)
      m.lastNames = msg.names
      m.lastSources = msg.sources
    })
    await refreshBadge()
  } else if (msg.type === 'end' && typeof msg.code === 'string') {
    await withState((s) => {
      const id = s.active[msg.code]
      if (id) endMeeting(s, id)
    })
    await uploadAndNotify(processQueue)
  }
}

async function handlePopup(req: PopupRequest): Promise<unknown> {
  switch (req.type) {
    case 'state':
      return {
        state: await readState(),
        settings: await getSettings(),
        user: await currentUser().catch(() => null),
        appUrl: CONFIG.appUrl,
        dev: CONFIG.dev,
      }
    case 'courses': {
      const { data, error } = await supabase.from('courses').select('id, name, slug, status').neq('status', 'archived').order('name')
      if (error) throw error
      return data
    }
    case 'endNow':
      await withState((s) => endMeeting(s, req.id))
      await uploadAndNotify(processQueue)
      return true
    case 'upload':
      await uploadAndNotify(() => uploadMeeting(req.id, req.options))
      return true
    case 'discard':
      await withState((s) => {
        const m = s.meetings[req.id]
        if (m && m.status !== 'recording') m.status = 'discarded'
      })
      await refreshBadge()
      return true
    case 'signIn':
      await signInWithGoogle()
      await uploadAndNotify(processQueue)
      return true
    case 'signInPassword':
      if (!CONFIG.dev) throw new Error('Password sign-in is only available in development builds')
      await signInWithPassword(req.email, req.password)
      await uploadAndNotify(processQueue)
      return true
    case 'signOut':
      await supabase.auth.signOut()
      return true
    case 'settings': {
      const next = await setSettings(req.patch)
      if (req.patch.autoUpload) await uploadAndNotify(processQueue)
      return next
    }
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false
  // Content scripts report the Meet page's URL; our own pages (the popup, even
  // when opened in a tab) report the extension's origin.
  const fromMeet = Boolean(sender.tab) && sender.url?.startsWith('https://meet.google.com/')
  const fromExtensionPage = sender.url?.startsWith(chrome.runtime.getURL('')) ?? false

  let work: Promise<unknown>
  if (fromMeet && (msg?.type === 'tick' || msg?.type === 'end')) work = handleContent(msg, sender.tab?.id)
  else if (fromExtensionPage) work = handlePopup(msg as PopupRequest)
  else return false

  work.then(
    (result) => sendResponse({ ok: true, result }),
    (e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }),
  )
  return true // keep the channel open for the async reply
})

// ---------------------------------------------------------------------------
// Meeting end detection and retries
// ---------------------------------------------------------------------------
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const ended = await withState((s) =>
    Object.values(s.meetings)
      .filter((m) => m.status === 'recording' && m.tabId === tabId)
      .map((m) => endMeeting(s, m.id)),
  )
  if (ended.length) await uploadAndNotify(processQueue)
})

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'sweep') return
  await withState((s) => {
    endStale(s, Date.now())
    prune(s)
  })
  await uploadAndNotify(processQueue)
})

function ensureAlarm() {
  chrome.alarms.create('sweep', { periodInMinutes: 1 })
}
chrome.runtime.onInstalled.addListener(ensureAlarm)
chrome.runtime.onStartup.addListener(ensureAlarm)
ensureAlarm()
refreshBadge()
