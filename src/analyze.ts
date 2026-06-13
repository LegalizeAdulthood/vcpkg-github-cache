/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import * as core from "@actions/core";
import artifact from "@actions/artifact";
import { readFile, stat } from "node:fs/promises";
import * as path from "node:path";

import {
  AnalyzerLiveProbes,
  formatProbeResult,
  ProbeResult,
  runAnalyzerLiveProbes,
} from "./shared/analyze-probes";
import {
  shouldLogAnalysisDetails,
  shouldProbePackageMetadata,
  shouldUseDeniedPackageTableOnly,
} from "./shared/analyze-policy";
import {
  BuildLogFacts,
  parseBuildLog,
  WriteDeniedPackage,
} from "./shared/build-log";
import { buildFeedUrl } from "./shared/cache";
import { runCommand } from "./shared/command";
import {
  DeniedPackageReport,
  deniedPackageReportRows,
  formatDeniedPackageReportTable,
} from "./shared/denied-package-report";
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
import {
  discoverPackageConfigs,
  PackageIdentity,
} from "./shared/package-config";
import {
  PACKAGE_QUOTA_RISK_PRIVATE_STORAGE,
  packageMetadataQuotaRiskCount,
  PackageMetadataProbe,
  PackageMetadataResult,
  runPackageMetadataProbe,
} from "./shared/package-metadata";
import { RestoreProbe, runRestoreProbe } from "./shared/restore-probe";
import { createTraceLogger, TraceLogger } from "./shared/trace";
import { resolveVcpkgPaths } from "./shared/vcpkg";

type SummaryTableRows = Parameters<typeof core.summary.addTable>[0];

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

function writeDeniedPackageSummaryTable(
  packages: readonly DeniedPackageReport[],
): SummaryTableRows {
  const [header, ...rows] = deniedPackageReportRows(packages, "html");

  return [
    header.map((value) => ({ data: value, header: true })),
    ...rows.map((row) => [...row]),
  ];
}

function formatNupkgSize(size: number): string {
  const units = ["B", "KiB", "MiB", "GiB"];
  let value = size;
  let unit = 0;

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }

  if (unit === 0) {
    return `${size} B`;
  }

  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

function nupkgFileName(value: WriteDeniedPackage): string {
  return `${value.packageId}.${value.version}.nupkg`;
}

async function nupkgSize(
  vcpkgRoot: string,
  value: WriteDeniedPackage,
): Promise<string | undefined> {
  try {
    const file = await stat(
      path.join(vcpkgRoot, "buildtrees", nupkgFileName(value)),
    );

    return file.isFile() ? formatNupkgSize(file.size) : undefined;
  } catch {
    return undefined;
  }
}

function packageHandleTimes(
  buildLogFacts: BuildLogFacts | undefined,
): ReadonlyMap<string, string> {
  return new Map(
    (buildLogFacts?.packageHandleTimes ?? []).map((value) => [
      value.packageId,
      value.elapsed,
    ]),
  );
}

function packageMetadataResults(
  packageMetadata: PackageMetadataProbe | undefined,
): ReadonlyMap<string, PackageMetadataResult> {
  return new Map(
    (packageMetadata?.results ?? []).map((value) => [value.name, value]),
  );
}

function logPackageQuotaRisks(
  packageMetadata: PackageMetadataProbe | undefined,
): void {
  for (const result of packageMetadata?.results ?? []) {
    if (result.quotaRisk === PACKAGE_QUOTA_RISK_PRIVATE_STORAGE) {
      core.warning(
        `GitHub Packages quota risk: ${result.name} uses ${result.quotaRisk}`,
      );
    }
  }
}

function packageMetadataIdentities(
  buildLogFacts: BuildLogFacts | undefined,
  requestedPackages: readonly PackageIdentity[],
): readonly PackageIdentity[] {
  const deniedPackages = writeDeniedPackages(buildLogFacts);

  return deniedPackages.length
    ? deniedPackages.map((value) => ({
        id: value.packageId,
        version: value.version,
      }))
    : requestedPackages;
}

