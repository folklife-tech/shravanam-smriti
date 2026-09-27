import { describe, expect, it } from 'vitest'
import { applyTick, emptyState, endMeeting, endStale, END_GRACE_MS, MAX_STEP_MS, payloadRows, REJOIN_GAP_MS } from '../src/background/tracker'
import { cleanName, nameKey } from '../src/shared/names'
import { hms, wallClock } from '../src/shared/time'
import { meetingCsv } from '../src/shared/csv'

const T0 = Date.UTC(2026, 8, 23, 14, 51, 1) // 20:21:01 in Asia/Kolkata

describe('tracker', () => {
  it('counts time only between consecutive sightings', () => {
    const s = emptyState()
    applyTick(s, 'abc-defg-hij', ['Arjun', 'Radhika'], T0)
    applyTick(s, 'abc-defg-hij', ['Arjun', 'Radhika'], T0 + 5_000)
    applyTick(s, 'abc-defg-hij', ['Arjun'], T0 + 10_000) // Radhika drops
    const m = applyTick(s, 'abc-defg-hij', ['Arjun', 'radhika'], T0 + 15_000) // back, other casing
    expect(m.participants['arjun'].seconds).toBe(15)
    expect(m.participants['radhika'].seconds).toBe(5) // the gap isn't counted
    expect(m.participants['radhika'].firstSeen).toBe(T0)
    expect(m.peak).toBe(2)
  })

  it('caps long gaps (throttled background tabs)', () => {
    const s = emptyState()
    applyTick(s, 'abc-defg-hij', ['Arjun'], T0)
    const m = applyTick(s, 'abc-defg-hij', ['Arjun'], T0 + 10 * 60_000)
    expect(m.participants['arjun'].seconds).toBe(MAX_STEP_MS / 1000)
  })

  it('continues the same meeting after a short reload, starts a new one after a long gap', () => {
    const s = emptyState()
    const a = applyTick(s, 'abc-defg-hij', ['Arjun'], T0)
    expect(applyTick(s, 'abc-defg-hij', ['Arjun'], T0 + 60_000).id).toBe(a.id)
    const b = applyTick(s, 'abc-defg-hij', ['Arjun'], T0 + 60_000 + REJOIN_GAP_MS + 1)
    expect(b.id).not.toBe(a.id)
    expect(s.meetings[a.id].status).toBe('ended')
  })

  it('ends meetings explicitly or after the grace period', () => {
    const s = emptyState()
    const a = applyTick(s, 'abc-defg-hij', ['Arjun'], T0)
    const b = applyTick(s, 'xyz-wxyz-xyz', ['Keshav'], T0)
    endMeeting(s, a.id)
    expect(s.meetings[a.id].status).toBe('ended')
    expect(s.active['abc-defg-hij']).toBeUndefined()
    expect(endStale(s, T0 + END_GRACE_MS - 1)).toHaveLength(0)
    expect(endStale(s, T0 + END_GRACE_MS + 1).map((m) => m.id)).toEqual([b.id])
    // a new check for an ended meeting's code starts a fresh meeting
    expect(applyTick(s, 'abc-defg-hij', ['Arjun'], T0 + 5_000).id).not.toBe(a.id)
  })

  it('builds upload rows in the course timezone, skipping zero-second glimpses', () => {
    const s = emptyState()
    applyTick(s, 'abc-defg-hij', ['Arjun', 'Passer By'], T0)
    applyTick(s, 'abc-defg-hij', ['Arjun'], T0 + 30_000)
    const rows = payloadRows(s.meetings[s.active['abc-defg-hij']], (ms) => wallClock(ms, 'Asia/Kolkata'))
    expect(rows).toEqual([{ name: 'Arjun', first_seen: '2026-09-23 20:21:01', seconds: 30 }])
  })
})

describe('names and time', () => {
  it('cleans Meet labels', () => {
    expect(cleanName('  Radhika Iyer (You) ')).toBe('Radhika Iyer')
    expect(cleanName('Keshav Nair (Meeting host)')).toBe('Keshav Nair')
    expect(cleanName('Arjun Mehta (Presentation)')).toBe('Arjun Mehta')
    expect(cleanName('Arjun is presenting')).toBeNull()
    expect(cleanName('You')).toBeNull()
    expect(cleanName('')).toBeNull()
    expect(nameKey('  José   Álvarez ')).toBe('jose alvarez')
  })

  it('formats times', () => {
    expect(wallClock(T0, 'Asia/Kolkata')).toBe('2026-09-23 20:21:01')
    expect(hms(3619)).toBe('01:00:19')
  })

  it('exports the same CSV layout the web app imports', () => {
    const s = emptyState()
    applyTick(s, 'abc-defg-hij', ['=Arjun'], T0)
    const m = applyTick(s, 'abc-defg-hij', ['=Arjun'], T0 + 60_000)
    const csv = meetingCsv(m, 'Asia/Kolkata').split('\n')
    expect(csv[1]).toBe('"*     Meeting code: abc-defg-hij"')
    expect(csv[2]).toBe('"*     Created on 2026-09-23 20:21:01"')
    expect(csv[4]).toBe('"Full Name","First Seen","Time in Call"')
    expect(csv[5]).toBe(`"'=Arjun","2026-09-23 20:21:01","00:01:00"`)
  })
})
