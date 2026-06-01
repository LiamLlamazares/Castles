import { readFileSync } from "node:fs";

const ENV_LINE = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/;

function unquoteValue(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function loadServerEnvironmentFile(filePath: string): NodeJS.ProcessEnv {
  const contents = readFileSync(filePath, "utf8");
  const env: NodeJS.ProcessEnv = {};
  const lines = contents.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line || line.startsWith("#")) continue;

    const match = line.match(ENV_LINE);
    if (!match) {
      throw new Error(`Invalid environment file line ${index + 1}. Expected KEY=value.`);
    }

    env[match[1]] = unquoteValue(match[2]);
  }

  return env;
}
