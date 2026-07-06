/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { AnalyzerLiveProbes, ProbeResult } from "./analyze-probes";
import { BuildLogFacts } from "./build-log";
import { TokenKind } from "./inputs";
import {
  packageMetadataQuotaRiskCount,
  PackageMetadataProbe,
  PackageMetadataResult,
  packageVersionExists,
} from "./package-metadata";
import { RestoreProbe } from "./restore-probe";

export type CacheStatus =
  | "auth-failure"
  | "cache-disabled"
  | "cold-seed"
  | "partial-hit"
  | "quota-failure"
  | "restore-healthy"
  | "restore-miss"
  | "tooling-failure"
  | "unknown"
  | "upload-failure"
  | "warm-hit";

export type FailureKind =
  | ""
  | "auth"
  | "cache-miss"
  | "private-package"
  | "quota"
  | "restore-failure"
  | "tooling-failure"
  | "upload-failure";

export type FailOnPolicy =
  | "auth"
  | "cache-miss"
  | "never"
  | "private-package"
  | "quota"
  | "restore-failure"
  | "upload-failure";

export interface CacheDiagnosis {
  readonly cacheStatus: CacheStatus;
  readonly diagnosis: string;
  readonly failureKind: FailureKind;
}

export interface CacheDiagnosisInput {
  readonly buildLogFacts?: BuildLogFacts;
  readonly liveProbes: AnalyzerLiveProbes;
  readonly packageMetadata?: PackageMetadataProbe;
  readonly requestedCount: number;
  readonly restoreProbe: RestoreProbe;
  readonly tokenKind: TokenKind;
}

const FAIL_ON_POLICIES: ReadonlySet<string> = new Set([
  "auth",
  "cache-miss",
  "never",
  "private-package",
  "quota",
  "restore-failure",
  "upload-failure",
]);

function failed(result: ProbeResult): boolean {
  return result.status === "failed";
}

function skipped(result: ProbeResult): boolean {
  return result.status === "skipped";
}

function count(value: number | undefined): number {
  return value ?? 0;
}

function detail(output: readonly string[]): string {
  return output.filter((value) => value.length > 0).join("; ");
}

function statusDetail(status: CacheStatus): string {
  return status.replaceAll("-", " ");
}

function tokenDetail(tokenKind: TokenKind): string {
  return tokenKind === "github" ? "GITHUB_TOKEN" : "PAT";
}

function httpAuthFailure(result: ProbeResult): boolean {
  return (
    failed(result) &&
    /\b(?:401|403|Unauthorized|Forbidden)\b/i.test(result.detail)
  );
}

function textAuthFailure(value: string | undefined): boolean {
  return /\b(?:401|403|Unauthorized|Forbidden|authentication failed|access denied)\b/i.test(
    value ?? "",
  );
}

function textQuotaFailure(value: string | undefined): boolean {
  return /(?:billing limit|quota|twirp error permission_denied|permission_denied)/i.test(
    value ?? "",
  );
}

function successfulUploads(buildLogFacts: BuildLogFacts | undefined): number {
  return count(buildLogFacts?.uploadedCount);
}

function packageMetadataResults(
  packageMetadata: PackageMetadataProbe | undefined,
): ReadonlyMap<string, PackageMetadataResult> {
  return new Map(
    (packageMetadata?.results ?? []).map((value) => [value.name, value]),
  );
}

function packageAbiHashes(
  buildLogFacts: BuildLogFacts | undefined,
): ReadonlyMap<string, string> {
  return new Map(
    (buildLogFacts?.packageAbiHashes ?? []).map((value) => [
      value.packageId,
      value.abiHash,
    ]),
  );
}

function packageAlreadyPresent(
  packageId: string,
  buildLogFacts: BuildLogFacts | undefined,
  packageMetadata: PackageMetadataProbe | undefined,
): boolean {
  return packageVersionExists(
    packageMetadataResults(packageMetadata).get(packageId),
    packageAbiHashes(buildLogFacts).get(packageId),
  );
}

