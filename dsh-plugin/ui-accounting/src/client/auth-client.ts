/** Better Auth browser client (Google OAuth + organizations). */
import { createAuthClient } from 'better-auth/react'
import { organizationClient } from 'better-auth/client/plugins'

/** Core API origin. Same hostname as the UI so the session cookie is same-site. */
const host = typeof window === 'undefined' ? 'localhost' : window.location.hostname
const protocol = typeof window === 'undefined' ? 'http:' : window.location.protocol

export const CORE_ORIGIN = `${protocol}//${host}:3001`

export const authClient = createAuthClient({
  baseURL: CORE_ORIGIN,
  fetchOptions: { credentials: 'include' },
  plugins: [organizationClient()],
})

/** Start Google OAuth and return to the DSH app root afterwards. */
export async function startGoogleSignIn(): Promise<void> {
  await authClient.signIn.social({
    provider: 'google',
    callbackURL: `${window.location.origin}/`,
  })
}
