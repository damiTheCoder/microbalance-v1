/** Gmail OAuth: connect a Google account and send mail through the Gmail API. */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { google } from 'googleapis';
import { prisma } from './prisma.js';

/** Scope that allows sending mail as the connected user. */
export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.send';

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
    scope: [GMAIL_SCOPE],
    state: signState(companyId),
  });
}

export interface GmailTokens {
  refreshToken: string;
  email: string;
}

/** Exchange the callback code for a refresh token and the account address. */
export async function exchangeGmailCode(code: string): Promise<GmailTokens | null> {
  const client = gmailOAuthClient();
  const { tokens } = await client.getToken(code);
  if (tokens.refresh_token === null || tokens.refresh_token === undefined) return null;
  client.setCredentials(tokens);
  const gmail = google.gmail({ version: 'v1', auth: client });
  const profile = await gmail.users.getProfile({ userId: 'me' });
  return {
    refreshToken: tokens.refresh_token,
    email: profile.data.emailAddress ?? '',
  };
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

/** Whether the company can send mail, and from which address. */
export async function gmailStatus(companyId: string): Promise<{ connected: boolean; email: string }> {
  const connection = await gmailConnection(companyId);
  return { connected: connection !== null, email: connection?.email ?? '' };
}
