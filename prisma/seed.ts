import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "../src/config";

const adapter = new PrismaPg({ connectionString: config.database.url });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("[seed] Starting database seed...");
  // Seed operations
  console.log("[seed] Database seed completed successfully.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
