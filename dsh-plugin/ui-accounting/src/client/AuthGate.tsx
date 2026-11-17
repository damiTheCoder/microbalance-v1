/** Google-only sign-in gate plus first-run organization onboarding. */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { JSX, ReactNode } from 'react'
import logoUrl from './assets/logo.png'
import { authClient, CORE_ORIGIN, startGoogleSignIn } from './auth-client.ts'
import css from './accounting.module.css'

interface Organization {
  id: string
  name: string
}

const slugify = (name: string): string =>
  `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Math.random()
    .toString(36)
    .slice(2, 6)}`

/**
 * Wraps a page: shows the Google login screen when signed out, the business
 * onboarding modal when the user has no active organization, and the page
 * itself once a company is selected.
 */
export function AuthGate({ children }: { children: ReactNode }): JSX.Element {
  const { data: session, isPending } = authClient.useSession()
  const [organizations, setOrganizations] = useState<Organization[] | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const autoRedirected = useRef(false)

  const messageOf = (cause: unknown): string =>
    cause instanceof Error ? cause.message : String(cause)

  const loadOrganizations = useCallback(async (): Promise<void> => {
    const result = await authClient.organization.list()
    if (result.error) {
      setError(result.error.message ?? 'Could not load businesses')
      setOrganizations([])
      return
    }
    setOrganizations(result.data)
  }, [])

  useEffect(() => {
    if (session && !session.session.activeOrganizationId) {
      void loadOrganizations()
    }
  }, [session, loadOrganizations])

  const signIn = useCallback(async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await startGoogleSignIn()
    } catch (cause: unknown) {
      setError(messageOf(cause))
      setBusy(false)
    }
  }, [])

  // Signed out: leave for Google immediately instead of showing an app shell.
  useEffect(() => {
    if (isPending || session || autoRedirected.current) return
    autoRedirected.current = true
    void signIn()
  }, [isPending, session, signIn])

  const activate = async (organizationId: string): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const result = await authClient.organization.setActive({ organizationId })
      if (result.error) throw new Error(result.error.message ?? 'Could not select business')
      window.location.reload()
    } catch (cause: unknown) {
      setError(messageOf(cause))
      setBusy(false)
    }
  }

  const create = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    const trimmed = name.trim()
    if (trimmed === '' || busy) return
    setBusy(true)
    setError(null)
    try {
      const created = await authClient.organization.create({
        name: trimmed,
        slug: slugify(trimmed),
      })
      if (!created.data) {
        throw new Error('Could not create business')
      }
      await activate(created.data.id)
    } catch (cause: unknown) {
      setError(messageOf(cause))
      setBusy(false)
    }
  }

  if (isPending) {
    return (
      <div className={css.authScreen}>
        <div className={css.card}>
          <div className={css.empty}>Connecting to MicroBalance…</div>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className={css.authScreen}>
        <div className={`${css.card} ${css.authCard}`}>
          <img className={css.authLogo} src={logoUrl} alt="" aria-hidden="true" />
          <h1 className={css.authTitle}>Welcome to MicroBalance</h1>
          <p className={css.authText}>Taking you to Google to sign in.</p>
          <button
            type="button"
            className={`${css.button} ${css.primary} ${css.authButton}`}
            onClick={() => { void signIn() }}
            disabled={busy}
          >
            {busy ? 'Redirecting to Google…' : 'Continue with Google'}
          </button>
          {error !== null && <div className={css.error}>{error}</div>}
          <p className={css.authFootnote}>
            Google OAuth only · no passwords stored · {CORE_ORIGIN}
          </p>
        </div>
      </div>
    )
  }

  if (!session.session.activeOrganizationId) {
    return (
      <div className={css.authScreen}>
        <form className={`${css.card} ${css.authCard}`} onSubmit={(event) => { void create(event) }}>
          <img className={css.authLogo} src={logoUrl} alt="" aria-hidden="true" />
          <h1 className={css.authTitle}>Enter your Business Name</h1>
          <p className={css.authText}>
            {organizations !== null && organizations.length > 0
              ? 'Choose an existing business or create a new one.'
              : 'This creates your company ledger and chart of accounts.'}
          </p>

          {organizations !== null && organizations.length > 0 && (
            <div className={css.authList}>
              {organizations.map(organization => (
                <button
                  key={organization.id}
                  type="button"
                  className={css.button}
                  disabled={busy}
                  onClick={() => { void activate(organization.id) }}
                >
                  {organization.name}
                </button>
              ))}
            </div>
          )}

          <label className={css.field}>
            <span className={css.label}>Business Name</span>
            <input
              className={css.input}
              value={name}
              onChange={(event) => { setName(event.target.value) }}
              placeholder="e.g. Acme Test"
              autoFocus
            />
          </label>
          <button
            type="submit"
            className={`${css.button} ${css.primary} ${css.authButton}`}
            disabled={busy || name.trim() === ''}
          >
            {busy ? 'Creating…' : 'Create business'}
          </button>
          {error !== null && <div className={css.error}>{error}</div>}
        </form>
      </div>
    )
  }

  return <>{children}</>
}

/** Wrap a page component in the auth gate. */
export function withAuth(Page: () => JSX.Element): () => JSX.Element {
  return function Gated(): JSX.Element {
    return (
      <AuthGate>
        <Page />
      </AuthGate>
    )
  }
}
