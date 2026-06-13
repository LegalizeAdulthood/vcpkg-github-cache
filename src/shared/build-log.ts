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
  readonly quotaMessages: readonly string[];
  readonly requestedCount?: number;
  readonly restoredCount?: number;
  readonly restoredPackages: readonly string[];
  readonly submissionsStarted: number;
  readonly uploadedCount?: number;
  readonly uploadsAttempted: number;
  readonly zeroCacheSubmissions: number;
}

const ANSI_PATTERN = new RegExp(`${String.fromCharCode(0x1b)}\\[[0-9;]*m`, "g");
const GITHUB_LOG_PREFIX_PATTERN =
  /^\ufeff?\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\s+/;
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

export function parseBuildLog(content: string): BuildLogFacts {
  const packageListPackages: string[] = [];
  const restoredPackages: string[] = [];
  const builtPackages: string[] = [];
  const failedHttpStatuses: string[] = [];
  const authMessages: string[] = [];
  const quotaMessages: string[] = [];
  const feeds: string[] = [];
  const nugetConfigPaths: string[] = [];
  let capturePackageList = false;
  let captureFeeds = false;
  let captureNugetConfigPaths = false;
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
    quotaMessages: unique(quotaMessages),
    requestedCount: unique(packageListPackages).length || undefined,
    restoredCount: parsedRestoredCount ?? (restoredPackageCount || undefined),
    restoredPackages: unique(restoredPackages),
    submissionsStarted,
    uploadedCount: uploadedCount || undefined,
    uploadsAttempted,
    zeroCacheSubmissions,
  };
}
