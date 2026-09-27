export interface Participant {
  name: string
  /** epoch ms */
  firstSeen: number
  /** epoch ms of the last check that saw them */
  lastSeen: number
  /** seconds counted as present */
  seconds: number
}

export type MeetingStatus =
  | 'recording'
  | 'ended' // finished, waiting to upload
  | 'needs-course' // meeting code isn't linked to a course yet
  | 'needs-sign-in'
  | 'conflict' // a session at this time already exists
  | 'error' // upload failed; retried automatically
  | 'uploaded'
  | 'discarded'

export interface ExistingSession {
  id: string
  session_date: string
  started_at: string
  ended_at: string
  rows: number
  source_filename: string | null
}

export interface Meeting {
  id: string
  code: string
  startedAt: number
  /** last check time; becomes the end time */
  lastTickAt: number
  tabId?: number
  participants: Record<string, Participant>
  peak: number
  status: MeetingStatus
  courseId?: string
  courseSlug?: string
  sessionId?: string
  existing?: ExistingSession
  error?: string
  attempts?: number
  uploadedAt?: number
  /** status we last showed a notification for */
  notifiedStatus?: MeetingStatus
  /** latest check, for the popup's live view */
  lastNames?: string[]
  lastSources?: { panel: number; tiles: number }
}

export interface Settings {
  autoUpload: boolean
  openPeoplePanel: boolean
}

export const DEFAULT_SETTINGS: Settings = { autoUpload: true, openPeoplePanel: true }

export interface State {
  meetings: Record<string, Meeting>
  /** meeting code -> id of the meeting currently recording for it */
  active: Record<string, string>
}

/** content script -> background */
export type TickMessage = { type: 'tick'; code: string; names: string[]; sources: { panel: number; tiles: number }; at: number }
export type EndMessage = { type: 'end'; code: string; at: number }
