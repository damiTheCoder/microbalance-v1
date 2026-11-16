import { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'POST' | 'APPROVE';

const asJson = (value: unknown): Prisma.InputJsonValue | undefined => {
  if (value === undefined || value === null) return undefined;
  try {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  } catch {
    return undefined;
  }
};

/**
 * Append an immutable audit record. Auditing must never break a business
 * action, so failures are swallowed after logging to the server console.
 */
export async function logAudit(
  companyId: string,
  userId: string,
  action: AuditAction | string,
  entityType: string,
  entityId: string,
  before?: unknown,
  after?: unknown,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        companyId,
        userId: userId === '' ? 'system' : userId,
        action,
        entityType,
        entityId,
        before: asJson(before),
        after: asJson(after),
      },
    });
  } catch (cause) {
    console.error('[audit] failed to write entry', cause);
  }
}
