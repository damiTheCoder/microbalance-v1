/** Settings → General row: the signed-in Google account, with sign-out / sign-in. */
import { useState } from 'react'
import type { JSX } from 'react'
import { authClient, startGoogleSignIn } from './auth-client.ts'
import css from './SettingsAccountRow.module.css'

const messageOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause)

/** Thin account row: reads the Better Auth session and triggers OAuth only. */
export function SettingsAccountRow(): JSX.Element {
  const { data: session, isPending } = authClient.useSession()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const signOut = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await authClient.signOut()
      window.location.assign('/')
    } catch (cause: unknown) {
      setError(messageOf(cause))
      setBusy(false)
    }
  }

  const signIn = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await startGoogleSignIn()
    } catch (cause: unknown) {
      setError(messageOf(cause))
      setBusy(false)
    }
  }

  const email = session?.user?.email ?? ''
  const signedIn = session !== null && session !== undefined

  return (
    <div className={css.row}>
      <div className={css.text}>
        <div className={css.title}>MicroBalance account</div>
        <div className={css.description}>
          {isPending
            ? 'Checking session…'
            : signedIn
              ? `Signed in as ${email}`
              : 'Sign in with Google to open your businesses.'}
        </div>
        {error !== null && <div className={css.error} role="alert">{error}</div>}
      </div>
      <button
        type="button"
        className={css.action}
        disabled={busy || isPending}
        onClick={() => { void (signedIn ? signOut() : signIn()) }}
      >
        {signedIn ? 'Sign out' : 'Sign in'}
      </button>
    </div>
  )
}
