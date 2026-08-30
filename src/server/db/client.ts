import { PrismaClient } from "@prisma/client";

/**
 * The application's Prisma client. Explicitly overrides the datasource URL
 * baked into prisma/schema.prisma (which points at DATABASE_MIGRATION_ROLE,
 * the schema-owning role used only by `prisma migrate`) with DATABASE_URL —
 * the restricted runtime role ("scit_app") that has no DDL rights and no
 * UPDATE/DELETE on audit_events, case_events, or grades. The running
 * application must never connect as the migration role.
 *
 * Singleton pattern: in dev, Next.js's module reloading would otherwise
 * create a new PrismaClient (and a new connection pool) on every hot
 * reload. Stashing it on `globalThis` survives the reload.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
