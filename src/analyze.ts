/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import * as core from "@actions/core";

import {
  AnalyzerLiveProbes,
  formatProbeResult,
  ProbeResult,
  runAnalyzerLiveProbes,
} from "./shared/analyze-probes";
import { buildFeedUrl } from "./shared/cache";
import {
  normalizeTokenKind,
  parseBoolean,
  resolveFeedOwner,
  resolveUsername,
} from "./shared/inputs";
import { discoverPackageConfigs } from "./shared/package-config";
import { resolveVcpkgPaths } from "./shared/vcpkg";

const CACHE_STATUS = "unknown";
const DIAGNOSIS =
  "analyzer live probes completed; cache effectiveness is unknown";

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

async function writeSummary(
  feedUrl: string,
  liveProbes: AnalyzerLiveProbes,
  packageConfigCount: number,
  requestedCount: number,
): Promise<void> {
  if (!process.env.GITHUB_STEP_SUMMARY) {
    return;
  }

  await core.summary
    .addHeading("vcpkg GitHub Packages cache analysis", 3)
    .addList([
      summaryItem("Diagnosis", DIAGNOSIS),
      summaryItem("Feed", feedUrl),
      ...liveProbeRows(liveProbes).map(([label, result]) =>
        summaryItem(label, formatProbeResult(result)),
      ),
      summaryItem("packages.config files", packageConfigCount.toString()),
      summaryItem("Requested packages", requestedCount.toString()),
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
  const vcpkg = resolveVcpkgPaths(
    optionalInput("vcpkg-root", "vcpkg"),
    process.env.GITHUB_WORKSPACE,
  );
  const packageConfigs = await discoverPackageConfigs(
    process.env.GITHUB_WORKSPACE ?? process.cwd(),
    packageConfigGlob,
  );
  const liveProbes = await runAnalyzerLiveProbes({
    feedUrl,
    token,
    username,
    vcpkg,
  });
  const requestedCount = packageConfigs.requestedPackages.length;

  core.setOutput("cache-status", CACHE_STATUS);
  core.setOutput("diagnosis", DIAGNOSIS);
  core.setOutput("requested-count", requestedCount.toString());
  core.setOutput("restored-count", "");
  core.setOutput("built-count", "");
  core.setOutput("uploaded-count", "");
  core.setOutput("failure-kind", "");
  core.setOutput("diagnostics-artifact", "");

  core.info(DIAGNOSIS);
  core.info(`Token path: ${tokenKind === "github" ? "GITHUB_TOKEN" : "PAT"}`);
  core.info(`Feed owner: ${feedOwner}`);
  core.info(`NuGet username: ${username}`);
  logProbeOutputs(liveProbes, trace);
  core.info(`packages.config files: ${packageConfigs.files.length}`);
  core.info(`Requested packages: ${requestedCount}`);

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
    feedUrl,
    liveProbes,
    packageConfigs.files.length,
    requestedCount,
  );
}

void run().catch((error: unknown) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
