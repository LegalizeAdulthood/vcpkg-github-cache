/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { describe, expect, test } from "vitest";

import {
  shouldLogAnalysisDetails,
  shouldProbePackageMetadata,
  shouldUseDeniedPackageTableOnly,
} from "../src/shared/analyze-policy";
import { BuildLogFacts } from "../src/shared/build-log";

function buildLogFacts(
  writeDeniedPackages: BuildLogFacts["writeDeniedPackages"],
): BuildLogFacts {
  return { writeDeniedPackages } as BuildLogFacts;
}

describe("analyze policy", () => {
  test("probes package metadata for denied package reports", () => {
    expect(
      shouldProbePackageMetadata(
        false,
        "never",
        "github",
        buildLogFacts([{ packageId: "fmt_x64-windows", version: "8.0.0" }]),
      ),
    ).toBe(true);
    expect(
      shouldProbePackageMetadata(false, "never", "github", buildLogFacts([])),
    ).toBe(false);
  });

  test("logs analysis details only for debug or trace", () => {
    expect(shouldLogAnalysisDetails(false, false)).toBe(false);
    expect(shouldLogAnalysisDetails(true, false)).toBe(true);
    expect(shouldLogAnalysisDetails(false, true)).toBe(true);
  });

  test("uses only the denied package table in quiet summaries", () => {
    expect(shouldUseDeniedPackageTableOnly(1, false)).toBe(true);
    expect(shouldUseDeniedPackageTableOnly(1, true)).toBe(false);
    expect(shouldUseDeniedPackageTableOnly(0, false)).toBe(false);
  });
});
