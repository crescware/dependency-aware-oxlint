# @crescware/dependency-aware-oxlint

A scope-aware runner for oxlint that applies lint rules based on the import dependency graph.

## Features

- Runs `oxlint` once per **scope** defined in a config file, then aggregates the results into a single report.
- Two ways to attach an oxlint config to a scope: inline (`oxlintConfig`) or by path (`oxlintrcPath`).
- `include` / `exclude` use gitignore-style patterns (via [`ignore`](https://www.npmjs.com/package/ignore)).
- Exclude is **dependency-aware**: a file matched by `exclude` is still linted if it has any ancestor (an importer, transitively) that is not excluded.
- Import graph is built from static imports, re-exports, and string-literal dynamic imports, resolved with [`oxc-resolver`](https://www.npmjs.com/package/oxc-resolver) (optionally using your `tsconfig.json`).

## Installation

Requires Node 24.x. `oxlint` is a peer dependency — install both:

```sh
pnpm add -D @crescware/dependency-aware-oxlint oxlint
```

## Getting started

### 1. Create `dependency-aware-oxlint.config.ts`

```ts
import type { DependencyAwareOxlintConfig } from "@crescware/dependency-aware-oxlint";

export default {
  rootDir: "src",
  tsconfig: "tsconfig.json",
  scopes: [
    {
      name: "strict",
      oxlintConfig: {
        plugins: [],
        rules: {
          "no-console": "error",
        },
      },
      include: ["**/*.ts"],
      exclude: ["**/form-schema.*"],
    },
  ],
} satisfies DependencyAwareOxlintConfig;
```

Alternatively, point at an existing `.oxlintrc.*` file instead of defining rules inline:

```ts
{
  name: "strict",
  oxlintrcPath: ".oxlintrc.strict.json",
  include: ["**/*.ts"],
  exclude: ["**/form-schema.*"],
}
```

### 2. Run the CLI

```sh
pnpm dependency-aware-oxlint
```

Sample output (from running the CLI against `integration-tests/fixtures/inline-config/`):

```
[strict] src/item.ts:1:1
  error: Unexpected console statement.
  rule: eslint(no-console)
  help: Delete this console statement.

[strict] src/api-schema.ts:3:1
  error: Unexpected console statement.
  rule: eslint(no-console)
  help: Delete this console statement.

Summary: 2 errors, 0 warnings across 1 scope
```

Process exit code is `1` if any diagnostic has `severity: "error"`, otherwise `0`.

## Configuration reference

The config file is resolved, in order, as one of:

- `dependency-aware-oxlint.config.ts`
- `dependency-aware-oxlint.config.mts`
- `dependency-aware-oxlint.config.js`
- `dependency-aware-oxlint.config.mjs`

Config files are loaded via [`jiti`](https://www.npmjs.com/package/jiti), so TypeScript sources work without a pre-build step.

### Types

```ts
type DependencyAwareOxlintConfig = {
  rootDir: string;
  tsconfig?: string;
  scopes: ScopeDefinition[];
};

type ScopeDefinition =
  | {
      name: string;
      include: string[];
      exclude?: string[];
      oxlintConfig: OxlintConfig; // from "oxlint"
    }
  | {
      name: string;
      include: string[];
      exclude?: string[];
      oxlintrcPath: string;
    };
```

- `rootDir` — directory that is walked to collect source files and to which `include` / `exclude` patterns are relative. Relative paths are resolved from the config file's directory.
- `tsconfig` — optional path to a `tsconfig.json`, passed to `oxc-resolver` (with `references: "auto"`). If omitted, `tsconfig.json` next to the config file is used when present.
- `scopes[].name` — used as a label in the report and to select via `--scope`.
- `scopes[].include` / `scopes[].exclude` — gitignore-style patterns matched against the file path relative to `rootDir` (normalized to forward slashes).
- Exactly one of `oxlintConfig` (inline object) or `oxlintrcPath` (path to a `.oxlintrc.*` file) must be set per scope. Inline configs are written to a temporary file and cleaned up after the run.

Source files are discovered by walking `rootDir`, skipping dotfiles and the directories: `node_modules`, `.git`, `dist`, `build`, `coverage`, `.next`, `.turbo`. Files with these extensions are picked up: `.ts`, `.tsx`, `.js`, `.jsx`, `.mts`, `.cts`, `.mjs`, `.cjs`.

## CLI reference

```
dependency-aware-oxlint [files...]

Options:
  -c, --config <path>   Path to dependency-aware-oxlint.config.ts
  -s, --scope <name>    Only run the given scope (can be passed multiple times)
      --cwd <path>      Working directory (defaults to process.cwd)
```

- `--config` — if omitted, the config file is searched in `--cwd` (or `process.cwd()`).
- `--scope` — can be repeated to select multiple scopes. When omitted, every scope in the config is run.

## Scope resolution

For each scope, the set of files to lint is computed against the whole dependency graph rooted at `rootDir`:

1. Start with every file that matches `include`.
2. If the file matches `exclude`, keep it only when **at least one ancestor** (a file that transitively imports it) is _not_ excluded. Files with no ancestors are dropped when they match `exclude`.

Example (see `integration-tests/fixtures/inline-config/`):

- `include: ["**/*.ts"]`, `exclude: ["**/form-schema.*"]`
- `form-schema.ts` imports `item.ts` and `user.ts`.
- `api-schema.ts` also imports `item.ts`.
- Result: `form-schema.ts` is dropped (matches `exclude`, no importer). `user.ts` is dropped (only ancestor is the excluded `form-schema.ts`). `item.ts` is kept (one ancestor, `api-schema.ts`, is not excluded). `api-schema.ts` is kept.

## Output & exit code

Report lines are emitted in scope order. Each diagnostic renders as:

```
[<scope>] <relativePath>[:<line>:<column>]
  <error|warning>: <message>
  rule: <code>
  help: <help>          # when provided
```

A trailing summary line reports totals:

```
Summary: <n> errors, <m> warnings across <k> scopes
```

Exit code is `1` when `errorCount > 0`, else `0`.

## Development

This repository uses `pnpm` (pinned via `packageManager`) and the Node version declared in `mise.toml`.

Scripts (`package.json`):

| Script        | Command                               |
| ------------- | ------------------------------------- |
| `build`       | `tsgo -p tsconfig.json`               |
| `dev`         | `tsgo -p tsconfig.json --watch`       |
| `check`       | `pnpm check:types && pnpm check:lint` |
| `check:types` | `tsgo -p tsconfig.json --noEmit`      |
| `check:lint`  | `oxlint && oxfmt --check`             |
| `format`      | `oxlint --fix && oxfmt`               |
| `test`        | `pnpm build && vitest run`            |
| `exec`        | `node dist/cli.js`                    |

## License

MIT © Crescware Inc.
