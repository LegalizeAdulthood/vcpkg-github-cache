/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { describe, expect, test } from "vitest";

import { BuildLogFacts } from "../src/shared/build-log";
import {
  buildMissPackageIdentities,
  buildMissReportRows,
  buildMissReports,
  formatBuildMissReportTable,
} from "../src/shared/build-miss-report";
import { PackageMetadataProbe } from "../src/shared/package-metadata";

const SETTINGS_URL =
  "https://github.com/users/octo/packages/nuget/fmt_x64-windows/settings";

function buildLogFacts(values: Partial<BuildLogFacts>): BuildLogFacts {
  return {
    authMessages: [],
    builtPackages: [],
    failedHttpStatuses: [],
    feeds: [],
    nugetConfigPaths: [],
    packageAbiHashes: [],
    packageHandleTimes: [],
    packageUploadStatuses: [],
    quotaMessages: [],
    restoredPackages: [],
    submissionsStarted: 0,
    uploadsAttempted: 0,
    writeDeniedPackages: [],
    zeroCacheSubmissions: 0,
    ...values,
  };
}

function packageMetadata(): PackageMetadataProbe {
  return {
    limit: 20,
    owner: "octo",
    probedPackageIds: 1,
    requestedPackageIds: 1,
    results: [
      {
        detail: "HTTP 200 OK",
        name: "fmt_x64-windows",
        settingsUrl: SETTINGS_URL,
        status: "ok",
        versionNames: [
          "8.0.0-vcpkg0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        ],
      },
    ],
  };
}

describe("build miss report", () => {
  test("lists built packages with matching build times", () => {
    const reports = buildMissReports(
      buildLogFacts({
        builtPackages: ["fmt:x64-windows@8.0.0#1", "zlib:x64-windows@1.3.1"],
        packageHandleTimes: [
          {
            elapsed: "42 s",
            packageId: "fmt_x64-windows",
            packageSpec: "fmt:x64-windows",
          },
        ],
        packageUploadStatuses: [
          {
            packageId: "fmt_x64-windows",
            packageSpec: "fmt:x64-windows",
            status: "succeeded",
          },
        ],
      }),
      packageMetadata(),
    );

    expect(reports).toEqual([
      {
        buildTime: "42 s",
        packageId: "fmt_x64-windows",
        packageSettingsUrl: SETTINGS_URL,
        packageSpec: "fmt:x64-windows@8.0.0#1",
        uploadStatus: "succeeded",
        version: "8.0.0#1",
      },
      {
        buildTime: undefined,
        packageId: "zlib_x64-windows",
        packageSettingsUrl: undefined,
        packageSpec: "zlib:x64-windows@1.3.1",
        uploadStatus: "unknown",
        version: "1.3.1",
      },
    ]);
    expect(buildMissReportRows(reports)).toEqual([
      ["Package ID", "Version", "Build Time", "Upload"],
      ["fmt_x64-windows", "8.0.0#1", "42 s", "succeeded"],
      ["zlib_x64-windows", "1.3.1", "unknown", "unknown"],
    ]);
  });

  test("omits build time column when no package has timing data", () => {
    const reports = buildMissReports(
      buildLogFacts({
        builtPackages: ["fmt:x64-windows@8.0.0#1"],
      }),
    );

    expect(buildMissReportRows(reports)).toEqual([
      ["Package ID", "Version", "Upload"],
      ["fmt_x64-windows", "8.0.0#1", "unknown"],
    ]);
  });

  test("marks denied package uploads as failed", () => {
    const reports = buildMissReports(
      buildLogFacts({
        packageAbiHashes: [
          {
            abiHash:
              "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            packageId: "fmt_x64-windows",
            packageSpec: "fmt:x64-windows",
          },
        ],
        builtPackages: ["fmt:x64-windows@8.0.0#1"],
        writeDeniedPackages: [
          {
            packageId: "fmt_x64-windows",
            version: "8.0.0",
          },
        ],
      }),
      packageMetadata(),
    );

    expect(buildMissReportRows(reports)).toEqual([
      ["Package ID", "Version", "Upload"],
      ["fmt_x64-windows", "8.0.0#1", "failed"],
    ]);
  });

  test("marks failed uploads as already present when the version exists", () => {
    const reports = buildMissReports(
      buildLogFacts({
        builtPackages: ["fmt:x64-windows@8.0.0#1"],
        packageAbiHashes: [
          {
            abiHash:
              "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            packageId: "fmt_x64-windows",
            packageSpec: "fmt:x64-windows",
          },
        ],
        packageUploadStatuses: [
          {
            packageId: "fmt_x64-windows",
            packageSpec: "fmt:x64-windows",
            status: "failed",
          },
        ],
      }),
      packageMetadata(),
    );

    expect(buildMissReportRows(reports)).toEqual([
      ["Package ID", "Version", "Upload"],
      ["fmt_x64-windows", "8.0.0#1", "already present"],
    ]);
  });

  test("links package IDs when metadata has a settings URL", () => {
    const reports = buildMissReports(
      buildLogFacts({
        builtPackages: ["fmt:x64-windows@8.0.0#1"],
      }),
      packageMetadata(),
    );

    expect(buildMissReportRows(reports, "html")[1][0]).toBe(
      `<a href="${SETTINGS_URL}">fmt_x64-windows</a>`,
    );
    expect(formatBuildMissReportTable(reports)).toContain(
      `| [fmt_x64-windows](${SETTINGS_URL}) | 8.0.0#1 | unknown |`,
    );
  });

  test("does not link missing package IDs", () => {
    const reports = buildMissReports(
      buildLogFacts({
        builtPackages: ["fmt:x64-windows@8.0.0#1"],
      }),
      {
        limit: 20,
        owner: "octo",
        probedPackageIds: 1,
        requestedPackageIds: 1,
        results: [
          {
            detail: "HTTP 404 Not Found",
            name: "fmt_x64-windows",
            settingsUrl: SETTINGS_URL,
            status: "missing",
          },
        ],
      },
    );

    expect(buildMissReportRows(reports, "html")[1][0]).toBe("fmt_x64-windows");
    expect(formatBuildMissReportTable(reports)).toContain(
      "| fmt_x64-windows | 8.0.0#1 | unknown |",
    );
  });

  test("extracts package identities from built packages", () => {
    expect(
      buildMissPackageIdentities(
        buildLogFacts({
          builtPackages: ["fmt:x64-windows@8.0.0#1", "not-a-spec"],
          vcpkgTool: {
            packageId: "vcpkg-tool_freebsd-x64",
            publishStatus: "published",
            status: "built-from-source",
            version: "1.0.0-vcpkgtoolabcdef0123456789",
          },
        }),
      ),
    ).toEqual([
      {
        id: "vcpkg-tool_freebsd-x64",
        version: "1.0.0-vcpkgtoolabcdef0123456789",
      },
      { id: "fmt_x64-windows", version: "8.0.0#1" },
    ]);
  });

  test("lists a source-built FreeBSD vcpkg tool package", () => {
    const reports = buildMissReports(
      buildLogFacts({
        vcpkgTool: {
          packageId: "vcpkg-tool_freebsd-x64",
          publishStatus: "published",
          status: "built-from-source",
          version: "1.0.0-vcpkgtoolabcdef0123456789",
        },
      }),
    );

    expect(buildMissReportRows(reports)).toEqual([
      ["Package ID", "Version", "Upload"],
      [
        "vcpkg-tool_freebsd-x64",
        "1.0.0-vcpkgtoolabcdef0123456789",
        "succeeded",
      ],
    ]);
  });

  test("lists a source-built OpenBSD vcpkg tool package", () => {
    const reports = buildMissReports(
      buildLogFacts({
        vcpkgTool: {
          packageId: "vcpkg-tool_openbsd-x64",
          publishStatus: "failed",
          status: "built-from-source",
          version: "1.0.0-vcpkgtoolabcdef0123456789",
        },
      }),
    );

    expect(buildMissReportRows(reports)).toEqual([
      ["Package ID", "Version", "Upload"],
      ["vcpkg-tool_openbsd-x64", "1.0.0-vcpkgtoolabcdef0123456789", "failed"],
    ]);
  });

  test("formats a Markdown table for logs", () => {
    const reports = buildMissReports(
      buildLogFacts({
        builtPackages: ["fmt:x64-windows@8.0.0#1"],
      }),
    );

    expect(formatBuildMissReportTable(reports)).toContain(
      "| fmt_x64-windows | 8.0.0#1 | unknown |",
    );
  });
});
