/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

export interface BuildLogFacts {
  readonly authMessages: readonly string[];
  readonly builtCount?: number;
  readonly builtPackages: readonly string[];
  readonly failedHttpStatuses: readonly string[];
  readonly feeds: readonly string[];
  readonly missingSystemDependencies?: readonly MissingSystemDependency[];
  readonly nugetConfigPaths: readonly string[];
  readonly packageAbiHashes: readonly PackageAbiHash[];
  readonly packageHandleTimes: readonly PackageHandleTime[];
  readonly packageUploadStatuses: readonly PackageUploadStatus[];
  readonly quotaMessages: readonly string[];
  readonly requestedCount?: number;
  readonly restoredCount?: number;
  readonly restoredPackages: readonly string[];
  readonly submissionsStarted: number;
  readonly uploadedCount?: number;
  readonly uploadsAttempted: number;
  readonly writeDeniedPackages: readonly WriteDeniedPackage[];
  readonly zeroCacheSubmissions: number;
}

export interface WriteDeniedPackage {
  readonly packageId: string;
  readonly version: string;
}

export interface PackageHandleTime {
  readonly elapsed: string;
  readonly packageId: string;
  readonly packageSpec: string;
}

export interface PackageAbiHash {
  readonly abiHash: string;
  readonly packageId: string;
  readonly packageSpec: string;
}

export type PackageUploadState =
  | "already present"
  | "failed"
  | "succeeded"
  | "unknown";

export interface PackageUploadStatus {
  readonly packageId: string;
  readonly packageSpec: string;
  readonly status: PackageUploadState;
}

export interface MissingSystemDependency {
  readonly evidence: string;
  readonly neededBy: string;
  readonly suggestedPackage: string;
  readonly tool: string;
}

const ANSI_PATTERN = new RegExp(`${String.fromCharCode(0x1b)}\\[[0-9;]*m`, "g");
const GITHUB_LOG_PREFIX_PATTERN =
  /^\ufeff?\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\s+/;
const VCPKG_PACKAGE_SPEC_PATTERN =
  /^[A-Za-z0-9_.+-]+:[A-Za-z0-9_.+-]+(?:@[^\s]+)?$/;
