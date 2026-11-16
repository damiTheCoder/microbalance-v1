import 'dotenv/config';
import cron from 'node-cron';
import { buildApp } from './app.js';
import { prisma } from './lib/prisma.js';
import { syncCompanyReports } from './lib/drive.js';

const app = await buildApp();

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '0.0.0.0';

await app.listen({ port, host });

/** Weekly and monthly Drive backups for companies that opted in. */
const runBackup = async (schedule: 'WEEKLY' | 'MONTHLY'): Promise<void> => {
  const profiles = await prisma.businessProfile.findMany({
    where: { driveConnected: true, driveSyncSchedule: schedule, driveRefreshToken: { not: null } },
  });
  for (const profile of profiles) {
    try {
      const result = await syncCompanyReports(profile.companyId);
      app.log.info({ companyId: profile.companyId, schedule, result }, 'drive backup complete');
    } catch (cause) {
      app.log.error({ companyId: profile.companyId, schedule, cause }, 'drive backup failed');
    }
  }
};

cron.schedule('0 3 * * 1', () => { void runBackup('WEEKLY'); });
cron.schedule('0 3 1 * *', () => { void runBackup('MONTHLY'); });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    app.log.info(`received ${signal}, shutting down`);
    await app.close();
    process.exit(0);
  });
}
