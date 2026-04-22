import { execFile } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";

const execFileP = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const cliPath = resolve(here, "..", "dist", "cli.js");

type RunResult = { stdout: string; stderr: string; exitCode: number };

async function runDaox(cwd: string): Promise<RunResult> {
  try {
    const { stdout, stderr } = await execFileP("node", [cliPath], { cwd });
    return { stdout, stderr, exitCode: 0 };
  } catch (err) {
    const e = err as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
      code?: number | string;
    };
    return {
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
      exitCode: typeof e.code === "number" ? e.code : 1,
    };
  }
}

function assertExpectedOutput(result: RunResult): void {
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toMatch(/\[strict\] src\/item\.ts/);
  expect(result.stdout).toMatch(/\[strict\] src\/api-schema\.ts/);
  expect(result.stdout).not.toMatch(/form-schema\.ts/);
  expect(result.stdout).not.toMatch(/\buser\.ts\b/);
  expect(result.stdout).toMatch(/Summary: 2 errors/);
}

describe("integration", () => {
  test("inline oxlintConfig variant", async () => {
    const fixture = resolve(here, "fixtures", "inline-config");
    const result = await runDaox(fixture);
    assertExpectedOutput(result);
  });

  test("oxlintrcPath variant", async () => {
    const fixture = resolve(here, "fixtures", "rc-path-config");
    const result = await runDaox(fixture);
    assertExpectedOutput(result);
  });
});