const VCPKG_NUGET_VERSION_PATTERN = /-vcpkg[0-9a-f]{64}$/i;
const URL_PATTERN = /https:\/\/[^\s"'<>]+/gi;

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

function parseCount(value: string): number {
  return Number.parseInt(value, 10);
}

function cleanLine(line: string): string {
  return line.replace(ANSI_PATTERN, "").replace(GITHUB_LOG_PREFIX_PATTERN, "");
}

function packageListLine(line: string): string | undefined {
  const trimmed = line.trim();
  const packageLine = trimmed.replace(/^\*\s+/, "");

  if (
    VCPKG_PACKAGE_SPEC_PATTERN.test(packageLine) &&
    packageLine.includes("@")
  ) {
    return packageLine;
  }

  return undefined;
}

function restoredCount(line: string): number | undefined {
  const match = /Restored\s+(\d+)\s+package\(s\)\s+from\s+NuGet/i.exec(line);

  return match ? parseCount(match[1]) : undefined;
}

function restoredPackage(line: string): string | undefined {
  const match = /Restored\s+NuGet package\s+(.+?)\.(?=\d)/i.exec(line);

  return match?.[1];
}

function builtPackage(line: string): string | undefined {
  if (/^Building\s+for:/i.test(line)) {
    return undefined;
  }

  const match = /^Building\s+(.+?)(?:\.\.\.)?$/.exec(line.trim());

  if (!match || !VCPKG_PACKAGE_SPEC_PATTERN.test(match[1])) {
    return undefined;
  }

  return match[1];
}

function startingSubmissionPackage(line: string): string | undefined {
  const match =
    /Starting submission of\s+(.+?)\s+to\s+\d+\s+binary cache\(s\)/i.exec(line);

  return match?.[1];
}

function uploadingPackage(line: string): string | undefined {
  const match = /Uploading binaries for\s+(.+?)\s+to\s+NuGet\b/i.exec(line);

  return match?.[1];
}

function completedSubmission(
  line: string,
): { cacheCount: number; packageSpec: string } | undefined {
  const match =
    /Completed submission of\s+(.+?)\s+to\s+(\d+)\s+binary cache\(s\)/i.exec(
      line,
    );

  return match
    ? { cacheCount: parseCount(match[2]), packageSpec: match[1] }
    : undefined;
}

function containsAuthFailure(line: string): boolean {
  return (
    /\b(?:Unauthorized|Forbidden|authentication failed|access denied)\b/i.test(
      line,
    ) || /\b(?:HTTP\s+|status(?:\s+code)?[^\d]{0,40})(?:401|403)\b/i.test(line)
  );
}

function containsQuotaFailure(line: string): boolean {
  return /(?:billing limit|quota|twirp error permission_denied|permission_denied)/i.test(
    line,
  );
}

function failedHttpStatus(line: string): string | undefined {
  const match =
    /\b(?:HTTP\s+|status(?:\s+code)?[^\d]{0,40})(401|403|429|500|502|503)\b/i.exec(
      line,
    );

  return match?.[1];
}

function nupkgFileStem(line: string): string | undefined {
  const match = /(?:^|[\\/"])([^\\/"\s]+\.nupkg)\b/i.exec(line);

  return match?.[1].slice(0, -".nupkg".length);
}

function writeDeniedPackage(line: string): WriteDeniedPackage | undefined {
  const stem = nupkgFileStem(line);

  if (!stem) {
    return undefined;
  }

  const versionMarker = stem.match(VCPKG_NUGET_VERSION_PATTERN);

  if (!versionMarker?.index) {
    return undefined;
  }

  const versionPrefix = stem.slice(0, versionMarker.index);
  const versionStart = versionPrefix.search(/\.\d/);

  if (versionStart < 0) {
    return undefined;
  }

  return {
    packageId: versionPrefix.slice(0, versionStart),
    version: `${versionPrefix.slice(versionStart + 1)}${versionMarker[0]}`,
  };
}

export function packageSpecToNugetPackageId(
  packageSpec: string,
): string | undefined {
  const match = /^([A-Za-z0-9_.+-]+):([A-Za-z0-9_.+-]+)(?:@[^\s]+)?$/.exec(
    packageSpec.trim(),
  );

  if (!match) {
    return undefined;
  }

  return `${match[1]}_${match[2]}`;
}

export function packageSpecVersion(packageSpec: string): string | undefined {
  const match = /^[A-Za-z0-9_.+-]+:[A-Za-z0-9_.+-]+@([^\s]+)$/.exec(
    packageSpec.trim(),
  );

  return match?.[1];
}

function packageHandleTime(line: string): PackageHandleTime | undefined {
  const match = /^Elapsed time to handle\s+(.+):\s+(.+)$/i.exec(line.trim());

  if (!match) {
    return undefined;
  }

  const packageSpec = match[1];
  const packageId = packageSpecToNugetPackageId(packageSpec);

  if (!packageId) {
    return undefined;
  }

  return {
    elapsed: match[2],
    packageId,
    packageSpec,
  };
}

function packageAbiHash(line: string): PackageAbiHash | undefined {
  const match = /^(.+?)\s+package ABI:\s+([0-9a-f]{64})$/i.exec(line.trim());

  if (!match) {
    return undefined;
  }

  const packageSpec = match[1];
  const packageId = packageSpecToNugetPackageId(packageSpec);

  if (!packageId) {
    return undefined;
  }

  return {
    abiHash: match[2].toLowerCase(),
    packageId,
    packageSpec,
  };
}

function suggestedPackage(tool: string): string {
  return tool.toLowerCase();
}

function missingSystemDependency(
  line: string,
  neededBy: string | undefined,
): MissingSystemDependency | undefined {
  const trimmed = line.trim();
  const vcpkgMake =
    /Could not find Z_VCPKG_MAKE\b.*names:\s+([A-Za-z0-9_.+-]+)/i.exec(trimmed);

  if (vcpkgMake) {
    const tool = vcpkgMake[1];

    return {
      evidence: trimmed,
      neededBy: neededBy ?? "project configure",
      suggestedPackage: suggestedPackage(tool),
      tool,
    };
  }

  const patchelf = /Could not find\s+(patchelf)\b/i.exec(trimmed);

  if (patchelf) {
    const tool = patchelf[1];

    return {
      evidence: trimmed,
      neededBy: neededBy ?? "project configure",
      suggestedPackage: suggestedPackage(tool),
      tool,
    };
  }

  const shell = /Couldn't locate preferred shell '([^']+)'/i.exec(trimmed);

  if (shell) {
    const tool = shell[1];

    return {
      evidence: trimmed,
      neededBy: "project configure",
      suggestedPackage: suggestedPackage(tool),
      tool,
    };
  }

  const cmakePackage =
    /Could NOT find\s+([A-Za-z0-9_.+-]+)\s+\(missing:\s+([A-Za-z0-9_.+-]+)_EXECUTABLE\)/i.exec(
      trimmed,
    );

  if (cmakePackage) {
    const tool = cmakePackage[1].toLowerCase();

    return {
      evidence: trimmed,
      neededBy: "project configure",
      suggestedPackage: suggestedPackage(tool),
      tool,
    };
  }

  return undefined;
}

function missingSystemDependencyKey(value: MissingSystemDependency): string {
  return `${value.tool}\n${value.neededBy}\n${value.evidence}`;
}

function uniqueMissingSystemDependencies(
  values: readonly MissingSystemDependency[],
): readonly MissingSystemDependency[] {
  const seen = new Set<string>();
  const output: MissingSystemDependency[] = [];

  for (const value of values) {
    const key = missingSystemDependencyKey(value);

    if (!seen.has(key)) {
      seen.add(key);
      output.push(value);
    }
  }

  return output;
}

function nugetConfigPath(line: string): string | undefined {
  const trimmed = line.trim();

  if (
    /NuGet\.Config$/i.test(trimmed) ||
    /NuGet[\\/][^\\/]+\.config$/i.test(trimmed)
  ) {
    return trimmed;
  }

  return undefined;
}

function writeDeniedPackageKey(value: WriteDeniedPackage): string {
  return `${value.packageId}\n${value.version}`;
}

function uniqueWriteDeniedPackages(
  values: readonly WriteDeniedPackage[],
): readonly WriteDeniedPackage[] {
  const seen = new Set<string>();
  const output: WriteDeniedPackage[] = [];

  for (const value of values) {
    const key = writeDeniedPackageKey(value);

    if (!seen.has(key)) {
      seen.add(key);
      output.push(value);
    }
  }

  return output;
}

function uniquePackageHandleTimes(
  values: readonly PackageHandleTime[],
): readonly PackageHandleTime[] {
  const seen = new Set<string>();
  const output: PackageHandleTime[] = [];

  for (const value of values) {
    if (!seen.has(value.packageId)) {
      seen.add(value.packageId);
      output.push(value);
    }
  }

  return output;
}

function uniquePackageAbiHashes(
  values: readonly PackageAbiHash[],
): readonly PackageAbiHash[] {
  const seen = new Set<string>();
  const output: PackageAbiHash[] = [];

  for (const value of values) {
    if (!seen.has(value.packageId)) {
      seen.add(value.packageId);
      output.push(value);
    }
  }

  return output;
}

const PACKAGE_UPLOAD_STATE_RANK: Readonly<Record<PackageUploadState, number>> =
  {
    "already present": 1,
    failed: 1,
    succeeded: 2,
    unknown: 0,
  };

function rememberPackageUploadStatus(
  statuses: Map<string, PackageUploadStatus>,
  packageSpec: string,
  status: PackageUploadState,
): void {
  const packageId = packageSpecToNugetPackageId(packageSpec);

  if (!packageId) {
    return;
  }

  const current = statuses.get(packageId);

  if (
    current &&
    PACKAGE_UPLOAD_STATE_RANK[current.status] >
      PACKAGE_UPLOAD_STATE_RANK[status]
  ) {
    return;
  }

  statuses.set(packageId, {
    packageId,
    packageSpec,
    status,
  });
}

export function parseBuildLog(content: string): BuildLogFacts {
  const packageListPackages: string[] = [];
  const restoredPackages: string[] = [];
  const builtPackages: string[] = [];
  const failedHttpStatuses: string[] = [];
  const authMessages: string[] = [];
  const quotaMessages: string[] = [];
  const feeds: string[] = [];
  const nugetConfigPaths: string[] = [];
  const packageAbiHashes: PackageAbiHash[] = [];
  const packageHandleTimes: PackageHandleTime[] = [];
  const packageUploadStatuses = new Map<string, PackageUploadStatus>();
  const missingSystemDependencies: MissingSystemDependency[] = [];
  const writeDeniedPackages: WriteDeniedPackage[] = [];
  let capturePackageList = false;
  let captureFeeds = false;
  let captureNugetConfigPaths = false;
  let failedUpload: WriteDeniedPackage | undefined;
  let currentBuildPackage: string | undefined;
  let parsedRestoredCount: number | undefined;
  let submissionsStarted = 0;
  let uploadsAttempted = 0;
  let uploadedCount = 0;
  let zeroCacheSubmissions = 0;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = cleanLine(rawLine);
    const trimmed = line.trim();

    if (trimmed === "The following packages will be built and installed:") {
      capturePackageList = true;
      continue;
    }

    if (capturePackageList) {
      const packageLine = packageListLine(line);

      if (packageLine) {
        packageListPackages.push(packageLine);
        continue;
      }

      if (trimmed === "" || /^Additional packages\b/i.test(trimmed)) {
        capturePackageList = false;
      }
    }

    if (/^Feeds used:/i.test(trimmed)) {
      captureFeeds = true;
      continue;
    }

    if (captureFeeds) {
      const urls = trimmed.match(URL_PATTERN);

      if (urls) {
        feeds.push(...urls);
        continue;
      }

      if (trimmed === "") {
        captureFeeds = false;
      }
    }

    if (/^NuGet Config files used:/i.test(trimmed)) {
      captureNugetConfigPaths = true;
      continue;
    }

    if (captureNugetConfigPaths) {
      const configPath = nugetConfigPath(line);

      if (configPath) {
        nugetConfigPaths.push(configPath);
        continue;
      }

      if (trimmed === "") {
        captureNugetConfigPaths = false;
      }
    }

    const count = restoredCount(line);

    if (count !== undefined) {
      parsedRestoredCount = count;
    }

    const restored = restoredPackage(line);

    if (restored) {
      restoredPackages.push(restored);
    }

    const built = builtPackage(line);

    if (built) {
      builtPackages.push(built);
      currentBuildPackage = built;
    }

    if (
      /^-- Running vcpkg install - done\b/i.test(trimmed) ||
      /^All requested installations completed successfully\b/i.test(trimmed) ||
      /^Executing workflow step\b/i.test(trimmed)
    ) {
      currentBuildPackage = undefined;
    }

    const startingSubmission = startingSubmissionPackage(line);

    if (startingSubmission) {
      submissionsStarted += 1;
      rememberPackageUploadStatus(
        packageUploadStatuses,
        startingSubmission,
        "unknown",
      );
    }

    const uploadedPackage = uploadingPackage(line);

    if (uploadedPackage) {
      uploadsAttempted += 1;
      rememberPackageUploadStatus(
        packageUploadStatuses,
        uploadedPackage,
        "unknown",
      );
    }

    const submission = completedSubmission(line);

    if (submission) {
      if (submission.cacheCount === 0) {
        zeroCacheSubmissions += 1;
      } else {
        uploadedCount += 1;
      }
      rememberPackageUploadStatus(
        packageUploadStatuses,
        submission.packageSpec,
        submission.cacheCount === 0 ? "failed" : "succeeded",
      );
    }

    const status = failedHttpStatus(line);

    if (status) {
      failedHttpStatuses.push(status);
    }

    const deniedPackage = writeDeniedPackage(line);

    if (deniedPackage) {
      failedUpload = deniedPackage;
    }

    const handleTime = packageHandleTime(line);

    if (handleTime) {
      packageHandleTimes.push(handleTime);
    }

    const abiHash = packageAbiHash(line);

    if (abiHash) {
      packageAbiHashes.push(abiHash);
    }

    const missingDependency = missingSystemDependency(
      line,
      currentBuildPackage,
    );

    if (missingDependency) {
      missingSystemDependencies.push(missingDependency);
    }

    if (status === "403" && failedUpload) {
      writeDeniedPackages.push(failedUpload);
    }

    if (containsAuthFailure(line)) {
      authMessages.push(trimmed);
    }

    if (containsQuotaFailure(line)) {
      quotaMessages.push(trimmed);
    }

    const urls = line.match(URL_PATTERN);

    if (urls) {
      feeds.push(...urls.filter((url) => /nuget/i.test(url)));
    }
  }

  const restoredPackageCount = unique(restoredPackages).length;

  return {
    authMessages: unique(authMessages),
    builtCount: unique(builtPackages).length || undefined,
    builtPackages: unique(builtPackages),
    failedHttpStatuses: unique(failedHttpStatuses),
    feeds: unique(feeds),
    missingSystemDependencies: uniqueMissingSystemDependencies(
      missingSystemDependencies,
    ),
    nugetConfigPaths: unique(nugetConfigPaths),
    packageAbiHashes: uniquePackageAbiHashes(packageAbiHashes),
    packageHandleTimes: uniquePackageHandleTimes(packageHandleTimes),
    packageUploadStatuses: [...packageUploadStatuses.values()],
    quotaMessages: unique(quotaMessages),
    requestedCount: unique(packageListPackages).length || undefined,
    restoredCount: parsedRestoredCount ?? (restoredPackageCount || undefined),
    restoredPackages: unique(restoredPackages),
    submissionsStarted,
    uploadedCount: uploadedCount || undefined,
    uploadsAttempted,
    writeDeniedPackages: uniqueWriteDeniedPackages(writeDeniedPackages),
    zeroCacheSubmissions,
  };
}
