import { join, sep } from "node:path";
import { describe, expect, test } from "vitest";

import type { DependencyGraph, ScopeDefinition } from "../types.js";
import { resolveScope } from "./resolve.js";

const rootDir = sep === "/" ? "/repo" : "C:\\repo";

function fakeGraph(relativeFiles: string[]): DependencyGraph {
  const abs = relativeFiles.map((v) => join(rootDir, v));
  return {
    allFiles: () => abs,
    importers: () => [],
    ancestors: () => new Set(),
    descendants: () => new Set(),
  };
}

function rels(files: string[]): string[] {
  return files.map((v) =>
    v
      .slice(rootDir.length + 1)
      .split(sep)
      .join("/"),
  );
}

function makeScope(include: string[], exclude?: string[]): ScopeDefinition {
  return {
    name: "test",
    include,
    exclude,
    oxlintConfig: { plugins: [], rules: {} },
  };
}

describe("resolveScope (gitignore semantics via ignore)", () => {
  test("baseline: **/*.ts matches files at any depth", () => {
    const graph = fakeGraph([
      "a.ts",
      "src/b.ts",
      "src/nested/c.ts",
      "src/d.js",
    ]);
    const result = resolveScope(makeScope(["**/*.ts"]), graph, rootDir);
    expect(rels(result.files)).toEqual(["a.ts", "src/b.ts", "src/nested/c.ts"]);
  });

  test("trailing slash limits to directory contents, not a same-named file", () => {
    const graph = fakeGraph(["foo", "foo/a.ts", "foo/nested/b.ts", "bar.ts"]);
    const result = resolveScope(
      makeScope(["**/*", "foo"], ["foo/"]),
      graph,
      rootDir,
    );
    expect(rels(result.files)).toEqual(["bar.ts", "foo"]);
  });

  test("leading slash anchors pattern to repository root", () => {
    const graph = fakeGraph(["foo.ts", "src/foo.ts", "src/nested/foo.ts"]);
    const result = resolveScope(
      makeScope(["**/*.ts"], ["/foo.ts"]),
      graph,
      rootDir,
    );
    expect(rels(result.files)).toEqual(["src/foo.ts", "src/nested/foo.ts"]);
  });

  test("negation re-includes a previously excluded path", () => {
    const graph = fakeGraph(["a.ts", "keep.ts", "drop.ts"]);
    const result = resolveScope(
      makeScope(["**/*.ts"], ["*.ts", "!keep.ts"]),
      graph,
      rootDir,
    );
    expect(rels(result.files)).toEqual(["keep.ts"]);
  });

  test("dotfiles are matched by default (gitignore semantics)", () => {
    const graph = fakeGraph([".hidden.ts", "visible.ts"]);
    const result = resolveScope(makeScope(["**/*.ts"]), graph, rootDir);
    expect(rels(result.files)).toEqual([".hidden.ts", "visible.ts"]);
  });

  test("files outside rootDir are excluded", () => {
    const outside = sep === "/" ? "/elsewhere/x.ts" : "C:\\elsewhere\\x.ts";
    const graph: DependencyGraph = {
      allFiles: () => [join(rootDir, "in.ts"), outside],
      importers: () => [],
      ancestors: () => new Set(),
      descendants: () => new Set(),
    };
    const result = resolveScope(makeScope(["**/*.ts"]), graph, rootDir);
    expect(rels(result.files)).toEqual(["in.ts"]);
  });

  test("empty include matches nothing", () => {
    const graph = fakeGraph(["a.ts", "b.ts"]);
    const result = resolveScope(makeScope([]), graph, rootDir);
    expect(result.files).toEqual([]);
  });
});
