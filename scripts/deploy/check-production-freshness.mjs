#!/usr/bin/env node
import {
  checkProductionFreshness,
  formatProductionFreshnessResult,
  resolveProductionFreshnessCliOptions,
} from "./production-freshness.mjs";

resolveProductionFreshnessCliOptions(process.argv.slice(2))
  .then((options) => checkProductionFreshness(options))
  .then((result) => {
    console.log(formatProductionFreshnessResult(result));
    if (!result.ok) process.exitCode = 1;
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
