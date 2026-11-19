/** Gmail OAuth: connect a Google account and send mail through the Gmail API. */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { google } from 'googleapis';
import { prisma } from './prisma.js';

/** Scope that allows sending mail as the connected user. */
export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.send';

/** Scope that allows creating and editing calendar events. */
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

/** Redirect registered in Google Cloud Console for this route. */
export const gmailRedirectUri = (): string =>
  process.env.GMAIL_REDIRECT_URI ?? 'http://127.0.0.1:3001/api/email/callback';

/** OAuth client shared with the login provider (same client id/secret). */
export function gmailOAuthClient(): InstanceType<typeof google.auth.OAuth2> {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID ?? '',
    process.env.GOOGLE_CLIENT_SECRET ?? '',
    gmailRedirectUri(),
  );
}

/** Signed state ties a callback to one company without a server session. */
export function signState(companyId: string): string {
  const signature = createHmac('sha256', process.env.BETTER_AUTH_SECRET ?? '')
    .update(`gmail:${companyId}`)
    .digest('base64url');
  return `${companyId}.${signature}`;
}

export function readState(state: string): string | null {
  const index = state.lastIndexOf('.');
  if (index <= 0) return null;
  const companyId = state.slice(0, index);
  return signState(companyId) === state ? companyId : null;
}

/** Consent URL requesting offline access to send mail. */
export function getGmailAuthUrl(companyId: string): string {
  return gmailOAuthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    // `openid`/`email` let the callback read the account address; gmail.send
    // alone cannot call users.getProfile (it needs gmail.readonly or metadata).
    scope: ['openid', 'email', GMAIL_SCOPE, CALENDAR_SCOPE],
    state: signState(companyId),
  });
}

export interface GmailTokens {
  refreshToken: string;
  email: string;
}

/** Read the `email` claim from a Google ID token without another network call. */
function emailFromIdToken(idToken: string | null | undefined): string | null {
  if (idToken === null || idToken === undefined) return null;
  try {
    const payload = idToken.split('.')[1];
    if (payload === undefined) return null;
    const claims: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof claims !== 'object' || claims === null) return null;
    const email = (claims as { email?: unknown }).email;
    return typeof email === 'string' && email !== '' ? email : null;
  } catch {
    return null;
  }
}

/** Exchange the callback code for a refresh token and the account address. */
export async function exchangeGmailCode(code: string): Promise<GmailTokens | null> {
  const client = gmailOAuthClient();
  const { tokens } = await client.getToken(code);
  if (tokens.refresh_token === null || tokens.refresh_token === undefined) return null;
  client.setCredentials(tokens);
  // gmail.send is send-only, so `users.getProfile` is not authorized; the
  // consented `email` scope (or the ID token) carries the address instead.
  let email = emailFromIdToken(tokens.id_token);
  if (email === null) {
    const info = await client.request<{ email?: string }>({
      url: 'https://www.googleapis.com/oauth2/v2/userinfo',
    });
    email = info.data.email ?? '';
  }
  return { refreshToken: tokens.refresh_token, email };
}

/** AES-256-GCM key derived from the app secret. */
function key(): Buffer {
  return createHash('sha256')
    .update(process.env.BETTER_AUTH_SECRET ?? 'microbalance')
    .digest();
}

/** Encrypt a refresh token for storage at rest. */
export function encryptToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), body.toString('base64')].join(':');
}

/** Decrypt a stored refresh token; tolerates previously stored plaintext. */
export function decryptToken(stored: string): string {
  if (!stored.startsWith('v1:')) return stored;
  const [, iv, tag, body] = stored.split(':');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv ?? '', 'base64'));
  decipher.setAuthTag(Buffer.from(tag ?? '', 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(body ?? '', 'base64')), decipher.final()]).toString('utf8');
}

/** The company's stored Gmail credentials, if the account is connected. */
export async function gmailConnection(companyId: string): Promise<{ refreshToken: string; email: string } | null> {
  const profile = await prisma.businessProfile.findFirst({
    where: { companyId },
    select: { gmailRefreshToken: true, gmailEmail: true },
  });
  const stored = profile?.gmailRefreshToken;
  if (stored === null || stored === undefined || stored === '') return null;
  return { refreshToken: decryptToken(stored), email: profile?.gmailEmail ?? '' };
}

/** An authorized Gmail client for one company, refreshing the token as needed. */
export async function gmailFor(companyId: string): Promise<{ gmail: ReturnType<typeof google.gmail>; email: string } | null> {
  const connection = await gmailConnection(companyId);
  if (connection === null) return null;
  const client = gmailOAuthClient();
  client.setCredentials({ refresh_token: connection.refreshToken });
  return { gmail: google.gmail({ version: 'v1', auth: client }), email: connection.email };
}

/** Forget the company's stored Google connection (drive keeps its own token). */
export async function disconnectGmail(companyId: string): Promise<void> {
  await prisma.businessProfile.updateMany({
    where: { companyId },
    data: { gmailRefreshToken: null, gmailEmail: null },
  });
}

/** Whether the company can send mail, and from which address. */
export async function gmailStatus(companyId: string): Promise<{ connected: boolean; email: string }> {
  const connection = await gmailConnection(companyId);
  return { connected: connection !== null, email: connection?.email ?? '' };
}
