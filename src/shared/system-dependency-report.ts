/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { MissingSystemDependency } from "./build-log";

type ReportCellFormat = "html" | "markdown" | "text";

interface ReportColumn {
  readonly header: string;
  readonly value: (
    report: MissingSystemDependency,
    format: ReportCellFormat,
  ) => string;
}

const COLUMNS: readonly ReportColumn[] = [
  {
    header: "Tool",
    value: (report) => report.tool,
  },
  {
    header: "Suggested Package",
    value: (report) => report.suggestedPackage,
  },
  {
    header: "Needed By",
    value: (report) => report.neededBy,
  },
  {
    header: "Evidence",
    value: (report) => report.evidence,
  },
];

function markdownCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function reportValue(
  column: ReportColumn,
  report: MissingSystemDependency,
  format: ReportCellFormat,
): string {
  return column.value(report, format) || "unknown";
}

export function systemDependencyReportRows(
  reports: readonly MissingSystemDependency[],
  format: ReportCellFormat = "text",
): readonly (readonly string[])[] {
  return [
    COLUMNS.map((column) => column.header),
    ...reports.map((report) =>
      COLUMNS.map((column) => reportValue(column, report, format)),
    ),
  ];
}

export function formatSystemDependencyReportTable(
  reports: readonly MissingSystemDependency[],
): string {
  if (!reports.length) {
    return "";
  }

  const [header, ...rows] = systemDependencyReportRows(reports, "markdown");

  return [
    `| ${header.map(markdownCell).join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(markdownCell).join(" | ")} |`),
    "",
  ].join("\n");
}
