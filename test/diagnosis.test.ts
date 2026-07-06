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
import { PackageMetadataProbe } from "../src/shared/package-metadata";
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

function packageMetadata(): PackageMetadataProbe {
  return {
    limit: 20,
    owner: "octo",
    probedPackageIds: 1,
    requestedPackageIds: 1,
    results: [
      {
        detail: "HTTP 200 OK",
        endpoint: "users",
        name: "fmt",
        quotaRisk: "private package storage",
        status: "ok",
        visibility: "private",
      },
    ],
  };
}

function packageVersionMetadata(): PackageMetadataProbe {
  return {
    limit: 20,
    owner: "octo",
    probedPackageIds: 1,
    requestedPackageIds: 1,
    results: [
      {
        detail: "HTTP 200 OK",
        name: "zlib_x64-linux",
        status: "ok",
        versionNames: [
          "1.3.1-vcpkg0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        ],
      },
    ],
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
        packageAbiHashes: [],
        packageHandleTimes: [],
        packageUploadStatuses: [],
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

  test("trusts a warm build log over an exact restore TLS failure", () => {
    const diagnosis = classifyCache({
      buildLogFacts: {
        authMessages: [],
        builtCount: undefined,
        builtPackages: [],
        failedHttpStatuses: [],
        feeds: [],
        nugetConfigPaths: [],
        packageAbiHashes: [],
        packageHandleTimes: [],
        packageUploadStatuses: [],
        quotaMessages: [],
        requestedCount: 4,
        restoredCount: 4,
        restoredPackages: [],
        submissionsStarted: 0,
        uploadedCount: undefined,
        uploadsAttempted: 0,
        writeDeniedPackages: [],
        zeroCacheSubmissions: 0,
      },
      liveProbes: liveProbes(),
      requestedCount: 4,
      restoreProbe: restoreProbe(
        "failed",
        "NuGet restore failed; restored 0/4 packages",
        0,
        "Authentication failed; CERTIFICATE_VERIFY_FAILED",
      ),
      tokenKind: "github",
    });

    expect(diagnosis.cacheStatus).toBe("warm-hit");
    expect(diagnosis.failureKind).toBe("");
    expect(diagnosis.diagnosis).toContain("restore 4/4");
  });

  test("trusts a warm build log over host-side tooling failures", () => {
    const diagnosis = classifyCache({
      buildLogFacts: {
        authMessages: [],
        builtCount: undefined,
        builtPackages: [],
        failedHttpStatuses: [],
        feeds: [],
        nugetConfigPaths: [],
        packageAbiHashes: [],
        packageHandleTimes: [],
        packageUploadStatuses: [],
        quotaMessages: [],
        requestedCount: 59,
        restoredCount: 59,
        restoredPackages: [],
        submissionsStarted: 0,
        uploadedCount: undefined,
        uploadsAttempted: 0,
        writeDeniedPackages: [],
        zeroCacheSubmissions: 0,
      },
      liveProbes: {
        ...liveProbes(),
        nugetSources: probe("skipped", "NuGet command unavailable"),
        nugetVersion: probe("skipped", "NuGet command unavailable"),
        vcpkgNuget: probe("failed", "Exec format error"),
        vcpkgVersion: probe("failed", "Exec format error"),
      },
      requestedCount: 59,
      restoreProbe: restoreProbe("skipped", "NuGet command unavailable"),
      tokenKind: "github",
    });

    expect(diagnosis.cacheStatus).toBe("warm-hit");
    expect(diagnosis.failureKind).toBe("");
    expect(diagnosis.diagnosis).toContain("restore 59/59");
  });

  test("trusts a completed vcpkg install when request count is unknown", () => {
    const diagnosis = classifyCache({
      buildLogFacts: {
        authMessages: [],
        builtCount: undefined,
        builtPackages: [],
        failedHttpStatuses: [],
        feeds: [],
        nugetConfigPaths: [],
        packageAbiHashes: [],
        packageHandleTimes: [],
        packageUploadStatuses: [],
        quotaMessages: [],
        requestedCount: undefined,
        restoredCount: 59,
        restoredPackages: [],
        submissionsStarted: 0,
        uploadedCount: undefined,
        uploadsAttempted: 0,
        vcpkgInstallSucceeded: true,
        writeDeniedPackages: [],
        zeroCacheSubmissions: 0,
      },
      liveProbes: {
        ...liveProbes(),
        nugetSources: probe("skipped", "NuGet command unavailable"),
        nugetVersion: probe("skipped", "NuGet command unavailable"),
        vcpkgNuget: probe("failed", "Exec format error"),
        vcpkgVersion: probe("failed", "Exec format error"),
      },
      requestedCount: 0,
      restoreProbe: restoreProbe("skipped", "NuGet command unavailable"),
      tokenKind: "github",
    });

    expect(diagnosis.cacheStatus).toBe("warm-hit");
    expect(diagnosis.failureKind).toBe("");
    expect(diagnosis.diagnosis).toContain("restore 59");
    expect(diagnosis.diagnosis).toContain("vcpkg install succeeded");
  });

  test("trusts a completed vcpkg install when restore count is unknown", () => {
    const diagnosis = classifyCache({
      buildLogFacts: {
        authMessages: [],
        builtCount: undefined,
        builtPackages: [],
        failedHttpStatuses: [],
        feeds: [],
        nugetConfigPaths: [],
        packageAbiHashes: [],
        packageHandleTimes: [],
        packageUploadStatuses: [],
        quotaMessages: [],
        requestedCount: 59,
        restoredCount: undefined,
        restoredPackages: [],
        submissionsStarted: 0,
        uploadedCount: undefined,
        uploadsAttempted: 0,
        vcpkgInstallSucceeded: true,
        writeDeniedPackages: [],
        zeroCacheSubmissions: 0,
      },
      liveProbes: {
        ...liveProbes(),
        nugetSources: probe("skipped", "NuGet command unavailable"),
        nugetVersion: probe("skipped", "NuGet command unavailable"),
        vcpkgNuget: probe("failed", "Exec format error"),
        vcpkgVersion: probe("failed", "Exec format error"),
      },
      requestedCount: 59,
      restoreProbe: restoreProbe("skipped", "NuGet command unavailable"),
      tokenKind: "github",
    });

    expect(diagnosis.cacheStatus).toBe("warm-hit");
    expect(diagnosis.failureKind).toBe("");
    expect(diagnosis.diagnosis).toContain("restore unknown/59");
    expect(diagnosis.diagnosis).toContain("vcpkg install succeeded");
  });

  test("reports missing bootstrap dependencies before host probe failures", () => {
    const diagnosis = classifyCache({
      buildLogFacts: {
        authMessages: [],
        builtCount: undefined,
        builtPackages: [],
        failedHttpStatuses: [],
        feeds: [],
        missingSystemDependencies: [
          {
            evidence:
              "Could not find tar. Please install it (and other dependencies) with:",
            neededBy: "vcpkg bootstrap",
            suggestedPackage: "tar",
            tool: "tar",
          },
        ],
        nugetConfigPaths: [],
        packageAbiHashes: [],
        packageHandleTimes: [],
        packageUploadStatuses: [],
        quotaMessages: [],
        requestedCount: undefined,
        restoredCount: undefined,
        restoredPackages: [],
        submissionsStarted: 0,
        uploadedCount: undefined,
        uploadsAttempted: 0,
        writeDeniedPackages: [],
        zeroCacheSubmissions: 0,
      },
      liveProbes: {
        ...liveProbes(),
        nugetSources: probe("skipped", "NuGet command unavailable"),
        nugetVersion: probe("skipped", "NuGet command unavailable"),
        vcpkgNuget: probe("failed", "Exec format error"),
        vcpkgVersion: probe("failed", "Exec format error"),
      },
      requestedCount: 0,
      restoreProbe: restoreProbe("skipped", "NuGet command unavailable"),
      tokenKind: "github",
    });

    expect(diagnosis.cacheStatus).toBe("tooling-failure");
    expect(diagnosis.failureKind).toBe("tooling-failure");
    expect(diagnosis.diagnosis).toContain("missing system dependencies 1");
  });

  test("keeps partial hit status when only misses fail to upload", () => {
    const diagnosis = classifyCache({
      buildLogFacts: {
        authMessages: ["Response status code: 403 Forbidden"],
        builtCount: 10,
        builtPackages: [],
        failedHttpStatuses: ["403"],
        feeds: [],
        nugetConfigPaths: [],
        packageAbiHashes: [],
        packageHandleTimes: [],
        packageUploadStatuses: [],
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

    expect(diagnosis.cacheStatus).toBe("partial-hit");
    expect(diagnosis.failureKind).toBe("upload-failure");
    expect(diagnosis.diagnosis).toContain("upload failure 0/10");
    expect(shouldFailDiagnosis(diagnosis, "upload-failure")).toBe(true);
  });

  test("treats failed uploads as already present when the version exists", () => {
    const diagnosis = classifyCache({
      buildLogFacts: {
        authMessages: [],
        builtCount: 1,
        builtPackages: ["zlib:x64-linux@1.3.1"],
        failedHttpStatuses: [],
        feeds: [],
        nugetConfigPaths: [],
        packageAbiHashes: [
          {
            abiHash:
              "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            packageId: "zlib_x64-linux",
            packageSpec: "zlib:x64-linux",
          },
        ],
        packageHandleTimes: [],
        packageUploadStatuses: [
          {
            packageId: "zlib_x64-linux",
            packageSpec: "zlib:x64-linux",
            status: "failed",
          },
        ],
        quotaMessages: [],
        requestedCount: 2,
        restoredCount: 1,
        restoredPackages: [],
        submissionsStarted: 1,
        uploadedCount: undefined,
        uploadsAttempted: 1,
        writeDeniedPackages: [],
        zeroCacheSubmissions: 1,
      },
      liveProbes: liveProbes(),
      packageMetadata: packageVersionMetadata(),
      requestedCount: 2,
      restoreProbe: restoreProbe(
        "failed",
        "NuGet restore failed; restored 1/2 packages",
        1,
      ),
      tokenKind: "github",
    });

    expect(diagnosis.cacheStatus).toBe("partial-hit");
    expect(diagnosis.failureKind).toBe("cache-miss");
    expect(diagnosis.diagnosis).toContain("already present 1");
    expect(diagnosis.diagnosis).not.toContain("upload failure");
  });

  test("classifies cold zero-cache submissions as upload failures", () => {
    const diagnosis = classifyCache({
      buildLogFacts: {
        authMessages: ["Response status code: 403 Forbidden"],
        builtCount: 10,
        builtPackages: [],
        failedHttpStatuses: ["403"],
        feeds: [],
        nugetConfigPaths: [],
        packageAbiHashes: [],
        packageHandleTimes: [],
        packageUploadStatuses: [],
        quotaMessages: [],
        requestedCount: 10,
        restoredCount: 0,
        restoredPackages: [],
        submissionsStarted: 10,
        uploadedCount: undefined,
        uploadsAttempted: 10,
        writeDeniedPackages: [],
        zeroCacheSubmissions: 10,
      },
      liveProbes: liveProbes(),
      requestedCount: 10,
      restoreProbe: restoreProbe(
        "failed",
        "NuGet restore failed; restored 0/10 packages",
        0,
      ),
      tokenKind: "github",
    });

    expect(diagnosis.cacheStatus).toBe("upload-failure");
    expect(diagnosis.failureKind).toBe("upload-failure");
    expect(diagnosis.diagnosis).toContain("upload failure 0/10");
    expect(shouldFailDiagnosis(diagnosis, "upload-failure")).toBe(true);
  });

  test("classifies cold already-present uploads as a cache seed", () => {
    const diagnosis = classifyCache({
      buildLogFacts: {
        authMessages: [],
        builtCount: 3,
        builtPackages: [],
        failedHttpStatuses: [],
        feeds: [],
        nugetConfigPaths: [],
        packageAbiHashes: [],
        packageHandleTimes: [],
        packageUploadStatuses: [
          {
            packageId: "fmt_x64-windows-vcpkg-github-cache",
            packageSpec: "fmt:x64-windows-vcpkg-github-cache@12.1.0",
            status: "already present",
          },
        ],
        quotaMessages: [],
        requestedCount: 3,
        restoredCount: 0,
        restoredPackages: [],
        submissionsStarted: 3,
        uploadedCount: undefined,
        uploadsAttempted: 3,
        writeDeniedPackages: [],
        zeroCacheSubmissions: 3,
      },
      liveProbes: liveProbes(),
      requestedCount: 3,
      restoreProbe: restoreProbe(
        "failed",
        "NuGet restore failed; restored 0/3 packages",
        0,
      ),
      tokenKind: "github",
    });

    expect(diagnosis.cacheStatus).toBe("cold-seed");
    expect(diagnosis.failureKind).toBe("cache-miss");
    expect(diagnosis.diagnosis).toContain("already present 1");
    expect(diagnosis.diagnosis).not.toContain("upload failure");
  });

  test("classifies BSD vcpkg tool publish failures as upload failures", () => {
    const diagnosis = classifyCache({
      buildLogFacts: {
        authMessages: [
          "WARNING: Your request could not be authenticated by the GitHub Packages service.",
        ],
        builtCount: 3,
        builtPackages: [],
        failedHttpStatuses: ["403"],
        feeds: [],
        nugetConfigPaths: [],
        packageAbiHashes: [],
        packageHandleTimes: [],
        packageUploadStatuses: [
          {
            packageId: "fmt_x64-freebsd-vcpkg-github-cache",
            packageSpec: "fmt:x64-freebsd-vcpkg-github-cache@12.2.0",
            status: "already present",
          },
        ],
        quotaMessages: [],
        requestedCount: 3,
        restoredCount: 0,
        restoredPackages: [],
        submissionsStarted: 1,
        uploadedCount: undefined,
        uploadsAttempted: 1,
        vcpkgTool: {
          packageId: "vcpkg-tool_freebsd-octo-repo-x64",
          publishStatus: "failed",
          status: "built-from-source",
          version: "1.0.0-vcpkgtoolabcdef0123456789",
        },
        writeDeniedPackages: [],
        zeroCacheSubmissions: 1,
      },
      liveProbes: liveProbes(),
      requestedCount: 3,
      restoreProbe: restoreProbe(
        "failed",
        "NuGet restore failed; restored 0/3 packages",
        0,
      ),
      tokenKind: "github",
    });

    expect(diagnosis.cacheStatus).toBe("upload-failure");
    expect(diagnosis.failureKind).toBe("upload-failure");
    expect(diagnosis.diagnosis).toContain("vcpkg tool package publish failed");
    expect(diagnosis.diagnosis).toContain("vcpkg-tool_freebsd-octo-repo-x64");
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

  test("reports private package quota risk when cache is otherwise healthy", () => {
    const diagnosis = classifyCache({
      liveProbes: liveProbes(),
      packageMetadata: packageMetadata(),
      requestedCount: 3,
      restoreProbe: restoreProbe("ok", "restored 3/3 packages", 3),
      tokenKind: "pat",
    });

    expect(diagnosis.cacheStatus).toBe("restore-healthy");
    expect(diagnosis.failureKind).toBe("private-package");
    expect(diagnosis.diagnosis).toContain("private package quota risk 1");
    expect(shouldFailDiagnosis(diagnosis, "private-package")).toBe(true);
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
