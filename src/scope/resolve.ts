import ignore from "ignore";
import { isAbsolute, relative, sep } from "node:path";

import type { DependencyGraph, ScopeDefinition } from "../types.js";

export type ResolvedScope = {
  name: string;
  files: string[];
};

export function resolveScope(
  scope: ScopeDefinition,
  graph: DependencyGraph,
  rootDir: string,
): ResolvedScope {
  const includeMatcher = ignore().add(scope.include);
  const excludePatterns = scope.exclude ?? [];
  const excludeMatcher = ignore().add(excludePatterns);
  const hasExclude = excludePatterns.length > 0;

  const toRel = (file: string): string | null => {
    const rel = relative(rootDir, file);
    if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
      return null;
    }
    return sep === "/" ? rel : rel.split(sep).join("/");
  };

  const matchesAnyInclude = (file: string): boolean => {
    const rel = toRel(file);
    if (rel === null) {
      return false;
    }
    return includeMatcher.ignores(rel);
  };
  const matchesAnyExclude = (file: string): boolean => {
    const rel = toRel(file);
    if (rel === null) {
      return false;
    }
    return excludeMatcher.ignores(rel);
  };

  const files = graph
    .allFiles()
    .filter((v) => {
      if (!matchesAnyInclude(v)) {
        return false;
      }
      if (!hasExclude) {
        return true;
      }
      if (matchesAnyExclude(v)) {
        return false;
      }
      const ancestors = graph.ancestors(v);
      if (ancestors.size === 0) {
        return true;
      }
      for (const a of ancestors) {
        if (!matchesAnyExclude(a)) {
          return true;
        }
      }
      return false;
    })
    .sort();

  return {
    name: scope.name,
    files,
  };
}
