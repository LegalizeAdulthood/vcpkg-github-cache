/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import * as core from "@actions/core";

import { buildFeedUrl } from "./shared/cache";
import {
  normalizeTokenKind,
  parseBoolean,
  resolveFeedOwner,
  resolveUsername,
} from "./shared/inputs";
import { resolveVcpkgPaths } from "./shared/vcpkg";

const CACHE_STATUS = "unknown";
const DIAGNOSIS = "analyzer skeleton: no cache probes were run";

function optionalInput(name: string, defaultValue = ""): string {
  return core.getInput(name).trim() || defaultValue;
}

async function writeSummary(feedUrl: string): Promise<void> {
  if (!process.env.GITHUB_STEP_SUMMARY) {
    return;
  }

  await core.summary
    .addHeading("vcpkg GitHub Packages cache analysis")
    .addRaw(DIAGNOSIS)
    .addEOL()
    .addRaw(`Feed: ${feedUrl}`)
    .addEOL()
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

  core.setOutput("cache-status", CACHE_STATUS);
  core.setOutput("diagnosis", DIAGNOSIS);
  core.setOutput("requested-count", "");
  core.setOutput("restored-count", "");
  core.setOutput("built-count", "");
  core.setOutput("uploaded-count", "");
  core.setOutput("failure-kind", "");
  core.setOutput("diagnostics-artifact", "");

  core.info(DIAGNOSIS);
  core.info(`Token path: ${tokenKind === "github" ? "GITHUB_TOKEN" : "PAT"}`);
  core.info(`Feed owner: ${feedOwner}`);
  core.info(`NuGet username: ${username}`);

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
  }

  await writeSummary(feedUrl);
}

void run().catch((error: unknown) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
