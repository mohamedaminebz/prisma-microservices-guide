// ─────────────────────────────────────────────────────────────────────────────
// Public entry point of `@myorg/db-schema`.
//
// Every microservice does:
//
//     import { prisma } from '@myorg/db-schema';
//
// The PrismaClient type, the generated types (Item, Tag, ...), and the Prisma
// namespace are all re-exported so services never need to depend on
// `@prisma/client` directly.
// ─────────────────────────────────────────────────────────────────────────────

import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';

// Keep a process-wide reference on globalThis so dev-mode hot reloads
// (tsx, nodemon, ...) reuse one client instead of leaking a connection pool
// per reload. In production each Node process constructs exactly one client.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
