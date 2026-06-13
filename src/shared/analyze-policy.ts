/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { BuildLogFacts } from "./build-log";

export function shouldLogAnalysisDetails(
  debug: boolean,
  trace: boolean,
): boolean {
  return debug || trace;
}

export function shouldUseDeniedPackageTableOnly(
  deniedReportCount: number,
  verbose: boolean,
): boolean {
  return deniedReportCount > 0 && !verbose;
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
    Boolean(buildLogFacts?.writeDeniedPackages.length)
  );
}