function alreadyPresentUploads(
  buildLogFacts: BuildLogFacts | undefined,
  packageMetadata: PackageMetadataProbe | undefined,
): number {
  return (buildLogFacts?.packageUploadStatuses ?? []).filter(
    (value) =>
      value.status === "already present" ||
      (value.status === "failed" &&
        packageAlreadyPresent(value.packageId, buildLogFacts, packageMetadata)),
  ).length;
}

function failedUploads(
  buildLogFacts: BuildLogFacts | undefined,
  packageMetadata: PackageMetadataProbe | undefined,
): number {
  return (buildLogFacts?.packageUploadStatuses ?? []).filter(
    (value) =>
      value.status === "failed" &&
      !packageAlreadyPresent(value.packageId, buildLogFacts, packageMetadata),
  ).length;
}

function uploadFailure(input: CacheDiagnosisInput): boolean {
  const buildLogFacts = input.buildLogFacts;

  if (!buildLogFacts) {
    return false;
  }

  if (buildLogFacts.packageUploadStatuses.length) {
    return failedUploads(buildLogFacts, input.packageMetadata) > 0;
  }

  const uploads = successfulUploads(buildLogFacts);

  return (
    buildLogFacts.zeroCacheSubmissions > 0 ||
    (buildLogFacts.uploadsAttempted > 0 &&
      uploads < buildLogFacts.uploadsAttempted)
  );
}

function uploadFailureEvidence(
  buildLogFacts: BuildLogFacts | undefined,
  packageMetadata: PackageMetadataProbe | undefined,
  uploadedCount: number,
): string[] {
  const alreadyPresent = alreadyPresentUploads(buildLogFacts, packageMetadata);

  return [
    `upload failure ${uploadedCount}/${buildLogFacts?.uploadsAttempted ?? 0}`,
    alreadyPresent ? `already present ${alreadyPresent}` : "",
    `zero-cache submissions ${buildLogFacts?.zeroCacheSubmissions ?? 0}`,
    buildLogFacts?.authMessages.length
      ? `auth messages ${buildLogFacts.authMessages.length}`
      : "",
  ];
}

function vcpkgToolUploadFailureEvidence(
  buildLogFacts: BuildLogFacts,
): string[] {
  const tool = buildLogFacts.vcpkgTool;

  return [
    "vcpkg tool package publish failed",
    tool?.packageId ? `vcpkg tool package ${tool.packageId}` : "",
    tool?.version ? `vcpkg tool version ${tool.version}` : "",
    buildLogFacts.authMessages.length
      ? `auth messages ${buildLogFacts.authMessages.length}`
      : "",
  ];
}

function cacheDisabled(buildLogFacts: BuildLogFacts | undefined): boolean {
  if (!buildLogFacts) {
    return false;
  }

  return (
    count(buildLogFacts.builtCount) > 0 &&
    count(buildLogFacts.restoredCount) === 0 &&
    buildLogFacts.submissionsStarted === 0 &&
    buildLogFacts.uploadsAttempted === 0
  );
}

function effectiveRequestedCount(input: CacheDiagnosisInput): number {
  return input.requestedCount || count(input.buildLogFacts?.requestedCount);
}

function effectiveRestoredCount(input: CacheDiagnosisInput): number {
  return count(
    input.buildLogFacts?.restoredCount ?? input.restoreProbe.restoredCount,
  );
}

function restoreEvidence(
  restoredCount: number | undefined,
  requestedCount: number,
): string {
  if (requestedCount > 0) {
    return `restore ${restoredCount ?? "unknown"}/${requestedCount}`;
  }

  if (count(restoredCount) > 0) {
    return `restore ${restoredCount}`;
  }

  return "";
}

