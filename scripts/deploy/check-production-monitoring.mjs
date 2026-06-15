import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkProductionFreshness,
  createProductionMonitoringSnapshot,
  createProductionMonitoringFailureSnapshot,
  productionMonitoringExitCode,
  resolveProductionFreshnessCliOptions,
} from "./production-freshness.mjs";

export async function runProductionMonitoringCommand({
  argv = process.argv.slice(2),
  env = process.env,
  now = () => new Date(),
  writeStdout = (text) => process.stdout.write(text),
  writeStderr = (text) => process.stderr.write(text),
  resolveOptions = resolveProductionFreshnessCliOptions,
  checkFreshness = checkProductionFreshness,
} = {}) {
  try {
    const options = await resolveOptions(argv, env);
    const result = await checkFreshness(options);
    const snapshot = createProductionMonitoringSnapshot(result, {
      generatedAt: now().toISOString(),
    });
    writeStdout(`${JSON.stringify(snapshot, null, 2)}\n`);
    return productionMonitoringExitCode(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const snapshot = createProductionMonitoringFailureSnapshot({
      baseUrl: argv[0] ?? env.BASE_URL,
      generatedAt: now().toISOString(),
      message,
    });
    writeStdout(`${JSON.stringify(snapshot, null, 2)}\n`);
    writeStderr(`Production monitoring failed before completing checks: ${message}\n`);
    return productionMonitoringExitCode(snapshot);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runProductionMonitoringCommand().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
