/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import * as core from "@actions/core";
import { readFile } from "node:fs/promises";
import * as path from "node:path";

import {
  AnalyzerLiveProbes,
  formatProbeResult,
  ProbeResult,
  runAnalyzerLiveProbes,
} from "./shared/analyze-probes";
import { BuildLogFacts, parseBuildLog } from "./shared/build-log";
import { buildFeedUrl } from "./shared/cache";
import {
  classifyCache,
  normalizeFailOnPolicy,
  shouldFailDiagnosis,
} from "./shared/diagnosis";
import {
  normalizeTokenKind,
  parseBoolean,
  resolveFeedOwner,
  resolveUsername,
} from "./shared/inputs";
import { discoverPackageConfigs } from "./shared/package-config";
import { RestoreProbe, runRestoreProbe } from "./shared/restore-probe";
import { resolveVcpkgPaths } from "./shared/vcpkg";

function liveProbeRows(
  liveProbes: AnalyzerLiveProbes,
): readonly (readonly [string, ProbeResult])[] {
  return [
    ["Feed basic auth", liveProbes.feedBasicAuth],
    ["Feed bearer auth", liveProbes.feedBearerAuth],
    ["vcpkg version", liveProbes.vcpkgVersion],
    ["vcpkg NuGet command", liveProbes.vcpkgNuget],
    ["NuGet version", liveProbes.nugetVersion],
    ["NuGet sources", liveProbes.nugetSources],
  ];
}

function optionalInput(name: string, defaultValue = ""): string {
  return core.getInput(name).trim() || defaultValue;
}

function summaryItem(label: string, value: string): string {
  return `${label}: ${value}`;
}

function optionalCount(value: number | undefined): string {
  return value?.toString() ?? "unknown";
}

function logProbeOutputs(liveProbes: AnalyzerLiveProbes, trace: boolean): void {
  for (const [label, result] of liveProbeRows(liveProbes)) {
    core.info(`${label}: ${formatProbeResult(result)}`);
  }

  if (!trace || !liveProbes.nugetSources.output) {
    return;
  }

  for (const line of liveProbes.nugetSources.output.split(/\r?\n/)) {
    if (line.trim()) {
      core.info(`NuGet sources output: ${line}`);
    }
  }
}

function logRestoreProbe(restoreProbe: RestoreProbe, trace: boolean): void {
  core.info(`Restore probe: ${formatProbeResult(restoreProbe.result)}`);

  if (!trace || !restoreProbe.result.output) {
    return;
  }

  for (const line of restoreProbe.result.output.split(/\r?\n/)) {
    if (line.trim()) {
      core.info(`Restore probe output: ${line}`);
    }
  }
}

function buildLogRows(
  buildLogFacts: BuildLogFacts | undefined,
): readonly string[] {
  if (!buildLogFacts) {
    return [];
  }

  return [
    summaryItem(
      "Build log requested packages",
      optionalCount(buildLogFacts.requestedCount),
    ),
    summaryItem(
      "Build log restored packages",
      optionalCount(buildLogFacts.restoredCount),
    ),
    summaryItem(
      "Build log built packages",
      optionalCount(buildLogFacts.builtCount),
    ),
    summaryItem(
      "Build log uploaded packages",
      optionalCount(buildLogFacts.uploadedCount),
    ),
    summaryItem(
      "Build log auth messages",
      buildLogFacts.authMessages.length.toString(),
    ),
    summaryItem(
      "Build log quota messages",
      buildLogFacts.quotaMessages.length.toString(),
    ),
  ];
}

function logBuildLogFacts(
  buildLogFacts: BuildLogFacts | undefined,
  trace: boolean,
): void {
  if (!buildLogFacts) {
    return;
  }

  core.info(
    `Build log requested packages: ${optionalCount(buildLogFacts.requestedCount)}`,
  );
  core.info(
    `Build log restored packages: ${optionalCount(buildLogFacts.restoredCount)}`,
  );
  core.info(
    `Build log built packages: ${optionalCount(buildLogFacts.builtCount)}`,
  );
  core.info(
    `Build log uploaded packages: ${optionalCount(buildLogFacts.uploadedCount)}`,
  );
  core.info(
    `Build log submissions started: ${buildLogFacts.submissionsStarted}`,
  );
  core.info(`Build log uploads attempted: ${buildLogFacts.uploadsAttempted}`);
  core.info(
    `Build log zero-cache submissions: ${buildLogFacts.zeroCacheSubmissions}`,
  );
  core.info(
    `Build log failed HTTP statuses: ${buildLogFacts.failedHttpStatuses.length}`,
  );
  core.info(`Build log auth messages: ${buildLogFacts.authMessages.length}`);
  core.info(`Build log quota messages: ${buildLogFacts.quotaMessages.length}`);

  if (!trace) {
    return;
  }

  for (const feed of buildLogFacts.feeds) {
    core.info(`Build log feed: ${feed}`);
  }

  for (const configPath of buildLogFacts.nugetConfigPaths) {
    core.info(`Build log NuGet config: ${configPath}`);
  }
}

async function readBuildLogFacts(
  buildLog: string,
  workspace: string,
): Promise<BuildLogFacts | undefined> {
  if (!buildLog) {
    return undefined;
  }

  const buildLogPath = path.resolve(workspace, buildLog);
  const content = await readFile(buildLogPath, "utf8");

  return parseBuildLog(content);
}

