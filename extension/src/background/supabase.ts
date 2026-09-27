import { createClient } from '@supabase/supabase-js'
import { CONFIG } from './config'

// Service workers have no localStorage; keep the session in chrome.storage.
const storage = {
  getItem: async (key: string) => ((await chrome.storage.local.get(`auth:${key}`))[`auth:${key}`] as string | undefined) ?? null,
  setItem: async (key: string, value: string) => chrome.storage.local.set({ [`auth:${key}`]: value }),
  removeItem: async (key: string) => chrome.storage.local.remove(`auth:${key}`),
}

export const supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, {
  auth: { storage, flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
})

/** Google sign-in through Supabase, using Chrome's extension OAuth window. */
export async function signInWithGoogle(): Promise<void> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: chrome.identity.getRedirectURL(), skipBrowserRedirect: true },
  })
  if (error || !data.url) throw error ?? new Error('Could not start sign-in')
  const redirect = await chrome.identity.launchWebAuthFlow({ url: data.url, interactive: true })
  if (!redirect) throw new Error('Sign-in was cancelled')
  const url = new URL(redirect)
  const fail = url.searchParams.get('error_description') ?? new URLSearchParams(url.hash.slice(1)).get('error_description')
  if (fail) throw new Error(fail.replace(/\+/g, ' '))
  const code = url.searchParams.get('code')
  if (!code) throw new Error('Sign-in did not return a code')
  const res = await supabase.auth.exchangeCodeForSession(code)
  if (res.error) throw res.error
}

/** Local development only (seeded demo accounts). */
export async function signInWithPassword(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
}

export interface Me {
  email: string
  role: 'super_admin' | 'course_admin'
}

export async function currentUser(): Promise<{ email: string; me: Me | null } | null> {
  const { data } = await supabase.auth.getSession()
  if (!data.session) return null
  const { data: me } = await supabase.rpc('me')
  return { email: data.session.user.email ?? '', me: (me as Me | null) ?? null }
}
