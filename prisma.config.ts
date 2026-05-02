import { existsSync, readFileSync } from "node:fs";
import { defineConfig } from "prisma/config";

function readDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  if (!existsSync(".env")) {
    throw new Error("DATABASE_URL is missing. Create a .env file first.");
  }

  const envFile = readFileSync(".env", "utf8");
  const match = envFile.match(/^DATABASE_URL=(.*)$/m);

  if (!match) {
    throw new Error("DATABASE_URL is missing from .env.");
  }

  return match[1].trim().replace(/^["']|["']$/g, "");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: readDatabaseUrl(),
  },
});
