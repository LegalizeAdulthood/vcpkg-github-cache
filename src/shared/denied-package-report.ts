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
  readonly repositoryUrl?: string;
  readonly version: string;
  readonly visibility?: string;
}

type ReportCellFormat = "html" | "markdown" | "text";

interface ReportColumn {
  readonly header: string;
  readonly include?: (reports: readonly DeniedPackageReport[]) => boolean;
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
    value: repositoryValue,
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
    include: (reports) =>
      reports.some((report) => hasQuotaRisk(report.quotaRisk)),
    value: (report) => report.quotaRisk,
  },
];

function hasValue(value: string | undefined): value is string {
  return value !== undefined && value.length > 0;
}

function hasQuotaRisk(value: string | undefined): boolean {
  return hasValue(value) && value.trim().toLowerCase() !== "none";
}

function reportColumnIncluded(
  column: ReportColumn,
  reports: readonly DeniedPackageReport[],
): boolean {
  if (column.required) {
    return true;
  }

  if (column.include) {
    return column.include(reports);
  }

  return reports.some((report) => hasValue(column.value(report, "text")));
}

function reportColumns(
  reports: readonly DeniedPackageReport[],
): readonly ReportColumn[] {
  return COLUMNS.filter((column) => reportColumnIncluded(column, reports));
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

function linkValue(
  text: string,
  url: string | undefined,
  format: ReportCellFormat,
): string {
  if (!url || format === "text") {
    return text;
  }

  if (format === "html") {
    return `<a href="${htmlEscape(url)}">${htmlEscape(text)}</a>`;
  }

  return `[${text}](${url})`;
}

function packageIdValue(
  report: DeniedPackageReport,
  format: ReportCellFormat,
): string {
  return linkValue(report.packageId, report.packageSettingsUrl, format);
}

function repositoryValue(
  report: DeniedPackageReport,
  format: ReportCellFormat,
): string | undefined {
  return report.repository
    ? linkValue(report.repository, report.repositoryUrl, format)
    : undefined;
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
