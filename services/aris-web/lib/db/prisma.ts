import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __arisPrisma: PrismaClient | undefined;
}

export const prisma =
  global.__arisPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  global.__arisPrisma = prisma;
}
