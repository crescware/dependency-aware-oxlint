import { createJiti } from "jiti";
import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { DependencyAwareOxlintConfig } from "../types.js";

const defaultConfigNames = [
  "dependency-aware-oxlint.config.ts",
  "dependency-aware-oxlint.config.mts",
  "dependency-aware-oxlint.config.js",
  "dependency-aware-oxlint.config.mjs",
];

export function findConfigFile(cwd: string): string | null {
  for (const name of defaultConfigNames) {
    const candidate = resolve(cwd, name);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export async function loadConfig(
  configPath: string,
): Promise<DependencyAwareOxlintConfig> {
  const absolute = isAbsolute(configPath) ? configPath : resolve(configPath);
  if (!existsSync(absolute)) {
    throw new Error(`Config file not found: ${absolute}`);
  }
  const jiti = createJiti(pathToFileURL(absolute).href, {
    interopDefault: true,
  });
  const loaded = (await jiti.import(absolute)) as
    | DependencyAwareOxlintConfig
    | { default: DependencyAwareOxlintConfig };
  const config =
    "default" in (loaded as object) && (loaded as { default?: unknown }).default
      ? (loaded as { default: DependencyAwareOxlintConfig }).default
      : (loaded as DependencyAwareOxlintConfig);

  if (!config || typeof config !== "object") {
    throw new Error(`Config file did not export a default object: ${absolute}`);
  }
  if (!config.rootDir) {
    throw new Error(`Config is missing 'rootDir': ${absolute}`);
  }
  if (!Array.isArray(config.scopes)) {
    throw new Error(`Config is missing 'scopes' array: ${absolute}`);
  }
  return config;
}
