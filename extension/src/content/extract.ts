// Everything that depends on Google Meet's page structure lives here, so it
// is easy to update if Meet changes. Meet's markup is undocumented; these
// selectors use its more stable attributes (roles, aria labels, data-*).
import { cleanName, nameKey } from '../shared/names'

export interface Reading {
  code: string | null
  inCall: boolean
  names: string[]
  /** how many names came from each source, for the popup's diagnostics */
  sources: { panel: number; tiles: number }
}

const CODE_RE = /^\/([a-z]{3}-[a-z]{4}-[a-z]{3})(?:$|[/?#])/

export function meetingCode(pathname: string): string | null {
  return CODE_RE.exec(pathname)?.[1] ?? null
}

/** Names in the People panel: list items labelled with the person's name. */
function panelNames(doc: Document): string[] {
  const out: string[] = []
  for (const item of doc.querySelectorAll<HTMLElement>('[role="list"] [role="listitem"][aria-label]')) {
    // People entries carry an avatar; other lists (chat, menus) generally don't.
    if (!item.querySelector('img')) continue
    const n = cleanName(item.getAttribute('aria-label'))
    if (n) out.push(n)
  }
  return out
}

/** Names on video tiles. Large calls show only some tiles, so the panel is preferred. */
function tileNames(doc: Document): string[] {
  const out: string[] = []
  for (const tile of doc.querySelectorAll<HTMLElement>('[data-participant-id]')) {
    const self = tile.querySelector('[data-self-name]')?.getAttribute('data-self-name')
    const label = tile.querySelector('.notranslate')?.textContent
    const n = cleanName(self || label || tile.getAttribute('aria-label'))
    if (n) out.push(n)
  }
  return out
}

/** A "Leave call" style button is present only while in a call. */
function hasLeaveButton(doc: Document): boolean {
  return Boolean(
    doc.querySelector('button[aria-label*="leave call" i], button[aria-label*="leave meeting" i], [data-tooltip*="leave call" i]'),
  )
}

export function readMeeting(doc: Document, pathname: string): Reading {
  const code = meetingCode(pathname)
  const panel = panelNames(doc)
  const tiles = tileNames(doc)
  const seen = new Set<string>()
  const names: string[] = []
  for (const n of [...panel, ...tiles]) {
    const k = nameKey(n)
    if (!seen.has(k)) {
      seen.add(k)
      names.push(n)
    }
  }
  const inCall = Boolean(code) && (hasLeaveButton(doc) || doc.querySelector('[data-participant-id]') !== null)
  return { code, inCall, names: inCall ? names : [], sources: { panel: panel.length, tiles: tiles.length } }
}

/** The button that opens the People panel (English labels plus a generic fallback). */
export function peopleButton(doc: Document): HTMLElement | null {
  return doc.querySelector<HTMLElement>(
    'button[aria-label*="people" i], button[aria-label*="participants" i], button[aria-label*="show everyone" i]',
  )
}

export function peoplePanelOpen(doc: Document): boolean {
  return doc.querySelector('[role="list"] [role="listitem"][aria-label] img') !== null
}
