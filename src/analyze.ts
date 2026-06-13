/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import * as core from "@actions/core";
import artifact from "@actions/artifact";
import { readFile } from "node:fs/promises";
import * as path from "node:path";

import {
  AnalyzerLiveProbes,
  formatProbeResult,
  ProbeResult,
  runAnalyzerLiveProbes,
} from "./shared/analyze-probes";
import {
  BuildLogFacts,
  parseBuildLog,
  WriteDeniedPackage,
} from "./shared/build-log";
import { buildFeedUrl } from "./shared/cache";
import { runCommand } from "./shared/command";
import {
  classifyCache,
  normalizeFailOnPolicy,
  shouldFailDiagnosis,
} from "./shared/diagnosis";
import { uploadDiagnosticsArtifact } from "./shared/diagnostics-artifact";
import {
  normalizeTokenKind,
  parseBoolean,
  resolveFeedOwner,
  resolveUsername,
} from "./shared/inputs";
import { discoverPackageConfigs } from "./shared/package-config";
import {
  PackageMetadataProbe,
  runPackageMetadataProbe,
} from "./shared/package-metadata";
import { RestoreProbe, runRestoreProbe } from "./shared/restore-probe";
import { createTraceLogger, TraceLogger } from "./shared/trace";
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

function writeDeniedPackages(
  buildLogFacts: BuildLogFacts | undefined,
): readonly WriteDeniedPackage[] {
  return buildLogFacts?.writeDeniedPackages ?? [];
}

function writeDeniedPackageTable(
  packages: readonly WriteDeniedPackage[],
): string {
  if (!packages.length) {
    return "";
  }

  return [
    "| Package ID | Version |",
    "| --- | --- |",
    ...packages.map((value) => `| ${value.packageId} | ${value.version} |`),
    "",
  ].join("\n");
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
    summaryItem(
      "Build log write-denied packages",
      buildLogFacts.writeDeniedPackages.length.toString(),
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
  core.info(
    `Build log write-denied packages: ${buildLogFacts.writeDeniedPackages.length}`,
  );

  const deniedTable = writeDeniedPackageTable(
    buildLogFacts.writeDeniedPackages,
  );

  if (deniedTable) {
    for (const line of deniedTable.trimEnd().split("\n")) {
      core.info(line);
    }
  }

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
  traceLogger: TraceLogger,
): Promise<BuildLogFacts | undefined> {
  if (!buildLog) {
    traceLogger.decision("build log", "not supplied");
    return undefined;
  }

  const buildLogPath = path.resolve(workspace, buildLog);
  traceLogger.path("build log", buildLogPath);
  const content = await traceLogger.step("read build log", async () =>
    readFile(buildLogPath, "utf8"),
  );

  return await traceLogger.step("parse build log", async () =>
    parseBuildLog(content),
  );
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

  const summary = core.summary
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
    ]);
  const deniedTable = writeDeniedPackageTable(
    writeDeniedPackages(buildLogFacts),
  );

  if (deniedTable) {
    summary.addHeading("Packages denied write access", 4).addRaw(deniedTable);
  }

  await summary.write();
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
  const artifactName = optionalInput("artifact-name");
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
  const traceLogger = createTraceLogger({
    enabled: trace,
    log: (message) => core.info(message),
    secrets: [token],
  });
  const tracedRun = traceLogger.commandRunner(runCommand);

  if (trace) {
    traceLogger.input("token", token);
    traceLogger.input("token-kind", tokenKind);
    traceLogger.input("feed-owner", feedOwner);
    traceLogger.input("username", username);
    traceLogger.input("vcpkg-root", optionalInput("vcpkg-root", "vcpkg"));
    traceLogger.input("build-log", buildLog);
    traceLogger.input("artifact-name", artifactName);
    traceLogger.input("package-config-glob", packageConfigGlob);
    traceLogger.input("fail-on", failOn);
    traceLogger.value("platform", `${process.platform}/${process.arch}`);
    traceLogger.value("feed URL", feedUrl);
    traceLogger.path("GITHUB_WORKSPACE", workspace);
    traceLogger.path("vcpkg root", vcpkg.root);
    traceLogger.path("vcpkg executable", vcpkg.executable);
  }

  const packageConfigs = await traceLogger.step(
    "discover packages.config files",
    async () => discoverPackageConfigs(workspace, packageConfigGlob),
  );
  const buildLogFacts = await readBuildLogFacts(
    buildLog,
    workspace,
    traceLogger,
  );
  const liveProbes = await traceLogger.step("run live probes", async () =>
    runAnalyzerLiveProbes({
      feedUrl,
      run: tracedRun,
      token,
      username,
      vcpkg,
    }),
  );
  const restoreProbe = await traceLogger.step(
    "run exact restore probe",
    async () =>
      runRestoreProbe({
        feedUrl,
        nuget: liveProbes.nugetCommand,
        packageConfigs,
        run: tracedRun,
      }),
  );
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
  traceLogger.decision(
    "fail-on",
    shouldFailDiagnosis(diagnosis, failOnPolicy)
      ? `will fail on ${diagnosis.failureKind}`
      : `will not fail on ${diagnosis.failureKind || "none"}`,
  );
  let diagnosticsArtifact = "";
  let packageMetadata: PackageMetadataProbe | undefined;

  if (debug) {
    packageMetadata = await traceLogger.step(
      "probe package metadata",
      async () =>
        runPackageMetadataProbe({
          apiUrl: process.env.GITHUB_API_URL,
          feedOwner,
          packageIdentities: packageConfigs.requestedPackages,
          token,
        }),
    );

    try {
      diagnosticsArtifact = await traceLogger.step(
        "upload diagnostics artifact",
        async () =>
          uploadDiagnosticsArtifact(
            {
              buildLog,
              buildLogFacts,
              builtCount,
              diagnosis,
              failOnPolicy,
              feedOwner,
              feedUrl,
              liveProbes,
              packageConfigGlob,
              packageConfigs,
              packageMetadata,
              requestedCount,
              restoreProbe,
              restoredCount,
              token,
              tokenKind,
              uploadedCount,
              username,
              vcpkg,
              workspace,
            },
            {
              artifactName: artifactName || undefined,
              upload: async (name, files, rootDirectory) =>
                artifact.uploadArtifact(name, files, rootDirectory),
            },
          ),
      );
      core.info(`Diagnostics artifact: ${diagnosticsArtifact}`);
    } catch (error) {
      core.warning(
        `Failed to upload diagnostics artifact: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  core.setOutput("cache-status", diagnosis.cacheStatus);
  core.setOutput("diagnosis", diagnosis.diagnosis);
  core.setOutput("requested-count", requestedCount.toString());
  core.setOutput("restored-count", restoredCount);
  core.setOutput("built-count", builtCount);
  core.setOutput("uploaded-count", uploadedCount);
  core.setOutput("failure-kind", diagnosis.failureKind);
  core.setOutput("diagnostics-artifact", diagnosticsArtifact);

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
    core.info(`artifact-name: ${artifactName}`);
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

if (process.env.VCPKG_GITHUB_CACHE_IMPORT_SMOKE !== "1") {
  void run().catch((error: unknown) => {
    core.setFailed(error instanceof Error ? error.message : String(error));
  });
}