function classifyBuildLog(input: CacheDiagnosisInput): CacheDiagnosis {
  const requestedCount = effectiveRequestedCount(input);
  const restoredCountValue =
    input.buildLogFacts?.restoredCount ?? input.restoreProbe.restoredCount;
  const restoredCount = effectiveRestoredCount(input);
  const builtCount = count(input.buildLogFacts?.builtCount);
  const installSucceeded = input.buildLogFacts?.vcpkgInstallSucceeded === true;
  const uploadedCount = successfulUploads(input.buildLogFacts);
  const alreadyPresent = alreadyPresentUploads(
    input.buildLogFacts,
    input.packageMetadata,
  );
  const failedUploads = uploadFailure(input);
  const baseEvidence = [
    `token path ${tokenDetail(input.tokenKind)}`,
    restoreEvidence(restoredCountValue, requestedCount),
    builtCount > 0 ? `build misses ${builtCount}` : "build misses 0",
  ];

  if (input.buildLogFacts?.quotaMessages.length) {
    return result("quota-failure", "quota", [
      ...baseEvidence,
      `quota messages ${input.buildLogFacts.quotaMessages.length}`,
    ]);
  }

  if (input.buildLogFacts?.vcpkgTool?.publishStatus === "failed") {
    return result("upload-failure", "upload-failure", [
      ...baseEvidence,
      ...vcpkgToolUploadFailureEvidence(input.buildLogFacts),
    ]);
  }

  if (!failedUploads && input.buildLogFacts?.authMessages.length) {
    return result("auth-failure", "auth", [
      ...baseEvidence,
      `auth messages ${input.buildLogFacts.authMessages.length}`,
    ]);
  }

  if (input.buildLogFacts?.missingSystemDependencies?.length) {
    return result("tooling-failure", "tooling-failure", [
      ...baseEvidence,
      `missing system dependencies ${input.buildLogFacts.missingSystemDependencies.length}`,
    ]);
  }

  if (cacheDisabled(input.buildLogFacts)) {
    return result("cache-disabled", "cache-miss", baseEvidence);
  }

  if (
    requestedCount > 0 &&
    restoredCount >= requestedCount &&
    builtCount === 0
  ) {
    return result("warm-hit", "", baseEvidence);
  }

  if (
    (requestedCount > 0 || restoredCount > 0) &&
    builtCount === 0 &&
    installSucceeded
  ) {
    return result("warm-hit", "", [...baseEvidence, "vcpkg install succeeded"]);
  }

  if (restoredCount > 0 && builtCount > 0) {
    if (failedUploads) {
      return result("partial-hit", "upload-failure", [
        ...baseEvidence,
        ...uploadFailureEvidence(
          input.buildLogFacts,
          input.packageMetadata,
          uploadedCount,
        ),
      ]);
    }

    return result("partial-hit", "cache-miss", [
      ...baseEvidence,
      uploadedCount > 0 ? `upload ${uploadedCount}` : "upload unknown",
      alreadyPresent ? `already present ${alreadyPresent}` : "",
    ]);
  }

  if (requestedCount > 0 && restoredCount === 0 && builtCount > 0) {
    if (failedUploads) {
      return result("upload-failure", "upload-failure", [
        ...baseEvidence,
        ...uploadFailureEvidence(
          input.buildLogFacts,
          input.packageMetadata,
          uploadedCount,
        ),
      ]);
    }

    if (uploadedCount > 0 || alreadyPresent > 0) {
      return result("cold-seed", "cache-miss", [
        ...baseEvidence,
        `upload ${uploadedCount}`,
        alreadyPresent ? `already present ${alreadyPresent}` : "",
      ]);
    }

    return result("cache-disabled", "cache-miss", baseEvidence);
  }

  if (failedUploads) {
    return result("upload-failure", "upload-failure", [
      ...baseEvidence,
      ...uploadFailureEvidence(
        input.buildLogFacts,
        input.packageMetadata,
        uploadedCount,
      ),
    ]);
  }

  return result("unknown", "", baseEvidence);
}

