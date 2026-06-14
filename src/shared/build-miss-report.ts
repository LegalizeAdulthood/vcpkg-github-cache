/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { BuildLogFacts, packageSpecToNugetPackageId } from "./build-log";

export interface BuildMissReport {
  readonly buildTime?: string;
  readonly packageId: string;
  readonly packageSpec: string;
}

interface ReportColumn {
  readonly header: string;
  readonly required?: boolean;
  readonly value: (report: BuildMissReport) => string | undefined;
}

const COLUMNS: readonly ReportColumn[] = [
  {
    header: "Package",
    required: true,
    value: (report) => report.packageSpec,
  },
  {
    header: "Build Time",
    value: (report) => report.buildTime,
  },
];

function hasValue(value: string | undefined): value is string {
  return value !== undefined && value.length > 0;
}

function reportColumnIncluded(
  column: ReportColumn,
  reports: readonly BuildMissReport[],
): boolean {
  return (
    column.required === true ||
    reports.some((report) => hasValue(column.value(report)))
  );
}

function reportColumns(
  reports: readonly BuildMissReport[],
): readonly ReportColumn[] {
  return COLUMNS.filter((column) => reportColumnIncluded(column, reports));
}

function reportValue(column: ReportColumn, report: BuildMissReport): string {
  return column.value(report) || "unknown";
}

function markdownCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function buildTimeByPackageId(
  buildLogFacts: BuildLogFacts,
): ReadonlyMap<string, string> {
  return new Map(
    buildLogFacts.packageHandleTimes.map((value) => [
      value.packageId,
      value.elapsed,
    ]),
  );
}

export function buildMissReports(
  buildLogFacts: BuildLogFacts | undefined,
): readonly BuildMissReport[] {
  if (!buildLogFacts) {
    return [];
  }

  const handleTimes = buildTimeByPackageId(buildLogFacts);

  return buildLogFacts.builtPackages.map((packageSpec) => {
    const packageId = packageSpecToNugetPackageId(packageSpec) ?? packageSpec;

    return {
      buildTime: handleTimes.get(packageId),
      packageId,
      packageSpec,
    };
  });
}

export function buildMissReportRows(
  reports: readonly BuildMissReport[],
): readonly (readonly string[])[] {
  const columns = reportColumns(reports);

  return [
    columns.map((column) => column.header),
    ...reports.map((report) =>
      columns.map((column) => reportValue(column, report)),
    ),
  ];
}

export function formatBuildMissReportTable(
  reports: readonly BuildMissReport[],
): string {
  if (!reports.length) {
    return "";
  }

  const [header, ...rows] = buildMissReportRows(reports);

  return [
    `| ${header.map(markdownCell).join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(markdownCell).join(" | ")} |`),
    "",
  ].join("\n");
}
