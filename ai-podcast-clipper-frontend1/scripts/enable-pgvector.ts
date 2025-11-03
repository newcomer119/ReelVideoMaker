/**
 * Script to enable pgvector extension in PostgreSQL
 * Run this once: npm run db:enable-pgvector
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function enablePgvector() {
  try {
    console.log("Enabling pgvector extension...");
    await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector;`);
    console.log("✅ pgvector extension enabled successfully!");
    console.log("You can now run: npm run db:push");
  } catch (error) {
    console.error("❌ Error enabling pgvector:", error);
    if (error instanceof Error) {
      if (error.message.includes("permission denied")) {
        console.error("\n⚠️  Permission denied. You may need to:");
        console.error("1. Connect to your database as a superuser");
        console.error("2. Or enable it manually: CREATE EXTENSION IF NOT EXISTS vector;");
      }
    }
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

enablePgvector()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

