# Excluding test files from the published tarball

## Context

`tsgo -p tsconfig.json` compiles every source file under `src/**/*`,
including co-located `*.test.ts`. Because `package.json` declares
`"files": ["dist"]`, the compiled test files (`dist/**/*.test.{js,d.ts}`
and their source maps) end up inside the published npm tarball. They
have no reason to be shipped to consumers.

Three approaches were considered.

## Options

### A. Split the build-time tsconfig (`tsconfig.build.json`)

Create a dedicated `tsconfig.build.json` that extends `tsconfig.json`
and adds `src/**/*.test.ts` to `exclude`. Point `build` / `dev` scripts
at the new file. `check:types` keeps using `tsconfig.json` so the
tests are still type-checked.

- Mixes two concerns (what the TS compiler sees vs. what ships to
  npm) into the TypeScript config surface.
- Costs two configs and two script edits to solve a packaging problem.

### B. Drop `files` and rely on `.npmignore`

Remove the `files` field from `package.json` and enumerate everything
that should _not_ be published in `.npmignore` (`src/`,
`integration-tests/`, `tsconfig.json`, `.oxlintrc.json`,
`.oxfmtrc.json`, `mise.toml`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`,
`dist/**/*.test.*`, …).

- Puts the entire publish concern into a single file that is
  explicitly about publishing.
- But it is a _blacklist_: any new file added to the repository root
  is published by default unless someone remembers to ignore it. That
  is the failure mode behind historical "npm leaked secrets" incidents.

### C. Add a negation to the `files` whitelist

Keep `"files": ["dist"]` and add a single exclusion:

```json
"files": [
  "dist",
  "!dist/**/*.test.*"
]
```

Note: when the `files` field is set, `.npmignore` cannot subtract
paths from a whitelisted directory. Negation entries inside `files`
are the supported way to carve out sub-paths. That rules out using
`.npmignore` alongside `files` for this purpose.

- One-line change, same file, same field.
- Preserves the whitelist posture: anything outside `dist/` is never
  published, and future additions default to non-published.

## Decision

**Chose C.**

Publishing is a safety-critical boundary: the cost of an accidental
leak (credentials, unfinished work, internal docs) is far larger than
the cost of reading a slightly busier `files` entry. The whitelist
model in `files` enforces that safety by construction, and the
negation keeps the exclusion expressed in the same place as the
inclusion, which matches where a reader would look when asking "what
does this package ship?". Option B's aesthetic appeal of a dedicated
`.npmignore` does not outweigh the downgrade from whitelist to
blacklist. Option A mislocates the fix inside `tsconfig`.

## Consequences

- `package.json#files` owns both what is shipped and what is
  subtracted from within it. Future excludes go there as additional
  `!` entries.
- `.npmignore` is intentionally absent. If a reviewer reaches for it,
  this document explains why it would not help while `files` is set.
- Test files still compile into `dist/` during local builds. This is
  acceptable because they cost almost nothing on disk and keep the TS
  config single-rooted.
