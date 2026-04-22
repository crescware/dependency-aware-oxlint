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
