import { existsSync } from "node:fs";
import { readdir, readFile, realpath } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parseSync } from "oxc-parser";
import { ResolverFactory, type NapiResolveOptions } from "oxc-resolver";

import type { DependencyGraph } from "../types.js";

const defaultExtensions = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mts",
  ".cts",
  ".mjs",
  ".cjs",
];
const ignoredDirs = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
]);

async function listSourceFiles(
  rootDir: string,
  extensions: string[],
): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".") {
        continue;
      }
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (ignoredDirs.has(entry.name)) {
          continue;
        }
        await walk(full);
      } else if (entry.isFile()) {
        if (extensions.some((v) => entry.name.endsWith(v))) {
          out.push(full);
        }
      }
    }
  }
  await walk(rootDir);
  return out;
}

export type BuildGraphOptions = {
  rootDir: string;
  tsconfig?: string;
};

export async function buildGraph(
  options: BuildGraphOptions,
): Promise<DependencyGraph> {
  const rootDir = await realpath(resolve(options.rootDir));
  const extensions = defaultExtensions;

  const resolverOptions: NapiResolveOptions = {
    extensions,
    conditionNames: ["node", "import", "default"],
    mainFields: ["module", "main"],
    extensionAlias: {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"],
      ".jsx": [".tsx", ".jsx"],
    },
  };
  if (options.tsconfig && existsSync(options.tsconfig)) {
    resolverOptions.tsconfig = {
      configFile: resolve(options.tsconfig),
      references: "auto",
    };
  }
  const resolver = new ResolverFactory(resolverOptions);

  const files = await listSourceFiles(rootDir, extensions);
  const forward = new Map<string, Set<string>>();
  const reverse = new Map<string, Set<string>>();
  for (const f of files) {
    forward.set(f, new Set());
    reverse.set(f, new Set());
  }

  await Promise.all(
    files.map(async (v) => {
      let source: string;
      try {
        source = await readFile(v, "utf8");
      } catch {
        return;
      }
      let parsed;
      try {
        parsed = parseSync(v, source);
      } catch {
        return;
      }
      const requests: string[] = [];
      for (const imp of parsed.module.staticImports) {
        requests.push(imp.moduleRequest.value);
      }
      for (const exp of parsed.module.staticExports) {
        for (const entry of exp.entries) {
          if (entry.moduleRequest) {
            requests.push(entry.moduleRequest.value);
          }
        }
      }
      for (const dyn of parsed.module.dynamicImports) {
        const raw = source.slice(
          dyn.moduleRequest.start,
          dyn.moduleRequest.end,
        );
        const match = raw.match(/^\s*(['"`])([^'"`]+)\1\s*$/);
        if (match) {
          requests.push(match[2]);
        }
      }

      const dir = dirname(v);
      const unique = Array.from(new Set(requests));
      for (const request of unique) {
        let result;
        try {
          result = await resolver.async(dir, request);
        } catch {
          continue;
        }
        const resolved = result.path;
        if (!resolved) {
          continue;
        }
        if (!forward.has(resolved)) {
          continue;
        }
        forward.get(v)!.add(resolved);
        reverse.get(resolved)!.add(v);
      }
    }),
  );

  return createGraph(files, forward, reverse);
}

function createGraph(
  files: string[],
  forward: Map<string, Set<string>>,
  reverse: Map<string, Set<string>>,
): DependencyGraph {
  const bfs = (start: string, index: Map<string, Set<string>>): Set<string> => {
    const result = new Set<string>();
    const queue: string[] = [start];
    while (queue.length) {
      const current = queue.shift()!;
      for (const next of index.get(current) ?? []) {
        if (!result.has(next)) {
          result.add(next);
          queue.push(next);
        }
      }
    }
    return result;
  };

  return {
    allFiles: () => [...files],
    importers: (file) => [...(reverse.get(file) ?? [])],
    ancestors: (file) => bfs(file, reverse),
    descendants: (file) => bfs(file, forward),
  };
}
