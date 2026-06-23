/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { describe, expect, test } from "vitest";

import {
  cacheStatusHeading,
  shouldLogAnalysisDetails,
  shouldProbePackageMetadata,
  shouldUseCompactSummary,
} from "../src/shared/analyze-policy";
import { BuildLogFacts } from "../src/shared/build-log";

function buildLogFacts(values: Partial<BuildLogFacts>): BuildLogFacts {
  return values as BuildLogFacts;
}

describe("analyze policy", () => {
  test("labels compact summaries with cache status", () => {
    expect(cacheStatusHeading("upload-failure")).toBe(
      "Cache status: upload failure",
    );
  });

  test("probes package metadata for denied package reports", () => {
    expect(
      shouldProbePackageMetadata(
        false,
        "never",
        "github",
        buildLogFacts({
          writeDeniedPackages: [
            { packageId: "fmt_x64-windows", version: "8.0.0" },
          ],
        }),
      ),
    ).toBe(true);
    expect(
      shouldProbePackageMetadata(false, "never", "github", buildLogFacts({})),
    ).toBe(false);
  });

  test("probes package metadata for built package reports", () => {
    expect(
      shouldProbePackageMetadata(
        false,
        "never",
        "github",
        buildLogFacts({ builtPackages: ["fmt:x64-windows@8.0.0#1"] }),
      ),
    ).toBe(true);
  });

  test("probes package metadata for source-built vcpkg tool reports", () => {
    expect(
      shouldProbePackageMetadata(
        false,
        "never",
        "github",
        buildLogFacts({
          vcpkgTool: {
            packageId: "vcpkg-tool_freebsd-x64",
            publishStatus: "published",
            status: "built-from-source",
            version: "1.0.0-vcpkgtoolabcdef0123456789",
          },
        }),
      ),
    ).toBe(true);
  });

  test("logs analysis details only for debug or trace", () => {
    expect(shouldLogAnalysisDetails(false, false)).toBe(false);
    expect(shouldLogAnalysisDetails(true, false)).toBe(true);
    expect(shouldLogAnalysisDetails(false, true)).toBe(true);
  });

  test("uses compact summaries outside debug and trace mode", () => {
    expect(shouldUseCompactSummary(false)).toBe(true);
    expect(shouldUseCompactSummary(true)).toBe(false);
  });
});
