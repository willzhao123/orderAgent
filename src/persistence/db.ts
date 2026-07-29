import pg from "pg";

const { Pool } = pg;

// Fail during startup instead of creating a pool with an implicit configuration.
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing. Add it to .env.");
}

export const db = new Pool({
  connectionString: process.env.DATABASE_URL
});
