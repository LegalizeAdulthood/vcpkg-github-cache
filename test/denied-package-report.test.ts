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
        repository: "octo/repo",
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
      "Visibility",
    ]);
    expect(rows[1]).toEqual([
      "fmt_x64-windows",
      "8.0.0",
      "12 MiB",
      "42 s",
      "octo/repo",
      "public",
    ]);
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
