#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkLocalPostgresPrereqs } from "./local-postgres-prereqs.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");

async function main() {
  const result = await checkLocalPostgresPrereqs({ repoRoot });
  console.log("Local PostgreSQL smoke preflight passed.");
  console.log(`Database: ${result.database.description}`);
  console.log(`psql: ${result.psqlCommand}`);
  console.log(`Built artifacts checked: ${result.artifacts.length}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
