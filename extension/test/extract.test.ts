// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { meetingCode, peopleButton, peoplePanelOpen, readMeeting } from '../src/content/extract'

const html = readFileSync('test/fixtures/meet-call.html', 'utf8')

describe('readMeeting', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = new DOMParser().parseFromString(html, 'text/html').documentElement.innerHTML
  })

  it('reads the meeting code from the URL', () => {
    expect(meetingCode('/abc-defg-hij')).toBe('abc-defg-hij')
    expect(meetingCode('/abc-defg-hij?authuser=0')).toBe('abc-defg-hij')
    expect(meetingCode('/landing')).toBeNull()
  })

  it('merges panel and tile names, cleaning labels and skipping presentations and chat', () => {
    const r = readMeeting(document, '/abc-defg-hij')
    expect(r.inCall).toBe(true)
    expect(r.names).toEqual(['Radhika Iyer', 'Arjun Mehta', 'Govind Patel', 'Keshav Nair'])
    expect(r.sources).toEqual({ panel: 4, tiles: 3 }) // the presentation tile is Arjun's, merged with his name
  })

  it('falls back to tiles when the People panel is closed', () => {
    document.querySelector('aside')!.remove()
    expect(peoplePanelOpen(document)).toBe(false)
    expect(readMeeting(document, '/abc-defg-hij').names).toEqual(['Radhika Iyer', 'Arjun Mehta'])
    expect(peopleButton(document)?.getAttribute('aria-label')).toBe('Show everyone')
  })

  it('reports not in a call outside a meeting or after leaving', () => {
    expect(readMeeting(document, '/landing').inCall).toBe(false)
    document.body.innerHTML = '<h1>You left the meeting</h1><button>Rejoin</button>'
    const r = readMeeting(document, '/abc-defg-hij')
    expect(r.inCall).toBe(false)
    expect(r.names).toEqual([])
  })
})
