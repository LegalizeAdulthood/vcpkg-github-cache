/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";

import { CommandResult, CommandRunner, runCommand } from "./command";
import { PackageConfigDiscovery, PackageIdentity } from "./package-config";
import type { ProbeResult } from "./analyze-probes";
import { NugetCommand } from "./vcpkg";

export interface RestoreProbe {
  readonly packageDirectory?: string;
  readonly restoredCount?: number;
  readonly result: ProbeResult;
}

export interface RestoreProbeOptions {
  readonly feedUrl: string;
  readonly nuget?: NugetCommand;
  readonly packageConfigs: PackageConfigDiscovery;
  readonly run?: CommandRunner;
}

const MAX_RESTORE_OUTPUT_LENGTH = 8000;

function trimRestoreOutput(value: string): string {
  const trimmed = value.trim();

  if (trimmed.length <= MAX_RESTORE_OUTPUT_LENGTH) {
    return trimmed;
  }

  return `${trimmed.slice(0, MAX_RESTORE_OUTPUT_LENGTH)}...`;
}

function combinedOutput(result: CommandResult): string {
  return trimRestoreOutput(`${result.stdout}\n${result.stderr}`);
}

function ok(detail: string, output?: string): ProbeResult {
  return { detail, output, status: "ok" };
}

function failed(detail: string, output?: string): ProbeResult {
  return { detail, output, status: "failed" };
}

function skipped(detail: string): ProbeResult {
  return { detail, status: "skipped" };
}

function restoreArgs(
  packageConfigPath: string,
  feedUrl: string,
  packageDirectory: string,
): readonly string[] {
  return [
    "restore",
    packageConfigPath,
    "-PackagesDirectory",
    packageDirectory,
    "-Source",
    feedUrl,
    "-NoHttpCache",
    "-NonInteractive",
    "-Verbosity",
    "detailed",
  ];
}

function packageDirectoryName(identity: PackageIdentity): string {
  return `${identity.id}.${identity.version}`.toLowerCase();
}

async function discoveredPackageDirectoryNames(
  packageDirectory: string,
): Promise<ReadonlySet<string>> {
  try {
    const entries = await readdir(packageDirectory, { withFileTypes: true });
    return new Set(
      entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name.toLowerCase()),
    );
  } catch {
    return new Set();
  }
}

async function countRestoredPackages(
  packageDirectory: string,
  requestedPackages: readonly PackageIdentity[],
): Promise<number> {
  const directories = await discoveredPackageDirectoryNames(packageDirectory);

  return requestedPackages.filter((identity) =>
    directories.has(packageDirectoryName(identity)),
  ).length;
}

async function runRestore(
  nuget: NugetCommand,
  args: readonly string[],
  run: CommandRunner,
): Promise<CommandResult> {
  return await run(nuget.file, [...nuget.args, ...args]);
}

function appendOutput(lines: string[], output: string): void {
  if (output) {
    lines.push(output);
  }
}

function errorOutput(error: unknown): string {
  return trimRestoreOutput(
    error instanceof Error ? error.message : String(error),
  );
}

export async function runRestoreProbe(
  options: RestoreProbeOptions,
): Promise<RestoreProbe> {
  if (!options.nuget) {
    return { result: skipped("NuGet command unavailable") };
  }

  const requestedPackages = options.packageConfigs.requestedPackages;

  if (requestedPackages.length === 0) {
    return { result: skipped("No packages requested") };
  }

  const run = options.run ?? runCommand;
  const packageDirectory = await mkdtemp(
    path.join(tmpdir(), "vcpkg-cache-restore-"),
  );
  const outputs: string[] = [];
  let failedRestores = 0;

  try {
    for (const packageConfig of options.packageConfigs.files) {
      if (packageConfig.packages.length === 0) {
        continue;
      }

      try {
        const result = await runRestore(
          options.nuget,
          restoreArgs(packageConfig.path, options.feedUrl, packageDirectory),
          run,
        );
        appendOutput(outputs, combinedOutput(result));
      } catch (error) {
        failedRestores += 1;
        appendOutput(outputs, errorOutput(error));
      }
    }

    const restoredCount = await countRestoredPackages(
      packageDirectory,
      requestedPackages,
    );
    const requestedCount = requestedPackages.length;
    const detail = `restored ${restoredCount}/${requestedCount} packages`;
    const output = trimRestoreOutput(outputs.join("\n"));
    const result =
      failedRestores === 0 && restoredCount === requestedCount
        ? ok(detail, output)
        : failed(`NuGet restore failed; ${detail}`, output);

    return { packageDirectory, restoredCount, result };
  } finally {
    await rm(packageDirectory, { force: true, recursive: true });
  }
}
