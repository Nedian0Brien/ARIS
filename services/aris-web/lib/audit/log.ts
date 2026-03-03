import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

type AuditEvent = {
  userId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  payload?: Prisma.InputJsonValue | null;
  ip?: string | null;
  userAgent?: string | null;
};

export async function writeAuditLog(event: AuditEvent): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId: event.userId ?? null,
      action: event.action,
      resourceType: event.resourceType,
      resourceId: event.resourceId ?? null,
      payloadJson: event.payload ?? Prisma.JsonNull,
      ip: event.ip ?? null,
      userAgent: event.userAgent ?? null,
    },
  });
}
