import { PrismaClient } from '@prisma/client';
import { prisma } from './prisma.js';

// When DATABASE_URL_REPLICA is set (typically the hot-standby address), create
// a dedicated PrismaClient that routes reads to the standby.  If the variable
// is absent the primary singleton is re-exported so every import of
// `prismaReplica` works correctly without any conditional logic at call sites.
const globalForPrismaReplica = globalThis as unknown as { prismaReplica?: PrismaClient };

export const prismaReplica: PrismaClient = process.env.DATABASE_URL_REPLICA
  ? (globalForPrismaReplica.prismaReplica ??
      (globalForPrismaReplica.prismaReplica = new PrismaClient({
        datasourceUrl: process.env.DATABASE_URL_REPLICA,
        log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
      })))
  : prisma;