async function writeSummary(
  diagnosis: string,
  cacheStatus: string,
  failureKind: string,
  feedUrl: string,
  liveProbes: AnalyzerLiveProbes,
  restoreProbe: RestoreProbe,
  buildLogFacts: BuildLogFacts | undefined,
  packageConfigCount: number,
  requestedCount: number,
  restoredCount: string,
  builtCount: string,
  uploadedCount: string,
): Promise<void> {
  if (!process.env.GITHUB_STEP_SUMMARY) {
    return;
  }

  await core.summary
    .addHeading("vcpkg GitHub Packages cache analysis", 3)
    .addList([
      summaryItem("Diagnosis", diagnosis),
      summaryItem("Cache status", cacheStatus),
      summaryItem("Failure kind", failureKind || "none"),
      summaryItem("Feed", feedUrl),
      ...liveProbeRows(liveProbes).map(([label, result]) =>
        summaryItem(label, formatProbeResult(result)),
      ),
      summaryItem("Restore probe", formatProbeResult(restoreProbe.result)),
      ...buildLogRows(buildLogFacts),
      summaryItem("packages.config files", packageConfigCount.toString()),
      summaryItem("Requested packages", requestedCount.toString()),
      summaryItem("Restored packages", restoredCount || "unknown"),
      summaryItem("Built packages", builtCount || "unknown"),
      summaryItem("Uploaded packages", uploadedCount || "unknown"),
    ])
    .write();
}

export async function run(): Promise<void> {
  const token = core.getInput("token", { required: true });
  core.setSecret(token);

  const tokenKind = normalizeTokenKind(optionalInput("token-kind", "github"));
  const feedOwner = resolveFeedOwner(
    core.getInput("feed-owner"),
    process.env.GITHUB_REPOSITORY,
  );
  const username = resolveUsername(
    core.getInput("username"),
    tokenKind,
    feedOwner,
    process.env.GITHUB_ACTOR,
  );
  const feedUrl = buildFeedUrl(feedOwner);
  const debug = parseBoolean(optionalInput("debug", "false"));
  const trace = parseBoolean(optionalInput("trace", "false"));
  const buildLog = optionalInput("build-log");
  const packageConfigGlob = optionalInput(
    "package-config-glob",
    "**/packages.config",
  );
  const failOn = optionalInput("fail-on", "never");
  const failOnPolicy = normalizeFailOnPolicy(failOn);
  const vcpkg = resolveVcpkgPaths(
    optionalInput("vcpkg-root", "vcpkg"),
    process.env.GITHUB_WORKSPACE,
  );
  const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd();
  const packageConfigs = await discoverPackageConfigs(
    workspace,
    packageConfigGlob,
  );
  const buildLogFacts = await readBuildLogFacts(buildLog, workspace);
  const liveProbes = await runAnalyzerLiveProbes({
    feedUrl,
    token,
    username,
    vcpkg,
  });
  const restoreProbe = await runRestoreProbe({
    feedUrl,
    nuget: liveProbes.nugetCommand,
    packageConfigs,
  });
  const requestedCount =
    packageConfigs.requestedPackages.length ||
    buildLogFacts?.requestedCount ||
    0;
  const restoredCount =
    (buildLogFacts?.restoredCount ?? restoreProbe.restoredCount)?.toString() ??
    "";
  const builtCount = buildLogFacts?.builtCount?.toString() ?? "";
  const uploadedCount = buildLogFacts?.uploadedCount?.toString() ?? "";
  const diagnosis = classifyCache({
    buildLogFacts,
    liveProbes,
    requestedCount,
    restoreProbe,
    tokenKind,
  });

  core.setOutput("cache-status", diagnosis.cacheStatus);
  core.setOutput("diagnosis", diagnosis.diagnosis);
  core.setOutput("requested-count", requestedCount.toString());
  core.setOutput("restored-count", restoredCount);
  core.setOutput("built-count", builtCount);
  core.setOutput("uploaded-count", uploadedCount);
  core.setOutput("failure-kind", diagnosis.failureKind);
  core.setOutput("diagnostics-artifact", "");

  core.info(diagnosis.diagnosis);
  core.info(`Cache status: ${diagnosis.cacheStatus}`);
  core.info(`Failure kind: ${diagnosis.failureKind || "none"}`);
  core.info(`Token path: ${tokenKind === "github" ? "GITHUB_TOKEN" : "PAT"}`);
  core.info(`Feed owner: ${feedOwner}`);
  core.info(`NuGet username: ${username}`);
  logProbeOutputs(liveProbes, trace);
  logRestoreProbe(restoreProbe, trace);
  logBuildLogFacts(buildLogFacts, trace);
  core.info(`packages.config files: ${packageConfigs.files.length}`);
  core.info(`Requested packages: ${requestedCount}`);
  if (restoredCount) {
    core.info(`Restored packages: ${restoredCount}`);
  }

  if (debug || trace) {
    core.info(`Debug: ${debug ? "enabled" : "disabled"}`);
    core.info(`Trace: ${trace ? "enabled" : "disabled"}`);
  }

  if (trace) {
    core.info(`Feed URL: ${feedUrl}`);
    core.info(`vcpkg root: ${vcpkg.root}`);
    core.info(`vcpkg executable: ${vcpkg.executable}`);
    core.info(`build-log: ${buildLog}`);
    core.info(`package-config-glob: ${packageConfigGlob}`);
    core.info(`fail-on: ${failOn}`);
    for (const packageConfig of packageConfigs.files) {
      core.info(
        `packages.config: ${packageConfig.path} (${packageConfig.packages.length} packages)`,
      );
    }
  }

  await writeSummary(
    diagnosis.diagnosis,
    diagnosis.cacheStatus,
    diagnosis.failureKind,
    feedUrl,
    liveProbes,
    restoreProbe,
    buildLogFacts,
    packageConfigs.files.length,
    requestedCount,
    restoredCount,
    builtCount,
    uploadedCount,
  );

  if (shouldFailDiagnosis(diagnosis, failOnPolicy)) {
    core.setFailed(diagnosis.diagnosis);
  }
}

void run().catch((error: unknown) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
