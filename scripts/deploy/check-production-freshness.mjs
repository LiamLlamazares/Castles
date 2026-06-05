#!/usr/bin/env node
import {
  checkProductionFreshness,
  formatProductionFreshnessResult,
} from "./production-freshness.mjs";

const baseUrl = process.argv[2] ?? process.env.BASE_URL ?? "https://castles.ls314.xyz";
const expectedCommit = process.argv[3] ?? process.env.EXPECTED_COMMIT;
const sshHost = process.argv[4] ?? process.env.DEPLOY_SSH_HOST;
const sshPort = Number(process.env.DEPLOY_SSH_PORT ?? 22);
const sshTimeoutMs = Number(process.env.DEPLOY_SSH_TIMEOUT_MS ?? 10_000);

checkProductionFreshness({
  baseUrl,
  expectedCommit,
  sshHost,
  sshPort,
  sshTimeoutMs,
  includeGitStatus: true,
})
  .then((result) => {
    console.log(formatProductionFreshnessResult(result));
    if (!result.ok) process.exitCode = 1;
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
