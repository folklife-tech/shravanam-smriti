import type { Segment } from '../../lib/types'

export const SEGMENT_META: Record<Segment, { label: string; tone: 'teal' | 'brand' | 'gold' | 'neutral'; hint: string }> = {
  regular: { label: 'Regular', tone: 'teal', hint: "Attends at or above the course's regular threshold" },
  new: { label: 'New', tone: 'brand', hint: 'First attended within the last 14 days' },
  occasional: { label: 'Occasional', tone: 'gold', hint: 'Comes sometimes' },
  lapsed: { label: 'Lapsed', tone: 'neutral', hint: 'Missed the last 3 sessions' },
}
