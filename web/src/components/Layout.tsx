import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthProvider'
import { applyTheme, useTheme } from '../lib/theme'
import { Wordmark } from './Logo'

function NavItem({ to, children }: { to: string; children: string }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `rounded-lg px-3 py-1.5 text-sm font-medium transition ${isActive ? 'bg-surface-2 text-ink' : 'text-ink-2 hover:text-ink'}`
      }
    >
      {children}
    </NavLink>
  )
}

export function Layout() {
  const { me, signOut } = useAuth()
  const theme = useTheme()
  return (
    <div className="flex min-h-screen flex-col">
      <header className="halo border-b border-line">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <NavLink to="/" aria-label="Home">
            <Wordmark />
          </NavLink>
          <nav className="flex flex-wrap items-center gap-1" aria-label="Main">
            <NavItem to="/">Courses</NavItem>
            <NavItem to="/upload">Upload</NavItem>
            <NavItem to="/admin/courses">Manage</NavItem>
            <NavItem to="/admin/participants">Devotees</NavItem>
            {me?.role === 'super_admin' && <NavItem to="/admin/admins">Users</NavItem>}
          </nav>
          <div className="flex items-center gap-2">
            <button
              onClick={() => applyTheme(theme === 'dark' ? 'light' : 'dark', true)}
              className="grid h-9 w-9 place-items-center rounded-lg text-ink-2 hover:bg-surface-2"
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              title="Toggle theme"
            >
              {theme === 'dark' ? '☀' : '☾'}
            </button>
            <span className="hidden max-w-48 truncate text-xs text-muted md:inline" title={me?.email}>
              {me?.email}
            </span>
            <button onClick={signOut} className="rounded-lg px-3 py-1.5 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink">
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        <Outlet />
      </main>
      <footer className="border-t border-line py-6 text-center text-xs text-muted">
        <p className="font-display text-sm italic text-ink-2">
          "Their minds fixed on Me, they enlighten one another and delight in speaking of Me."
        </p>
        <p className="mt-1">Bhagavad Gita 10.9</p>
      </footer>
    </div>
  )
}
