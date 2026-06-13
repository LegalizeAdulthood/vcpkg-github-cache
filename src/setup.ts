/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import * as core from "@actions/core";

import { buildFeedUrl } from "./shared/cache";
import { runCommand } from "./shared/command";
import {
  normalizeTokenKind,
  parseBoolean,
  resolveFeedOwner,
  resolveUsername,
} from "./shared/inputs";
import { ensureMonoAvailable } from "./shared/mono";
import { configureNugetSource } from "./shared/nuget";
import { setupOutput } from "./shared/setup-output";
import { createTraceLogger } from "./shared/trace";
import {
  buildNugetCommand,
  bootstrapVcpkg,
  fetchNuget,
  readVcpkgVersion,
  resolveVcpkgPaths,
  verifyVcpkgExecutable,
} from "./shared/vcpkg";

function optionalInput(name: string, defaultValue = ""): string {
  return core.getInput(name).trim() || defaultValue;
}

function summaryItem(label: string, value: string): string {
  return `${label}: ${value}`;
}

const BINARY_SOURCES_ENV = "VCPKG_BINARY_SOURCES";

async function writeSummary(
  diagnosis: string,
  feedUrl: string,
  nugetCommand: string,
  vcpkgRoot: string,
  vcpkgVersion: string,
): Promise<void> {
  if (!process.env.GITHUB_STEP_SUMMARY) {
    return;
  }

  await core.summary
    .addHeading("vcpkg GitHub Packages cache setup", 3)
    .addList([
      summaryItem("Diagnosis", diagnosis),
      summaryItem("Feed", feedUrl),
      summaryItem("vcpkg root", vcpkgRoot),
      summaryItem("vcpkg version", vcpkgVersion),
      summaryItem("NuGet command", nugetCommand),
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
  const bootstrap = parseBoolean(optionalInput("bootstrap", "true"));
  const debug = parseBoolean(optionalInput("debug", "false"));
  const installMono = parseBoolean(optionalInput("install-mono", "true"));
  const installNuget = parseBoolean(optionalInput("install-nuget", "true"));
  const sourceName = optionalInput("source-name", "GitHubPackages");
  const trace = parseBoolean(optionalInput("trace", "false"));
  const access = optionalInput("access", "readwrite");
  const vcpkg = resolveVcpkgPaths(
    optionalInput("vcpkg-root", "vcpkg"),
    process.env.GITHUB_WORKSPACE,
  );
  const traceLogger = createTraceLogger({
    enabled: trace,
    log: (message) => core.info(message),
    secrets: [token],
  });
  const tracedRun = traceLogger.commandRunner(runCommand);

  if (debug || trace) {
    core.info(`Debug: ${debug ? "enabled" : "disabled"}`);
    core.info(`Trace: ${trace ? "enabled" : "disabled"}`);
  }

  if (trace) {
    traceLogger.input("token", token);
    traceLogger.input("token-kind", tokenKind);
    traceLogger.input("feed-owner", feedOwner);
    traceLogger.input("username", username);
    traceLogger.input("vcpkg-root", optionalInput("vcpkg-root", "vcpkg"));
    traceLogger.input("bootstrap", bootstrap ? "true" : "false");
    traceLogger.input("install-mono", installMono ? "true" : "false");
    traceLogger.input("install-nuget", installNuget ? "true" : "false");
    traceLogger.input("source-name", sourceName);
    traceLogger.input("access", access);
    traceLogger.value("platform", `${process.platform}/${process.arch}`);
    traceLogger.value("feed URL", feedUrl);
    traceLogger.path("GITHUB_WORKSPACE", process.env.GITHUB_WORKSPACE ?? "");
    traceLogger.path("vcpkg root", vcpkg.root);
    traceLogger.path("vcpkg executable", vcpkg.executable);
    traceLogger.path("vcpkg bootstrap script", vcpkg.bootstrapScript);
  }

  if (bootstrap) {
    traceLogger.decision("bootstrap vcpkg", "enabled by input");
    core.info(`Bootstrapping vcpkg at ${vcpkg.root}`);
    await traceLogger.step("bootstrap vcpkg", async () =>
      bootstrapVcpkg(vcpkg, tracedRun),
    );
  } else {
    traceLogger.decision("bootstrap vcpkg", "skipped by input");
  }

  await traceLogger.step("verify vcpkg executable", async () =>
    verifyVcpkgExecutable(vcpkg.executable),
  );
  const vcpkgVersion = await traceLogger.step("read vcpkg version", async () =>
    readVcpkgVersion(vcpkg, tracedRun),
  );
  let nugetCommand = "";
  let nugetConfigured = false;

  if (installNuget) {
    traceLogger.decision("NuGet setup", "enabled by input");
    const mono = await traceLogger.step("ensure Mono", async () =>
      ensureMonoAvailable(installMono, process.platform, tracedRun),
    );
    const nugetPath = await traceLogger.step("fetch NuGet", async () =>
      fetchNuget(vcpkg, tracedRun),
    );
    const nuget = buildNugetCommand(nugetPath);
    nugetCommand = nuget.display;
    traceLogger.path("NuGet executable", nugetPath);
    traceLogger.value("NuGet command", nugetCommand);
    await traceLogger.step("configure NuGet source", async () =>
      configureNugetSource(
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
          run: tracedRun,
          trace,
        },
      ),
    );
    nugetConfigured = true;

    if (trace) {
      core.info(`Mono required: ${mono.required ? "true" : "false"}`);
      core.info(
        `Mono installed by action: ${mono.installed ? "true" : "false"}`,
      );
      core.info(`NuGet source configured: ${sourceName}`);
    }
  } else {
    traceLogger.decision("NuGet setup", "skipped by input");
  }

  const { binarySources, diagnosis } = setupOutput(
    feedUrl,
    access,
    nugetConfigured,
  );

  core.setOutput("feed-url", feedUrl);
  core.setOutput("binary-sources", binarySources);
  core.setOutput("nuget-command", nugetCommand);
  core.setOutput("vcpkg-version", vcpkgVersion);
  core.setOutput("diagnosis", diagnosis);
  core.exportVariable(BINARY_SOURCES_ENV, binarySources);

  core.info(diagnosis);

  if (debug || trace) {
    core.info(`Token path: ${tokenKind === "github" ? "GITHUB_TOKEN" : "PAT"}`);
    core.info(`Feed owner: ${feedOwner}`);
    core.info(`NuGet username: ${username}`);
    core.info(`vcpkg root: ${vcpkg.root}`);
    core.info(`vcpkg version: ${vcpkgVersion}`);
  }

  if (trace) {
    core.info(`binary-sources: ${binarySources}`);
    core.info(`${BINARY_SOURCES_ENV}: ${binarySources}`);
    core.info(`nuget-command: ${nugetCommand}`);
  }

  if (debug || trace) {
    await writeSummary(
      diagnosis,
      feedUrl,
      nugetCommand,
      vcpkg.root,
      vcpkgVersion,
    );
  }
}

if (process.env.VCPKG_GITHUB_CACHE_IMPORT_SMOKE !== "1") {
  void run().catch((error: unknown) => {
    core.setFailed(error instanceof Error ? error.message : String(error));
  });
}
