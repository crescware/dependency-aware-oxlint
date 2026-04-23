#!/usr/bin/env node
import { cac } from "cac";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

import { buildGraph } from "./graph/build.js";
import {
  aggregate,
  formatReport,
  type ScopeRunResult,
} from "./runner/aggregate.js";
import { runOxlint } from "./runner/oxlint.js";
import { findConfigFile, loadConfig } from "./scope/config.js";
import { resolveScope } from "./scope/resolve.js";
import type { ScopeDefinition } from "./types.js";

type CliOptions = {
  config?: string;
  scope?: string | string[];
  cwd?: string;
};

async function main(): Promise<void> {
  const cli = cac("dependency-aware-oxlint");
  cli
    .command(
      "[...files]",
      "Run oxlint for each scope defined by the dependency-aware config",
    )
    .option("-c, --config <path>", "Path to dependency-aware-oxlint.config.ts")
    .option(
      "-s, --scope <name>",
      "Only run the given scope (can be passed multiple times)",
      { default: [] },
    )
    .option("--cwd <path>", "Working directory (defaults to process.cwd)")
    .action(async (_files: string[], flags: CliOptions) => {
      const code = await run(flags);
      process.exit(code);
    });
  cli.help();
  cli.parse();
}

async function run(flags: CliOptions): Promise<number> {
  const cwd = flags.cwd ? resolve(flags.cwd) : process.cwd();

  const configPath = flags.config
    ? isAbsolute(flags.config)
      ? flags.config
      : resolve(cwd, flags.config)
    : findConfigFile(cwd);
  if (!configPath) {
    console.error(
      "error: no dependency-aware-oxlint.config.* found. Pass --config <path> or create one.",
    );
    return 1;
  }
  if (!existsSync(configPath)) {
    console.error(`error: config file not found: ${configPath}`);
    return 1;
  }

  const configDir = dirname(configPath);
  const config = await loadConfig(configPath);
  const rootDir = isAbsolute(config.rootDir)
    ? config.rootDir
    : resolve(configDir, config.rootDir);
  const tsconfig = config.tsconfig
    ? isAbsolute(config.tsconfig)
      ? config.tsconfig
      : resolve(configDir, config.tsconfig)
    : existsSync(resolve(configDir, "tsconfig.json"))
      ? resolve(configDir, "tsconfig.json")
      : undefined;

  const requestedScopes = normalizeScopeFlag(flags.scope);
  const activeScopes = requestedScopes.length
    ? config.scopes.filter((v) => requestedScopes.includes(v.name))
    : config.scopes;
  if (activeScopes.length === 0) {
    console.error(
      `error: no scopes selected (available: ${config.scopes.map((v) => v.name).join(", ")})`,
    );
    return 1;
  }

  const graph = await buildGraph({ rootDir, tsconfig });

  const oxlintBin = findOxlintBin(configDir);

  const runs: ScopeRunResult[] = await Promise.all(
    activeScopes.map(async (v) => {
      const resolved = resolveScope(v, graph);
      const { path: configFilePath, cleanup } = await materializeOxlintConfig(
        v,
        configDir,
      );
      try {
        const result = await runOxlint({
          configPath: configFilePath,
          files: resolved.files,
          cwd: configDir,
          binPath: oxlintBin,
        });
        return {
          scopeName: resolved.name,
          filesLinted: resolved.files.length,
          result,
        };
      } finally {
        await cleanup();
      }
    }),
  );

  const report = aggregate(runs);
  process.stdout.write(formatReport(report, cwd) + "\n");
  return report.errorCount > 0 ? 1 : 0;
}

function normalizeScopeFlag(value: CliOptions["scope"]): string[] {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.filter(
      (v): v is string => typeof v === "string" && v.length > 0,
    );
  }
  return [value];
}

async function materializeOxlintConfig(
  scope: ScopeDefinition,
  configDir: string,
): Promise<{ path: string; cleanup: () => Promise<void> }> {
  if (scope.oxlintrcPath !== undefined) {
    const path = isAbsolute(scope.oxlintrcPath)
      ? scope.oxlintrcPath
      : resolve(configDir, scope.oxlintrcPath);
    return { path, cleanup: async () => {} };
  }
  const path = join(tmpdir(), `dependency-aware-oxlint-${scope.name}-${randomUUID()}.json`);
  await writeFile(path, JSON.stringify(scope.oxlintConfig), "utf8");
  return {
    path,
    cleanup: async () => {
      try {
        await rm(path, { force: true });
      } catch {
        // ignore
      }
    },
  };
}

function findOxlintBin(startDir: string): string {
  let current = startDir;
  while (true) {
    const candidate = resolve(current, "node_modules/.bin/oxlint");
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return "oxlint";
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
