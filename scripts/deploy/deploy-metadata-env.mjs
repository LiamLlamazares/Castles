import { constants } from "node:fs";
import { access, chmod, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEPLOY_METADATA_KEYS = new Set(["BUILD_ID", "GIT_COMMIT"]);
const ENV_LINE = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/;
const COMMIT_SHA = /^[0-9a-f]{40}$/i;
const BUILD_ID = /^[A-Za-z0-9_.:-]+$/;

function readRequiredValue(argv, flag) {
  const index = argv.indexOf(flag);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

function validateDeployMetadata({ envFile, buildId, commit }) {
  if (!envFile) throw new Error("--env-file requires a file path.");
  if (!buildId) throw new Error("--build-id requires a value.");
  if (!commit) throw new Error("--commit requires a value.");
  if (!BUILD_ID.test(buildId)) {
    throw new Error("BUILD_ID may contain only letters, numbers, dots, underscores, colons, and dashes.");
  }
  if (!COMMIT_SHA.test(commit)) {
    throw new Error("GIT_COMMIT must be a full 40-character commit SHA.");
  }
}

export function parseDeployMetadataArgs(argv) {
  const hasFlaggedArgs = argv.some((arg) => arg.startsWith("--"));
  const args = hasFlaggedArgs
    ? {
        envFile: readRequiredValue(argv, "--env-file"),
        buildId: readRequiredValue(argv, "--build-id"),
        commit: readRequiredValue(argv, "--commit"),
      }
    : {
        envFile: argv[0],
        buildId: argv[1],
        commit: argv[2],
      };
  validateDeployMetadata(args);
  return args;
}

function updateDeployMetadataContents(contents, { buildId, commit }) {
  const lines = contents.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();

  const nextValues = {
    BUILD_ID: buildId,
    GIT_COMMIT: commit,
  };
  const seen = new Set();
  const output = [];

  for (const line of lines) {
    const match = line.match(ENV_LINE);
    const key = match?.[1];
    if (!key || !DEPLOY_METADATA_KEYS.has(key)) {
      output.push(line);
      continue;
    }

    if (seen.has(key)) continue;
    seen.add(key);
    output.push(`${key}=${nextValues[key]}`);
  }

  for (const key of ["BUILD_ID", "GIT_COMMIT"]) {
    if (!seen.has(key)) {
      output.push(`${key}=${nextValues[key]}`);
    }
  }

  return `${output.join("\n")}\n`;
}

export async function updateDeployMetadataEnvFile({ envFile, buildId, commit }) {
  validateDeployMetadata({ envFile, buildId, commit });
  await access(envFile, constants.R_OK | constants.W_OK);

  const beforeStat = await stat(envFile);
  const contents = await readFile(envFile, "utf8");
  const nextContents = updateDeployMetadataContents(contents, { buildId, commit });
  const tempPath = path.join(
    path.dirname(envFile),
    `.${path.basename(envFile)}.${process.pid}.${Date.now()}.tmp`
  );

  await writeFile(tempPath, nextContents, { encoding: "utf8", mode: beforeStat.mode & 0o777 });
  await chmod(tempPath, beforeStat.mode & 0o777);
  await rename(tempPath, envFile);

  return {
    envFile,
    buildId,
    commit,
    changedKeys: ["BUILD_ID", "GIT_COMMIT"],
  };
}

async function main() {
  const args = parseDeployMetadataArgs(process.argv.slice(2));
  const result = await updateDeployMetadataEnvFile(args);
  console.log(
    JSON.stringify(
      {
        ok: true,
        envFile: result.envFile,
        buildId: result.buildId,
        commit: result.commit,
        changedKeys: result.changedKeys,
      },
      null,
      2
    )
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
