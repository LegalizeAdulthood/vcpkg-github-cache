/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { BuildLogFacts } from "./build-log";

export function cacheStatusHeading(cacheStatus: string): string {
  return `Cache status: ${cacheStatus.replaceAll("-", " ")}`;
}

export function shouldLogAnalysisDetails(
  debug: boolean,
  trace: boolean,
): boolean {
  return debug || trace;
}

export function shouldUseCompactSummary(verbose: boolean): boolean {
  return !verbose;
}

export function shouldProbePackageMetadata(
  debug: boolean,
  failOnPolicy: string,
  tokenKind: string,
  buildLogFacts: BuildLogFacts | undefined,
): boolean {
  return (
    debug ||
    failOnPolicy === "private-package" ||
    tokenKind === "pat" ||
    Boolean(buildLogFacts?.builtPackages?.length) ||
    buildLogFacts?.vcpkgTool?.status === "built-from-source" ||
    Boolean(buildLogFacts?.writeDeniedPackages?.length)
  );
}