function classifyWithoutBuildLog(input: CacheDiagnosisInput): CacheDiagnosis {
  const requestedCount = effectiveRequestedCount(input);
  const restoredCount = effectiveRestoredCount(input);
  const baseEvidence = [
    `token path ${tokenDetail(input.tokenKind)}`,
    requestedCount > 0
      ? `exact restore ${restoredCount}/${requestedCount}`
      : "",
    "build log absent",
  ];

  if (input.restoreProbe.result.status === "ok") {
    return result("restore-healthy", "", baseEvidence);
  }

  if (requestedCount > 0 && restoredCount < requestedCount) {
    return result("restore-miss", "cache-miss", baseEvidence);
  }

  if (failed(input.restoreProbe.result)) {
    return result("restore-miss", "restore-failure", [
      ...baseEvidence,
      input.restoreProbe.result.detail,
    ]);
  }

  return result("unknown", "", baseEvidence);
}

function result(
  cacheStatus: CacheStatus,
  failureKind: FailureKind,
  evidence: readonly string[],
): CacheDiagnosis {
  return {
    cacheStatus,
    diagnosis: `Cache status: ${statusDetail(cacheStatus)}; ${detail(
      evidence,
    )}`,
    failureKind,
  };
}

function withPackageQuotaRisk(
  diagnosis: CacheDiagnosis,
  input: CacheDiagnosisInput,
): CacheDiagnosis {
  const quotaRiskCount = packageMetadataQuotaRiskCount(input.packageMetadata);

  if (diagnosis.failureKind || quotaRiskCount === 0) {
    return diagnosis;
  }

  return {
    cacheStatus: diagnosis.cacheStatus,
    diagnosis: `${diagnosis.diagnosis}; private package quota risk ${quotaRiskCount}`,
    failureKind: "private-package",
  };
}

export function normalizeFailOnPolicy(value: string): FailOnPolicy {
  const normalized = value.trim().toLowerCase();

  if (FAIL_ON_POLICIES.has(normalized)) {
    return normalized as FailOnPolicy;
  }

  throw new Error(`Unsupported fail-on policy: ${value}`);
}

export function shouldFailDiagnosis(
  diagnosis: CacheDiagnosis,
  policy: FailOnPolicy,
): boolean {
  return policy !== "never" && diagnosis.failureKind === policy;
}

export function classifyCache(input: CacheDiagnosisInput): CacheDiagnosis {
  if (input.buildLogFacts) {
    const diagnosis = withPackageQuotaRisk(classifyBuildLog(input), input);

    if (diagnosis.cacheStatus !== "unknown") {
      return diagnosis;
    }
  }

  if (
    input.liveProbes.vcpkgVersion.status === "failed" ||
    input.liveProbes.vcpkgNuget.status === "failed" ||
    input.liveProbes.nugetVersion.status === "failed" ||
    skipped(input.liveProbes.vcpkgNuget) ||
    skipped(input.liveProbes.nugetVersion)
  ) {
    return result("tooling-failure", "tooling-failure", [
      `token path ${tokenDetail(input.tokenKind)}`,
      `vcpkg ${input.liveProbes.vcpkgVersion.status}`,
      `NuGet ${input.liveProbes.nugetVersion.status}`,
    ]);
  }

  if (httpAuthFailure(input.liveProbes.feedBasicAuth)) {
    return result("auth-failure", "auth", [
      `token path ${tokenDetail(input.tokenKind)}`,
      `feed basic auth ${input.liveProbes.feedBasicAuth.detail}`,
    ]);
  }

  if (
    textQuotaFailure(input.restoreProbe.result.output) ||
    textQuotaFailure(input.restoreProbe.result.detail)
  ) {
    return result("quota-failure", "quota", [
      `token path ${tokenDetail(input.tokenKind)}`,
      input.restoreProbe.result.detail,
    ]);
  }

  if (
    textAuthFailure(input.restoreProbe.result.output) ||
    textAuthFailure(input.restoreProbe.result.detail)
  ) {
    return result("auth-failure", "auth", [
      `token path ${tokenDetail(input.tokenKind)}`,
      `feed basic auth ${input.liveProbes.feedBasicAuth.detail}`,
      input.restoreProbe.result.detail,
    ]);
  }

  return withPackageQuotaRisk(classifyWithoutBuildLog(input), input);
}
