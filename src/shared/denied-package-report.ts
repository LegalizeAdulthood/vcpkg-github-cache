/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

export interface DeniedPackageReport {
  readonly buildTime?: string;
  readonly nupkgSize?: string;
  readonly packageId: string;
  readonly repository?: string;
  readonly version: string;
  readonly visibility?: string;
}

interface ReportColumn {
  readonly header: string;
  readonly required?: boolean;
  readonly value: (report: DeniedPackageReport) => string | undefined;
}

const VCPKG_VERSION_SUFFIX = /-vcpkg[0-9a-f]{64}$/i;

const COLUMNS: readonly ReportColumn[] = [
  {
    header: "Package ID",
    required: true,
    value: (report) => report.packageId,
  },
  {
    header: "Version",
    required: true,
    value: (report) => displayPackageVersion(report.version),
  },
  {
    header: "Size",
    value: (report) => report.nupkgSize,
  },
  {
    header: "Build Time",
    value: (report) => report.buildTime,
  },
  {
    header: "Repository",
    value: (report) => report.repository,
  },
  {
    header: "Visibility",
    value: (report) => report.visibility,
  },
];

function hasValue(value: string | undefined): boolean {
  return value !== undefined && value.length > 0;
}

function reportColumns(
  reports: readonly DeniedPackageReport[],
): readonly ReportColumn[] {
  return COLUMNS.filter(
    (column) =>
      column.required ||
      reports.some((report) => hasValue(column.value(report))),
  );
}

function reportValue(
  column: ReportColumn,
  report: DeniedPackageReport,
): string {
  return column.value(report) || "unknown";
}

function markdownCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

export function displayPackageVersion(version: string): string {
  const trimmed = version.replace(VCPKG_VERSION_SUFFIX, "");

  return trimmed.length > 0 ? trimmed : version;
}

export function deniedPackageReportRows(
  reports: readonly DeniedPackageReport[],
): readonly (readonly string[])[] {
  const columns = reportColumns(reports);

  return [
    columns.map((column) => column.header),
    ...reports.map((report) =>
      columns.map((column) => reportValue(column, report)),
    ),
  ];
}

export function formatDeniedPackageReportTable(
  reports: readonly DeniedPackageReport[],
): string {
  if (!reports.length) {
    return "";
  }

  const [header, ...rows] = deniedPackageReportRows(reports);

  return [
    `| ${header.map(markdownCell).join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(markdownCell).join(" | ")} |`),
    "",
  ].join("\n");
}

export function formatDeniedPackageReportLine(
  report: DeniedPackageReport,
): string {
  const details = [
    report.nupkgSize ? `size: ${report.nupkgSize}` : "",
    report.buildTime ? `build time: ${report.buildTime}` : "",
    report.repository ? `repository: ${report.repository}` : "",
    report.visibility ? `visibility: ${report.visibility}` : "",
  ].filter((value) => value.length > 0);

  return [
    `write denied: ${report.packageId} ${displayPackageVersion(report.version)}`,
    details.length ? ` (${details.join(", ")})` : "",
  ].join("");
}
