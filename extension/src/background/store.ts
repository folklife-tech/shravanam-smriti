import { DEFAULT_SETTINGS, type Settings, type State } from '../shared/types'
import { emptyState } from './tracker'

let queue: Promise<unknown> = Promise.resolve()

/**
 * Read-modify-write the saved state, one change at a time (checks arrive every
 * few seconds while uploads and popup actions run concurrently).
 * Keep network calls out of `fn` so checks never wait on them.
 */
export function withState<T>(fn: (s: State) => T | Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const s = ((await chrome.storage.local.get('state')).state as State | undefined) ?? emptyState()
    const result = await fn(s)
    await chrome.storage.local.set({ state: s })
    return result
  })
  queue = run.catch(() => {})
  return run
}

export async function readState(): Promise<State> {
  await queue
  return ((await chrome.storage.local.get('state')).state as State | undefined) ?? emptyState()
}

export async function getSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...((await chrome.storage.local.get('settings')).settings ?? {}) }
}

export async function setSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch }
  await chrome.storage.local.set({ settings: next })
  return next
}
