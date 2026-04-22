import picomatch from "picomatch";

import type { DependencyGraph, ScopeDefinition } from "../types.js";

export type ResolvedScope = {
  name: string;
  files: string[];
};

export function resolveScope(
  scope: ScopeDefinition,
  graph: DependencyGraph,
): ResolvedScope {
  const includeMatchers = scope.include.map((v) => picomatch(v));
  const excludeMatchers = (scope.exclude ?? []).map((v) => picomatch(v));

  const matchesAnyInclude = (file: string) =>
    includeMatchers.some((v) => v(file));
  const matchesAnyExclude = (file: string) =>
    excludeMatchers.some((v) => v(file));

  const files = graph.allFiles().filter((v) => {
    if (!matchesAnyInclude(v)) {
      return false;
    }
    if (excludeMatchers.length === 0) {
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
  });

  return {
    name: scope.name,
    files,
  };
}
