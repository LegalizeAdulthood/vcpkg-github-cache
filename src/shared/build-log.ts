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
  readonly nugetConfigPaths: readonly string[];
  readonly packageHandleTimes: readonly PackageHandleTime[];
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

const ANSI_PATTERN = new RegExp(`${String.fromCharCode(0x1b)}\\[[0-9;]*m`, "g");
const GITHUB_LOG_PREFIX_PATTERN =
  /^\ufeff?\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\s+/;
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

  if (/^[A-Za-z0-9_.+-][^\s]*:[^\s]+@[^\s]+$/.test(packageLine)) {
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

  return match?.[1];
}

function completedSubmissionCacheCount(line: string): number | undefined {
  const match =
    /Completed submission\b.*\bto\s+(\d+)\s+binary cache\(s\)/i.exec(line);

  return match ? parseCount(match[1]) : undefined;
}

function containsAuthFailure(line: string): boolean {
  return /\b(?:401|403|Unauthorized|Forbidden|authentication failed|access denied)\b/i.test(
    line,
  );
}

function containsQuotaFailure(line: string): boolean {
  return /(?:billing limit|quota|twirp error permission_denied|permission_denied)/i.test(
    line,
  );
}

function failedHttpStatus(line: string): string | undefined {
  const match =
    /\b(?:HTTP\s+|status(?:\scode)?\s+)?(401|403|429|500|502|503)\b/i.exec(
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

function packageSpecToNugetPackageId(packageSpec: string): string | undefined {
  const match = /^(.+):([^:\s]+)(?:@[^\s]+)?$/.exec(packageSpec.trim());

  if (!match) {
    return undefined;
  }

  return `${match[1]}_${match[2]}`;
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

export function parseBuildLog(content: string): BuildLogFacts {
  const packageListPackages: string[] = [];
  const restoredPackages: string[] = [];
  const builtPackages: string[] = [];
  const failedHttpStatuses: string[] = [];
  const authMessages: string[] = [];
  const quotaMessages: string[] = [];
  const feeds: string[] = [];
  const nugetConfigPaths: string[] = [];
  const packageHandleTimes: PackageHandleTime[] = [];
  const writeDeniedPackages: WriteDeniedPackage[] = [];
  let capturePackageList = false;
  let captureFeeds = false;
  let captureNugetConfigPaths = false;
  let failedUpload: WriteDeniedPackage | undefined;
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
    }

    if (/Starting submission\b/i.test(line)) {
      submissionsStarted += 1;
    }

    if (/Uploading binaries\b.*\bNuGet\b/i.test(line)) {
      uploadsAttempted += 1;
    }

    const submittedCacheCount = completedSubmissionCacheCount(line);

    if (submittedCacheCount !== undefined) {
      if (submittedCacheCount === 0) {
        zeroCacheSubmissions += 1;
      } else {
        uploadedCount += 1;
      }
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
    nugetConfigPaths: unique(nugetConfigPaths),
    packageHandleTimes: uniquePackageHandleTimes(packageHandleTimes),
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
