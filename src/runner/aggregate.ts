import { relative } from "node:path";

import type { OxlintDiagnostic, OxlintResult } from "./oxlint.js";

export type ScopeRunResult = {
  scopeName: string;
  filesLinted: number;
  result: OxlintResult;
};

export type AggregatedReport = {
  scopes: ScopeRunResult[];
  errorCount: number;
  warningCount: number;
  totalDiagnostics: number;
  hasError: boolean;
};

export function aggregate(results: ScopeRunResult[]): AggregatedReport {
  let errorCount = 0;
  let warningCount = 0;
  let total = 0;
  for (const run of results) {
    for (const d of run.result.diagnostics) {
      total += 1;
      if (d.severity?.toLowerCase() === "error") {
        errorCount += 1;
      } else {
        warningCount += 1;
      }
    }
  }
  return {
    scopes: results,
    errorCount,
    warningCount,
    totalDiagnostics: total,
    hasError:
      errorCount > 0 ||
      results.some(
        (v) =>
          v.result.exitCode !== 0 &&
          v.result.diagnostics.length === 0 &&
          v.result.stderr.length > 0,
      ),
  };
}

function formatDiagnostic(
  scopeName: string,
  d: OxlintDiagnostic,
  cwd: string,
): string {
  const file = relative(cwd, d.filename) || d.filename;
  const label = d.labels?.[0]?.span;
  const position = label ? `:${label.line}:${label.column}` : "";
  const severity = d.severity?.toLowerCase() === "error" ? "error" : "warning";
  const header = `[${scopeName}] ${file}${position}`;
  const lines = [header, `  ${severity}: ${d.message}`, `  rule: ${d.code}`];
  if (d.help) {
    lines.push(`  help: ${d.help}`);
  }
  return lines.join("\n");
}

export function formatReport(report: AggregatedReport, cwd: string): string {
  const parts: string[] = [];
  for (const run of report.scopes) {
    if (run.result.diagnostics.length === 0) {
      parts.push(
        `[${run.scopeName}] (no issues, ${run.filesLinted} file${run.filesLinted === 1 ? "" : "s"})`,
      );
      continue;
    }
    for (const d of run.result.diagnostics) {
      parts.push(formatDiagnostic(run.scopeName, d, cwd));
    }
  }
  const scopeCount = report.scopes.length;
  parts.push(
    `\nSummary: ${report.errorCount} error${report.errorCount === 1 ? "" : "s"}, ${report.warningCount} warning${report.warningCount === 1 ? "" : "s"} across ${scopeCount} scope${scopeCount === 1 ? "" : "s"}`,
  );
  return parts.join("\n\n").replace(/\n\n\nSummary/, "\n\nSummary");
}
