import { createHmac } from 'node:crypto';
import { Readable } from 'node:stream';
import { google } from 'googleapis';
import { prisma } from './prisma.js';
import { generatePdfReport, type ReportType } from './reports.js';

const REDIRECT_URI = `${process.env.CORE_PUBLIC_URL ?? 'http://127.0.0.1:3001'}/api/drive/callback`;
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

const oauthClient = (): InstanceType<typeof google.auth.OAuth2> =>
  new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID ?? '',
    process.env.GOOGLE_CLIENT_SECRET ?? '',
    REDIRECT_URI,
  );

const signState = (companyId: string): string => {
  const signature = createHmac('sha256', process.env.BETTER_AUTH_SECRET ?? '')
    .update(companyId)
    .digest('base64url');
  return `${companyId}.${signature}`;
};

export const readState = (state: string): string | null => {
  const index = state.lastIndexOf('.');
  if (index <= 0) return null;
  const companyId = state.slice(0, index);
  const signature = state.slice(index + 1);
  return signState(companyId) === `${companyId}.${signature}` ? companyId : null;
};

/** Google consent URL requesting offline Drive access for this company. */
export function getDriveAuthUrl(companyId: string): string {
  return oauthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [DRIVE_SCOPE],
    state: signState(companyId),
  });
}

/** Exchange the callback code for a refresh token. */
export async function exchangeCode(code: string): Promise<string | null> {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  return tokens.refresh_token ?? null;
}

const driveFor = (refreshToken: string) => {
  const client = oauthClient();
  client.setCredentials({ refresh_token: refreshToken });
  return google.drive({ version: 'v3', auth: client });
};

async function ensureFolder(
  drive: ReturnType<typeof driveFor>,
  name: string,
  parentId: string | undefined,
): Promise<string> {
  const query = [
    `name = '${name.replace(/'/g, "\\'")}'`,
    "mimeType = 'application/vnd.google-apps.folder'",
    'trashed = false',
    parentId === undefined ? null : `'${parentId}' in parents`,
  ].filter((part): part is string => part !== null).join(' and ');

  const found = await drive.files.list({ q: query, fields: 'files(id)', pageSize: 1 });
  const existing = found.data.files?.[0]?.id;
  if (typeof existing === 'string') return existing;

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentId === undefined ? {} : { parents: [parentId] }),
    },
    fields: 'id',
  });
  if (created.data.id === undefined || created.data.id === null) {
    throw new Error(`Could not create Drive folder ${name}`);
  }
  return created.data.id;
}

/** Upload a PDF into MicroBalance/{Company}/{Year}/{Month}/{file}. */
export async function uploadToDrive(
  refreshToken: string,
  folderPath: string[],
  filename: string,
  buffer: Buffer,
): Promise<{ id: string; name: string }> {
  const drive = driveFor(refreshToken);
  let parent: string | undefined;
  for (const folder of folderPath) {
    parent = await ensureFolder(drive, folder, parent);
  }

  const uploaded = await drive.files.create({
    requestBody: {
      name: filename,
      mimeType: 'application/pdf',
      ...(parent === undefined ? {} : { parents: [parent] }),
    },
    media: { mimeType: 'application/pdf', body: Readable.from(buffer) },
    fields: 'id, name',
  });

  return { id: uploaded.data.id ?? '', name: uploaded.data.name ?? filename };
}

const REPORT_FILES: Array<{ type: ReportType; name: string }> = [
  { type: 'PROFIT_AND_LOSS', name: 'Profit_and_Loss.pdf' },
  { type: 'BALANCE_SHEET', name: 'Balance_Sheet.pdf' },
  { type: 'TRIAL_BALANCE', name: 'Trial_Balance.pdf' },
];

/** Generate all three statements and back them up to Drive. */
export async function syncCompanyReports(companyId: string): Promise<{
  folder: string[];
  uploaded: string[];
}> {
  const profile = await prisma.businessProfile.findFirst({ where: { companyId } });
  if (!profile?.driveRefreshToken) {
    throw new Error('Google Drive is not connected');
  }

  const now = new Date();
  const folder = [
    'MicroBalance',
    profile.name !== '' ? profile.name : 'Company',
    String(now.getFullYear()),
    now.toLocaleString('en-US', { month: 'long' }),
  ];

  const uploaded: string[] = [];
  for (const report of REPORT_FILES) {
    const pdf = await generatePdfReport(companyId, report.type);
    await uploadToDrive(profile.driveRefreshToken, folder, report.name, pdf);
    uploaded.push(report.name);
  }

  return { folder, uploaded };
}
