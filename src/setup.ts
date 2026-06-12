/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import * as core from "@actions/core";

import { buildDisabledBinarySources, buildFeedUrl } from "./shared/cache";
import {
  normalizeTokenKind,
  parseBoolean,
  resolveFeedOwner,
  resolveUsername,
} from "./shared/inputs";
import { ensureMonoAvailable } from "./shared/mono";
import { configureNugetSource } from "./shared/nuget";
import {
  buildNugetCommand,
  bootstrapVcpkg,
  fetchNuget,
  readVcpkgVersion,
  resolveVcpkgPaths,
  verifyVcpkgExecutable,
} from "./shared/vcpkg";

const DIAGNOSIS = "setup skeleton: binary caching is disabled";

function optionalInput(name: string, defaultValue = ""): string {
  return core.getInput(name).trim() || defaultValue;
}

async function writeSummary(
  feedUrl: string,
  nugetCommand: string,
  vcpkgRoot: string,
  vcpkgVersion: string,
): Promise<void> {
  if (!process.env.GITHUB_STEP_SUMMARY) {
    return;
  }

  await core.summary
    .addHeading("vcpkg GitHub Packages cache setup")
    .addRaw(DIAGNOSIS)
    .addEOL()
    .addRaw(`Feed: ${feedUrl}`)
    .addEOL()
    .addRaw(`vcpkg root: ${vcpkgRoot}`)
    .addEOL()
    .addRaw(`vcpkg version: ${vcpkgVersion}`)
    .addEOL()
    .addRaw(`NuGet command: ${nugetCommand}`)
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
  const bootstrap = parseBoolean(optionalInput("bootstrap", "false"));
  const debug = parseBoolean(optionalInput("debug", "false"));
  const installMono = parseBoolean(optionalInput("install-mono", "true"));
  const installNuget = parseBoolean(optionalInput("install-nuget", "true"));
  const sourceName = optionalInput("source-name", "GitHubPackages");
  const trace = parseBoolean(optionalInput("trace", "false"));
  const vcpkg = resolveVcpkgPaths(
    optionalInput("vcpkg-root", "vcpkg"),
    process.env.GITHUB_WORKSPACE,
  );

  if (debug || trace) {
    core.info(`Debug: ${debug ? "enabled" : "disabled"}`);
    core.info(`Trace: ${trace ? "enabled" : "disabled"}`);
  }

  if (trace) {
    core.info(`Feed URL: ${feedUrl}`);
    core.info(`Bootstrap vcpkg: ${bootstrap ? "true" : "false"}`);
    core.info(`Install Mono: ${installMono ? "true" : "false"}`);
    core.info(`Fetch NuGet: ${installNuget ? "true" : "false"}`);
    core.info(`NuGet source name: ${sourceName}`);
    core.info(`vcpkg executable: ${vcpkg.executable}`);
    core.info(`vcpkg bootstrap script: ${vcpkg.bootstrapScript}`);
  }

  if (bootstrap) {
    core.info(`Bootstrapping vcpkg at ${vcpkg.root}`);
    await bootstrapVcpkg(vcpkg);
  }

  await verifyVcpkgExecutable(vcpkg.executable);
  const vcpkgVersion = await readVcpkgVersion(vcpkg);
  let nugetCommand = "";

  if (installNuget) {
    const mono = await ensureMonoAvailable(installMono);
    const nugetPath = await fetchNuget(vcpkg);
    const nuget = buildNugetCommand(nugetPath);
    nugetCommand = nuget.display;
    await configureNugetSource(
      nuget,
      {
        feedUrl,
        sourceName,
        token,
        username,
      },
      {
        debug,
        log: (message) => core.info(message),
        trace,
      },
    );

    if (trace) {
      core.info(`Mono required: ${mono.required ? "true" : "false"}`);
      core.info(
        `Mono installed by action: ${mono.installed ? "true" : "false"}`,
      );
      core.info(`NuGet source configured: ${sourceName}`);
    }
  }

  const binarySources = buildDisabledBinarySources();

  core.setOutput("feed-url", feedUrl);
  core.setOutput("binary-sources", binarySources);
  core.setOutput("nuget-command", nugetCommand);
  core.setOutput("vcpkg-version", vcpkgVersion);
  core.setOutput("diagnosis", DIAGNOSIS);

  core.info(DIAGNOSIS);
  core.info(`Token path: ${tokenKind === "github" ? "GITHUB_TOKEN" : "PAT"}`);
  core.info(`Feed owner: ${feedOwner}`);
  core.info(`NuGet username: ${username}`);
  core.info(`vcpkg root: ${vcpkg.root}`);
  core.info(`vcpkg version: ${vcpkgVersion}`);

  if (trace) {
    core.info(`binary-sources: ${binarySources}`);
    core.info(`nuget-command: ${nugetCommand}`);
  }

  await writeSummary(feedUrl, nugetCommand, vcpkg.root, vcpkgVersion);
}

void run().catch((error: unknown) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
