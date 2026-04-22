import type { DependencyAwareOxlintConfig } from "@crescware/dependency-aware-oxlint";

export default {
  rootDir: "src",
  tsconfig: "tsconfig.json",
  scopes: [
    {
      name: "strict",
      oxlintrcPath: ".oxlintrc.strict.json",
      include: ["**/*.ts"],
      exclude: ["**/form-schema.*"],
    },
  ],
} satisfies DependencyAwareOxlintConfig;
