/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import {
  BuildLogFacts,
  PackageUploadState,
  packageSpecToNugetPackageId,
  packageSpecVersion,
} from "./build-log";
import { displayPackageVersion } from "./denied-package-report";
import { PackageIdentity } from "./package-config";
import {
  PackageMetadataProbe,
  PackageMetadataResult,
} from "./package-metadata";

export interface BuildMissReport {
  readonly buildTime?: string;
  readonly packageId: string;
  readonly packageSettingsUrl?: string;
  readonly packageSpec: string;
  readonly uploadStatus: PackageUploadState;
  readonly version: string;
}

type ReportCellFormat = "html" | "markdown" | "text";

interface ReportColumn {
  readonly header: string;
  readonly required?: boolean;
  readonly value: (
    report: BuildMissReport,
    format: ReportCellFormat,
  ) => string | undefined;
}

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
    header: "Build Time",
    value: (report) => report.buildTime,
  },
  {
    header: "Upload",
    required: true,
    value: (report) => report.uploadStatus,
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
    reports.some((report) => hasValue(column.value(report, "text")))
  );
}

function reportColumns(
  reports: readonly BuildMissReport[],
): readonly ReportColumn[] {
  return COLUMNS.filter((column) => reportColumnIncluded(column, reports));
}

function reportValue(
  column: ReportColumn,
  report: BuildMissReport,
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
  report: BuildMissReport,
  format: ReportCellFormat,
): string {
  return linkValue(report.packageId, report.packageSettingsUrl, format);
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

function packageMetadataResults(
  packageMetadata: PackageMetadataProbe | undefined,
): ReadonlyMap<string, PackageMetadataResult> {
  return new Map(
    (packageMetadata?.results ?? []).map((value) => [value.name, value]),
  );
}

function uploadStatusByPackageId(
  buildLogFacts: BuildLogFacts,
): ReadonlyMap<string, PackageUploadState> {
  return new Map(
    buildLogFacts.packageUploadStatuses.map((value) => [
      value.packageId,
      value.status,
    ]),
  );
}

function deniedPackageIds(buildLogFacts: BuildLogFacts): ReadonlySet<string> {
  return new Set(
    buildLogFacts.writeDeniedPackages.map((value) => value.packageId),
  );
}

function uploadStatus(
  packageId: string,
  uploads: ReadonlyMap<string, PackageUploadState>,
  deniedPackages: ReadonlySet<string>,
): PackageUploadState {
  if (deniedPackages.has(packageId)) {
    return "failed";
  }

  return uploads.get(packageId) ?? "unknown";
}

function packageIdentity(packageSpec: string): PackageIdentity | undefined {
  const id = packageSpecToNugetPackageId(packageSpec);
  const version = packageSpecVersion(packageSpec);

  return id && version ? { id, version } : undefined;
}

export function buildMissPackageIdentities(
  buildLogFacts: BuildLogFacts | undefined,
): readonly PackageIdentity[] {
  if (!buildLogFacts) {
    return [];
  }

  return buildLogFacts.builtPackages.flatMap((packageSpec) => {
    const identity = packageIdentity(packageSpec);

    return identity ? [identity] : [];
  });
}

export function buildMissReports(
  buildLogFacts: BuildLogFacts | undefined,
  packageMetadata?: PackageMetadataProbe,
): readonly BuildMissReport[] {
  if (!buildLogFacts) {
    return [];
  }

  const handleTimes = buildTimeByPackageId(buildLogFacts);
  const metadata = packageMetadataResults(packageMetadata);
  const uploads = uploadStatusByPackageId(buildLogFacts);
  const deniedPackages = deniedPackageIds(buildLogFacts);

  return buildLogFacts.builtPackages.map((packageSpec) => {
    const packageId = packageSpecToNugetPackageId(packageSpec) ?? packageSpec;
    const result = metadata.get(packageId);

    return {
      buildTime: handleTimes.get(packageId),
      packageId,
      packageSettingsUrl: result?.settingsUrl,
      packageSpec,
      uploadStatus: uploadStatus(packageId, uploads, deniedPackages),
      version: packageSpecVersion(packageSpec) ?? "unknown",
    };
  });
}

export function buildMissReportRows(
  reports: readonly BuildMissReport[],
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

export function formatBuildMissReportTable(
  reports: readonly BuildMissReport[],
): string {
  if (!reports.length) {
    return "";
  }

  const [header, ...rows] = buildMissReportRows(reports, "markdown");

  return [
    `| ${header.map(markdownCell).join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(markdownCell).join(" | ")} |`),
    "",
  ].join("\n");
}
