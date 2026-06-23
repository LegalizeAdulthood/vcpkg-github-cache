/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

export interface SetupEmitSummaryInput {
  readonly binarySourceMode: string;
  readonly diagnosis: string;
  readonly feedUrl: string;
  readonly setupEnv: string;
  readonly setupScript: string;
  readonly targetOs: string;
}

export interface SetupRunSummaryInput {
  readonly diagnosis: string;
  readonly feedUrl: string;
  readonly nugetCommand: string;
  readonly vcpkgRoot: string;
  readonly vcpkgVersion: string;
}

function summaryItem(label: string, value: string): string {
  return `${label}: ${value}`;
}

export function setupEmitSummaryItems(
  input: SetupEmitSummaryInput,
): readonly string[] {
  return [
    summaryItem("Diagnosis", input.diagnosis),
    summaryItem("Target OS", input.targetOs),
    summaryItem("Setup script", input.setupScript),
    summaryItem("Setup environment", input.setupEnv),
    summaryItem("Feed", input.feedUrl),
    summaryItem("Binary source mode", input.binarySourceMode),
  ];
}

export function setupRunSummaryItems(
  input: SetupRunSummaryInput,
): readonly string[] {
  return [
    summaryItem("Diagnosis", input.diagnosis),
    summaryItem("Feed", input.feedUrl),
    summaryItem("vcpkg root", input.vcpkgRoot),
    summaryItem("vcpkg version", input.vcpkgVersion),
    summaryItem("NuGet command", input.nugetCommand),
  ];
}
