import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../generated/prisma/client";

const databaseUrl = "file:./data/database.db";

const adapter = new PrismaBetterSqlite3({
  url: databaseUrl,
  timeout: 5000,
});

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaBootstrapped?: boolean;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export async function bootstrapDatabase() {
  if (globalForPrisma.prismaBootstrapped) return;
  await prisma.$executeRawUnsafe("PRAGMA journal_mode = WAL;");
  await prisma.$executeRawUnsafe("PRAGMA busy_timeout = 5000;");
  globalForPrisma.prismaBootstrapped = true;
}