async function deniedPackageReports(
  buildLogFacts: BuildLogFacts | undefined,
  packageMetadata: PackageMetadataProbe | undefined,
  vcpkgRoot: string,
): Promise<readonly DeniedPackageReport[]> {
  const handleTimes = packageHandleTimes(buildLogFacts);
  const metadata = packageMetadataResults(packageMetadata);

  return await Promise.all(
    writeDeniedPackages(buildLogFacts).map(async (value) => {
      const result = metadata.get(value.packageId);

      return {
        buildTime: handleTimes.get(value.packageId),
        nupkgSize: await nupkgSize(vcpkgRoot, value),
        packageId: value.packageId,
        packageSettingsUrl: result?.settingsUrl,
        packageVersionCount: result?.versionCount,
        quotaRisk: result?.quotaRisk,
        repository: result?.repository,
        repositoryUrl: result?.repositoryUrl,
        version: value.version,
        visibility: result?.visibility,
      };
    }),
  );
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
  deniedReports: readonly DeniedPackageReport[],
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

  const deniedTable = formatDeniedPackageReportTable(deniedReports);

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
  deniedReports: readonly DeniedPackageReport[],
  verbose: boolean,
): Promise<void> {
  if (!process.env.GITHUB_STEP_SUMMARY) {
    return;
  }

  const summary = core.summary;

  if (shouldUseDeniedPackageTableOnly(deniedReports.length, verbose)) {
    await summary
      .addHeading("Packages denied write access", 4)
      .addTable(writeDeniedPackageSummaryTable(deniedReports))
      .write();
    return;
  }

  summary
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
  if (deniedReports.length) {
    summary
      .addHeading("Packages denied write access", 4)
      .addTable(writeDeniedPackageSummaryTable(deniedReports));
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
  let diagnosticsArtifact = "";
  let packageMetadata: PackageMetadataProbe | undefined;

  if (
    shouldProbePackageMetadata(debug, failOnPolicy, tokenKind, buildLogFacts)
  ) {
    packageMetadata = await traceLogger.step(
      "probe package metadata",
      async () =>
        runPackageMetadataProbe({
          apiUrl: process.env.GITHUB_API_URL,
          feedOwner,
          packageIdentities: packageMetadataIdentities(
            buildLogFacts,
            packageConfigs.requestedPackages,
          ),
          token,
        }),
    );
  }

  const diagnosis = classifyCache({
    buildLogFacts,
    liveProbes,
    packageMetadata,
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

  const deniedReports = await traceLogger.step(
    "collect denied package details",
    async () =>
      deniedPackageReports(buildLogFacts, packageMetadata, vcpkg.root),
  );

  if (debug) {
    try {
      diagnosticsArtifact = await traceLogger.step(
        "upload diagnostics artifact",
        async () =>
          uploadDiagnosticsArtifact(
            {
              buildLog,
              buildLogFacts,
              builtCount,
              deniedPackageReports: deniedReports,
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

  const logDetails = shouldLogAnalysisDetails(debug, trace);

  core.info(diagnosis.diagnosis);
  if (logDetails) {
    core.info(`Cache status: ${diagnosis.cacheStatus}`);
    core.info(`Failure kind: ${diagnosis.failureKind || "none"}`);
    core.info(`Token path: ${tokenKind === "github" ? "GITHUB_TOKEN" : "PAT"}`);
    core.info(`Feed owner: ${feedOwner}`);
    core.info(`NuGet username: ${username}`);
    logProbeOutputs(liveProbes, trace);
    logRestoreProbe(restoreProbe, trace);
    logBuildLogFacts(buildLogFacts, deniedReports, trace);
  }
  logPackageQuotaRisks(packageMetadata);

  if (logDetails) {
    core.info(`packages.config files: ${packageConfigs.files.length}`);
    core.info(`Requested packages: ${requestedCount}`);
    if (restoredCount) {
      core.info(`Restored packages: ${restoredCount}`);
    }
    core.info(`Debug: ${debug ? "enabled" : "disabled"}`);
    core.info(`Trace: ${trace ? "enabled" : "disabled"}`);
  }

  if (trace) {
    core.info(
      `Package quota risks: ${packageMetadataQuotaRiskCount(packageMetadata)}`,
    );
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
    deniedReports,
    logDetails,
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
