/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

export interface DeniedPackageReport {
  readonly buildTime?: string;
  readonly nupkgSize?: string;
  readonly packageId: string;
  readonly packageSettingsUrl?: string;
  readonly packageVersionCount?: number;
  readonly quotaRisk?: string;
  readonly repository?: string;
  readonly version: string;
  readonly visibility?: string;
}

type ReportCellFormat = "html" | "markdown" | "text";

interface ReportColumn {
  readonly header: string;
  readonly required?: boolean;
  readonly value: (
    report: DeniedPackageReport,
    format: ReportCellFormat,
  ) => string | undefined;
}

const VCPKG_VERSION_SUFFIX = /-vcpkg[0-9a-f]{64}$/i;

const COLUMNS: readonly ReportColumn[] = [
  {
    header: "Package ID",
    required: true,
    value: packageIdValue,
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
    header: "Versions",
    value: (report) => report.packageVersionCount?.toString(),
  },
  {
    header: "Visibility",
    value: (report) => report.visibility,
  },
  {
    header: "Quota Risk",
    value: (report) => report.quotaRisk,
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
      reports.some((report) => hasValue(column.value(report, "text"))),
  );
}

function reportValue(
  column: ReportColumn,
  report: DeniedPackageReport,
  format: ReportCellFormat,
): string {
  return column.value(report, format) || "unknown";
}

function markdownCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function htmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function packageIdValue(
  report: DeniedPackageReport,
  format: ReportCellFormat,
): string {
  if (!report.packageSettingsUrl || format === "text") {
    return report.packageId;
  }

  if (format === "html") {
    return `<a href="${htmlEscape(report.packageSettingsUrl)}">${htmlEscape(
      report.packageId,
    )}</a>`;
  }

  return `[${report.packageId}](${report.packageSettingsUrl})`;
}

export function displayPackageVersion(version: string): string {
  const trimmed = version.replace(VCPKG_VERSION_SUFFIX, "");

  return trimmed.length > 0 ? trimmed : version;
}

export function deniedPackageReportRows(
  reports: readonly DeniedPackageReport[],
  format: ReportCellFormat = "text",
): readonly (readonly string[])[] {
  const columns = reportColumns(reports);

  return [
    columns.map((column) => column.header),
    ...reports.map((report) =>
      columns.map((column) => reportValue(column, report, format)),
    ),
  ];
}

export function formatDeniedPackageReportTable(
  reports: readonly DeniedPackageReport[],
): string {
  if (!reports.length) {
    return "";
  }

  const [header, ...rows] = deniedPackageReportRows(reports, "markdown");

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
    report.packageVersionCount !== undefined
      ? `versions: ${report.packageVersionCount}`
      : "",
    report.repository ? `repository: ${report.repository}` : "",
    report.visibility ? `visibility: ${report.visibility}` : "",
    report.quotaRisk ? `quota risk: ${report.quotaRisk}` : "",
  ].filter((value) => value.length > 0);

  return [
    `write denied: ${report.packageId} ${displayPackageVersion(report.version)}`,
    details.length ? ` (${details.join(", ")})` : "",
  ].join("");
}
