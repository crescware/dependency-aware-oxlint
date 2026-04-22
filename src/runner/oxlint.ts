import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

export type OxlintDiagnostic = {
  message: string;
  code: string;
  severity: string;
  filename: string;
  help?: string;
  url?: string;
  labels?: Array<{
    label?: string;
    span: { offset: number; length: number; line: number; column: number };
  }>;
};

export type OxlintResult = {
  diagnostics: OxlintDiagnostic[];
  numberOfFiles?: number;
  numberOfRules?: number;
  exitCode: number;
  stderr: string;
  rawStdout: string;
};

export type RunOxlintOptions = {
  configPath: string;
  files: string[];
  cwd?: string;
  binPath?: string;
};

function parseOxlintJson(stdout: string): {
  diagnostics: OxlintDiagnostic[];
  numberOfFiles?: number;
  numberOfRules?: number;
} {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return { diagnostics: [] };
  }
  try {
    const parsed = JSON.parse(trimmed) as {
      diagnostics?: OxlintDiagnostic[];
      number_of_files?: number;
      number_of_rules?: number;
    };
    return {
      diagnostics: parsed.diagnostics ?? [],
      numberOfFiles: parsed.number_of_files,
      numberOfRules: parsed.number_of_rules,
    };
  } catch (error) {
    throw new Error(
      `Failed to parse oxlint JSON output: ${(error as Error).message}\n---raw---\n${stdout}`,
    );
  }
}

export async function runOxlint(
  options: RunOxlintOptions,
): Promise<OxlintResult> {
  if (options.files.length === 0) {
    return { diagnostics: [], exitCode: 0, stderr: "", rawStdout: "" };
  }
  const bin = options.binPath ?? "oxlint";
  const args = [
    "--config",
    resolve(options.configPath),
    "-f",
    "json",
    ...options.files,
  ];

  let stdout = "";
  let stderr = "";
  let exitCode = 0;
  try {
    const result = await execFileP(bin, args, {
      cwd: options.cwd,
      maxBuffer: 64 * 1024 * 1024,
    });
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (err) {
    const e = err as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
      code?: number | string;
    };
    if (typeof e.code === "string" && e.code === "ENOENT") {
      throw new Error(
        `oxlint binary not found (${bin}). Install it as a peer dependency.`,
      );
    }
    stdout = e.stdout ?? "";
    stderr = e.stderr ?? "";
    exitCode = typeof e.code === "number" ? e.code : 1;
  }

  const { diagnostics, numberOfFiles, numberOfRules } = parseOxlintJson(stdout);
  return {
    diagnostics,
    numberOfFiles,
    numberOfRules,
    exitCode,
    stderr,
    rawStdout: stdout,
  };
}
