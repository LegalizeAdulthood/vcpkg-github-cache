/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { describe, expect, test } from "vitest";

import { AnalyzerLiveProbes, ProbeResult } from "../src/shared/analyze-probes";
import {
  classifyCache,
  normalizeFailOnPolicy,
  shouldFailDiagnosis,
} from "../src/shared/diagnosis";
import { RestoreProbe } from "../src/shared/restore-probe";

function probe(status: ProbeResult["status"], detail: string): ProbeResult {
  return { detail, status };
}

function liveProbes(
  feedBasicAuth: ProbeResult = probe("ok", "HTTP 200 OK"),
): AnalyzerLiveProbes {
  return {
    feedBasicAuth,
    feedBearerAuth: probe("failed", "HTTP 401 Unauthorized"),
    nugetSources: probe("ok", "NuGet sources listed"),
    nugetVersion: probe("ok", "7.6.0.59"),
    vcpkgNuget: probe("ok", "nuget.exe"),
    vcpkgVersion: probe("ok", "vcpkg package manager version 2026"),
  };
}

function restoreProbe(
  status: ProbeResult["status"],
  detail: string,
  restoredCount?: number,
  output?: string,
): RestoreProbe {
  return {
    restoredCount,
    result: { detail, output, status },
  };
}

describe("cache diagnosis", () => {
  test("classifies a warm build log hit", () => {
    const diagnosis = classifyCache({
      buildLogFacts: {
        authMessages: [],
        builtCount: undefined,
        builtPackages: [],
        failedHttpStatuses: [],
        feeds: [],
        nugetConfigPaths: [],
        quotaMessages: [],
        requestedCount: 2,
        restoredCount: 2,
        restoredPackages: [],
        submissionsStarted: 0,
        uploadedCount: undefined,
        uploadsAttempted: 0,
        writeDeniedPackages: [],
        zeroCacheSubmissions: 0,
      },
      liveProbes: liveProbes(),
      requestedCount: 2,
      restoreProbe: restoreProbe("ok", "restored 2/2 packages", 2),
      tokenKind: "github",
    });

    expect(diagnosis.cacheStatus).toBe("warm-hit");
    expect(diagnosis.failureKind).toBe("");
    expect(diagnosis.diagnosis).toContain("restore 2/2");
  });

  test("classifies zero-cache submissions as upload failures", () => {
    const diagnosis = classifyCache({
      buildLogFacts: {
        authMessages: ["Response status code: 403 Forbidden"],
        builtCount: 10,
        builtPackages: [],
        failedHttpStatuses: ["403"],
        feeds: [],
        nugetConfigPaths: [],
        quotaMessages: [],
        requestedCount: 59,
        restoredCount: 49,
        restoredPackages: [],
        submissionsStarted: 10,
        uploadedCount: undefined,
        uploadsAttempted: 10,
        writeDeniedPackages: [],
        zeroCacheSubmissions: 10,
      },
      liveProbes: liveProbes(),
      requestedCount: 59,
      restoreProbe: restoreProbe(
        "failed",
        "NuGet restore failed; restored 49/59 packages",
        49,
      ),
      tokenKind: "github",
    });

    expect(diagnosis.cacheStatus).toBe("upload-failure");
    expect(diagnosis.failureKind).toBe("upload-failure");
    expect(shouldFailDiagnosis(diagnosis, "upload-failure")).toBe(true);
  });

  test("classifies exact restore health without a build log", () => {
    const diagnosis = classifyCache({
      liveProbes: liveProbes(),
      requestedCount: 3,
      restoreProbe: restoreProbe("ok", "restored 3/3 packages", 3),
      tokenKind: "pat",
    });

    expect(diagnosis.cacheStatus).toBe("restore-healthy");
    expect(diagnosis.failureKind).toBe("");
    expect(diagnosis.diagnosis).toContain("build log absent");
  });

  test("classifies exact restore misses", () => {
    const diagnosis = classifyCache({
      liveProbes: liveProbes(),
      requestedCount: 3,
      restoreProbe: restoreProbe(
        "failed",
        "NuGet restore failed; restored 0/3 packages",
        0,
      ),
      tokenKind: "github",
    });

    expect(diagnosis.cacheStatus).toBe("restore-miss");
    expect(diagnosis.failureKind).toBe("cache-miss");
    expect(shouldFailDiagnosis(diagnosis, "cache-miss")).toBe(true);
  });

  test("classifies feed authentication failures", () => {
    const diagnosis = classifyCache({
      liveProbes: liveProbes(probe("failed", "HTTP 403 Forbidden")),
      requestedCount: 1,
      restoreProbe: restoreProbe("skipped", "NuGet command unavailable"),
      tokenKind: "github",
    });

    expect(diagnosis.cacheStatus).toBe("auth-failure");
    expect(diagnosis.failureKind).toBe("auth");
    expect(shouldFailDiagnosis(diagnosis, "auth")).toBe(true);
  });

  test("classifies quota failures before cache misses", () => {
    const diagnosis = classifyCache({
      liveProbes: liveProbes(),
      requestedCount: 1,
      restoreProbe: restoreProbe(
        "failed",
        "NuGet restore failed",
        0,
        "Account has reached its billing limit.",
      ),
      tokenKind: "github",
    });

    expect(diagnosis.cacheStatus).toBe("quota-failure");
    expect(diagnosis.failureKind).toBe("quota");
  });

  test("rejects unsupported fail-on policies", () => {
    expect(normalizeFailOnPolicy("cache-miss")).toBe("cache-miss");
    expect(() => normalizeFailOnPolicy("tooling")).toThrow(
      "Unsupported fail-on policy: tooling",
    );
  });
});
