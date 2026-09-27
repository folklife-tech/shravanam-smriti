import type { Meeting } from './types'
import { hms, wallClock } from './time'

const cell = (v: string) => {
  // Neutralise spreadsheet formulas, then quote.
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
  return `"${safe.replace(/"/g, '""')}"`
}

/**
 * The attendance file in the same layout as the Meet exports the web app
 * already accepts, so it can be uploaded by hand if needed.
 */
export function meetingCsv(m: Meeting, timeZone?: string): string {
  const people = Object.values(m.participants).sort((a, b) => a.name.localeCompare(b.name))
  const lines = [
    cell('*     Meet'),
    cell(`*     Meeting code: ${m.code}`),
    cell(`*     Created on ${wallClock(m.startedAt, timeZone)}`),
    cell(`*     Ended on ${wallClock(m.lastTickAt, timeZone)}`),
    ['Full Name', 'First Seen', 'Time in Call'].map(cell).join(','),
    ...people.map((p) => [p.name, wallClock(p.firstSeen, timeZone), hms(p.seconds)].map(cell).join(',')),
  ]
  return lines.join('\n') + '\n'
}

export function csvFileName(m: Meeting): string {
  const d = new Date(m.startedAt)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `meeting_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}_${m.code}.csv`
}
