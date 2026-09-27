import { useState, type ReactNode } from 'react'
import { FluteDivider, Feather } from '../../components/Logo'
import { Button, ErrorBox, Input } from '../../components/ui'
import { authRedirectUrl, supabase } from '../../lib/supabase'
import { useAuth } from './AuthProvider'

const emailLoginEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_EMAIL_LOGIN === 'true'

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="halo grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-line bg-surface p-8 text-center shadow-xl">
        <Feather className="mx-auto h-16 w-16" />
        <h1 className="mt-3 font-display text-4xl font-semibold text-ink">Shravanam Smriti</h1>
        <p className="mt-1 text-sm text-muted">Remembering every devotee who comes to hear.</p>
        <div className="my-6">
          <FluteDivider />
        </div>
        {children}
        <blockquote className="mt-8 border-t border-line pt-5 text-sm">
          <p className="font-display text-lg italic text-ink-2">śravaṇaṁ kīrtanaṁ viṣṇoḥ smaraṇaṁ</p>
          <p className="mt-1 text-xs text-muted">Hearing, chanting and remembering the Lord - Srimad Bhagavatam 7.5.23</p>
        </blockquote>
      </div>
    </div>
  )
}

/** OAuth failures (e.g. the sign-up hook rejecting an email) come back as ?error_description=... */
function redirectError(): Error | null {
  const params = new URLSearchParams(window.location.search || window.location.hash.replace(/^#\/?\??/, ''))
  const msg = params.get('error_description')
  return msg ? new Error(msg.replace(/\+/g, ' ')) : null
}

export function LoginPage() {
  const [error, setError] = useState<unknown>(redirectError)
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)

  const google = async () => {
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: authRedirectUrl() } })
    if (error) setError(error)
  }

  const magic = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: authRedirectUrl(), shouldCreateUser: true },
    })
    if (error) setError(error)
    else setSent(true)
  }

  return (
    <Shell>
      <p className="mb-4 text-sm text-ink-2">Administrators only. Sign in to see course insights.</p>
      <Button variant="primary" className="w-full" onClick={google}>
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
          <path fill="#fff" d="M21.35 11.1H12v2.9h5.35c-.23 1.5-1.7 4.4-5.35 4.4a5.9 5.9 0 1 1 0-11.8c1.8 0 3 .77 3.7 1.43l2.5-2.4C16.6 4.1 14.5 3 12 3a9 9 0 1 0 0 18c5.2 0 8.65-3.65 8.65-8.8 0-.6-.07-1.05-.15-1.5Z" />
        </svg>
        Continue with Google
      </Button>
      {import.meta.env.DEV && <DevQuickLogin onError={setError} />}
      {emailLoginEnabled && (
        <form onSubmit={magic} className="mt-4 space-y-2 text-left">
          <p className="text-center text-xs text-muted">or get a sign-in link by email</p>
          <Input type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" className="w-full" disabled={sent}>
            {sent ? 'Check your inbox' : 'Email me a link'}
          </Button>
        </form>
      )}
      {error != null && (
        <div className="mt-4">
          <ErrorBox error={error} />
        </div>
      )}
    </Shell>
  )
}

// Local development only: one-click sign-in as the seeded demo accounts
// (supabase/seed.sql). `import.meta.env.DEV` is false in production builds,
// so this is removed from the deployed site.
const DEMO_ACCOUNTS = [
  { email: 'admin@example.com', label: 'Super admin' },
  { email: 'guide@example.com', label: 'Course admin' },
  { email: 'visitor@example.com', label: 'No access' },
]

function DevQuickLogin({ onError }: { onError: (e: unknown) => void }) {
  const signIn = async (email: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password: 'hare-krishna' })
    if (error) onError(error)
  }
  return (
    <div className="mt-4 rounded-xl border border-dashed border-line p-3">
      <p className="mb-2 text-xs text-muted">Local dev · quick sign-in</p>
      <div className="flex flex-wrap justify-center gap-2">
        {DEMO_ACCOUNTS.map((a) => (
          <Button key={a.email} size="sm" onClick={() => signIn(a.email)} title={a.email}>
            {a.label}
          </Button>
        ))}
      </div>
    </div>
  )
}

export function NoAccessPage() {
  const { session, signOut } = useAuth()
  return (
    <Shell>
      <p className="text-ink">Hare Krishna!</p>
      <p className="mt-2 text-sm text-ink-2">
        <strong>{session?.user.email}</strong> doesn't have access yet. Please ask an administrator to add your email.
      </p>
      <Button className="mt-5" onClick={signOut}>
        Sign out
      </Button>
    </Shell>
  )
}

export function NotConfiguredPage() {
  return (
    <Shell>
      <p className="text-sm text-ink-2">
        This build has no backend configured. Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> and
        rebuild.
      </p>
    </Shell>
  )
}
