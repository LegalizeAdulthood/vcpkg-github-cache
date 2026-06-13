/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { describe, expect, test } from "vitest";

import {
  deniedPackageReportRows,
  displayPackageVersion,
  formatDeniedPackageReportTable,
} from "../src/shared/denied-package-report";

const VCPKG_SUFFIX =
  "vcpkg0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("denied package report", () => {
  test("shortens vcpkg hash suffixes only when a version prefix remains", () => {
    expect(displayPackageVersion(`1.90.0-${VCPKG_SUFFIX}`)).toBe("1.90.0");
    expect(displayPackageVersion(VCPKG_SUFFIX)).toBe(VCPKG_SUFFIX);
  });

  test("adds optional prioritization columns when data is available", () => {
    const rows = deniedPackageReportRows([
      {
        buildTime: "42 s",
        nupkgSize: "12 MiB",
        packageId: "fmt_x64-windows",
        packageSettingsUrl:
          "https://github.com/users/octo/packages/nuget/fmt_x64-windows/settings",
        packageVersionCount: 4,
        quotaRisk: "none",
        repository: "octo/repo",
        repositoryUrl: "https://github.com/octo/repo",
        version: `8.0.0-${VCPKG_SUFFIX}`,
        visibility: "public",
      },
    ]);

    expect(rows[0]).toEqual([
      "Package ID",
      "Version",
      "Size",
      "Build Time",
      "Repository",
      "Versions",
      "Visibility",
    ]);
    expect(rows[1]).toEqual([
      "fmt_x64-windows",
      "8.0.0",
      "12 MiB",
      "42 s",
      "octo/repo",
      "4",
      "public",
    ]);
  });

  test("links repositories when a repository URL is available", () => {
    const report = {
      packageId: "fmt_x64-windows",
      repository: "octo/repo",
      repositoryUrl: "https://github.com/octo/repo",
      version: `8.0.0-${VCPKG_SUFFIX}`,
    };

    expect(deniedPackageReportRows([report], "html")[1][2]).toBe(
      '<a href="https://github.com/octo/repo">octo/repo</a>',
    );
    expect(formatDeniedPackageReportTable([report])).toContain(
      "| fmt_x64-windows | 8.0.0 | [octo/repo](https://github.com/octo/repo) |",
    );
  });

  test("adds quota risk column only when a row has risk", () => {
    const rows = deniedPackageReportRows([
      {
        packageId: "fmt_x64-windows",
        quotaRisk: "none",
        version: `8.0.0-${VCPKG_SUFFIX}`,
      },
      {
        packageId: "zlib_x64-windows",
        quotaRisk: "private package storage",
        version: `1.3.1-${VCPKG_SUFFIX}`,
      },
    ]);

    expect(rows[0]).toEqual(["Package ID", "Version", "Quota Risk"]);
    expect(rows[1]).toEqual(["fmt_x64-windows", "8.0.0", "none"]);
    expect(rows[2]).toEqual([
      "zlib_x64-windows",
      "1.3.1",
      "private package storage",
    ]);
  });

  test("links package IDs when a settings URL is available", () => {
    const report = {
      packageId: "fmt_x64-windows",
      packageSettingsUrl:
        "https://github.com/users/octo/packages/nuget/fmt_x64-windows/settings",
      version: `8.0.0-${VCPKG_SUFFIX}`,
    };

    expect(deniedPackageReportRows([report], "html")[1][0]).toBe(
      '<a href="https://github.com/users/octo/packages/nuget/fmt_x64-windows/settings">fmt_x64-windows</a>',
    );
    expect(formatDeniedPackageReportTable([report])).toContain(
      "| [fmt_x64-windows](https://github.com/users/octo/packages/nuget/fmt_x64-windows/settings) |",
    );
  });

  test("formats a Markdown table for logs", () => {
    expect(
      formatDeniedPackageReportTable([
        {
          buildTime: "42 s",
          packageId: "fmt_x64-windows",
          version: `8.0.0-${VCPKG_SUFFIX}`,
        },
      ]),
    ).toContain("| fmt_x64-windows | 8.0.0 | 42 s |");
  });
});
