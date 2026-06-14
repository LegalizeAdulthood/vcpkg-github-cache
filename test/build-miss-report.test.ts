/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { describe, expect, test } from "vitest";

import { BuildLogFacts } from "../src/shared/build-log";
import {
  buildMissReportRows,
  buildMissReports,
  formatBuildMissReportTable,
} from "../src/shared/build-miss-report";

function buildLogFacts(values: Partial<BuildLogFacts>): BuildLogFacts {
  return {
    authMessages: [],
    builtPackages: [],
    failedHttpStatuses: [],
    feeds: [],
    nugetConfigPaths: [],
    packageHandleTimes: [],
    quotaMessages: [],
    restoredPackages: [],
    submissionsStarted: 0,
    uploadsAttempted: 0,
    writeDeniedPackages: [],
    zeroCacheSubmissions: 0,
    ...values,
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
      }),
    );

    expect(reports).toEqual([
      {
        buildTime: "42 s",
        packageId: "fmt_x64-windows",
        packageSpec: "fmt:x64-windows@8.0.0#1",
      },
      {
        buildTime: undefined,
        packageId: "zlib_x64-windows",
        packageSpec: "zlib:x64-windows@1.3.1",
      },
    ]);
    expect(buildMissReportRows(reports)).toEqual([
      ["Package", "Build Time"],
      ["fmt:x64-windows@8.0.0#1", "42 s"],
      ["zlib:x64-windows@1.3.1", "unknown"],
    ]);
  });

  test("omits build time column when no package has timing data", () => {
    const reports = buildMissReports(
      buildLogFacts({
        builtPackages: ["fmt:x64-windows@8.0.0#1"],
      }),
    );

    expect(buildMissReportRows(reports)).toEqual([
      ["Package"],
      ["fmt:x64-windows@8.0.0#1"],
    ]);
  });

  test("formats a Markdown table for logs", () => {
    const reports = buildMissReports(
      buildLogFacts({
        builtPackages: ["fmt:x64-windows@8.0.0#1"],
      }),
    );

    expect(formatBuildMissReportTable(reports)).toContain(
      "| fmt:x64-windows@8.0.0#1 |",
    );
  });
});
