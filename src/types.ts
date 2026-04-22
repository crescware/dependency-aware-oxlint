import type { OxlintConfig } from "oxlint";

export type DependencyGraph = {
  allFiles(): string[];
  importers(file: string): string[];
  ancestors(file: string): Set<string>;
  descendants(file: string): Set<string>;
};

type ScopeBase = {
  name: string;
  include: string[];
  exclude?: string[];
};

type ScopeWithInlineConfig = ScopeBase & {
  oxlintConfig: OxlintConfig;
  oxlintrcPath?: never;
};

type ScopeWithRcPath = ScopeBase & {
  oxlintrcPath: string;
  oxlintConfig?: never;
};

export type ScopeDefinition = ScopeWithInlineConfig | ScopeWithRcPath;

export type DependencyAwareOxlintConfig = {
  rootDir: string;
  tsconfig?: string;
  scopes: ScopeDefinition[];
};
