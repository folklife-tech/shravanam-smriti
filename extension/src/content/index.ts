// Runs on meet.google.com. Every few seconds, reads who is in the call and
// reports it to the background worker, which keeps the record. Nothing is
// sent anywhere from here.
import { DEFAULT_SETTINGS, type Settings } from '../shared/types'
import { peopleButton, peoplePanelOpen, readMeeting } from './extract'

const TICK_MS = 5_000
const PANEL_RETRY_MS = 30_000
const MAX_PANEL_CLICKS = 3

let settings: Settings = DEFAULT_SETTINGS
let lastCode: string | null = null
let outOfCallChecks = 0
let panelClicks = 0
let lastPanelClick = 0

chrome.storage.local.get('settings').then((v) => (settings = { ...DEFAULT_SETTINGS, ...(v.settings ?? {}) }))
chrome.storage.onChanged.addListener((changes) => {
  if (changes.settings) settings = { ...DEFAULT_SETTINGS, ...(changes.settings.newValue ?? {}) }
})

function send(message: unknown) {
  // Throws if the extension was reloaded or updated; this page then goes quiet.
  chrome.runtime.sendMessage(message).catch(() => {})
}

function tick() {
  const r = readMeeting(document, location.pathname)
  const now = Date.now()

  if (r.inCall && r.code) {
    lastCode = r.code
    outOfCallChecks = 0
    send({ type: 'tick', code: r.code, names: r.names, sources: r.sources, at: now })

    // Large calls only show some video tiles, so keep the People list open.
    if (settings.openPeoplePanel && !peoplePanelOpen(document) && panelClicks < MAX_PANEL_CLICKS && now - lastPanelClick > PANEL_RETRY_MS) {
      const button = peopleButton(document)
      if (button) {
        button.click()
        panelClicks++
        lastPanelClick = now
      }
    }
  } else if (lastCode && ++outOfCallChecks >= 2) {
    // Left the call (the "You left the meeting" screen).
    send({ type: 'end', code: lastCode, at: now })
    lastCode = null
    panelClicks = 0
  }
}

setInterval(tick, TICK_MS)
tick()
