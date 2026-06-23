/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import * as core from "@actions/core";

import { runCommand } from "./shared/command";
import { ensureMonoAvailable } from "./shared/mono";
import { configureNugetSource } from "./shared/nuget";
import { setupOutput } from "./shared/setup-output";
import { buildSetupPlan } from "./shared/setup-plan";
import { createTraceLogger } from "./shared/trace";
import {
  buildNugetCommand,
  bootstrapVcpkg,
  fetchNuget,
  readVcpkgVersion,
  verifyVcpkgExecutable,
} from "./shared/vcpkg";

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

  const plan = buildSetupPlan({
    accessInput: core.getInput("access"),
    actor: process.env.GITHUB_ACTOR,
    bootstrapInput: core.getInput("bootstrap"),
    debugInput: core.getInput("debug"),
    executionModeInput: core.getInput("execution-mode"),
    feedOwnerInput: core.getInput("feed-owner"),
    installMonoInput: core.getInput("install-mono"),
    installNugetInput: core.getInput("install-nuget"),
    repository: process.env.GITHUB_REPOSITORY,
    scriptDirectoryInput: core.getInput("script-directory"),
    sourceNameInput: core.getInput("source-name"),
    targetOsInput: core.getInput("target-os"),
    tokenKindInput: core.getInput("token-kind"),
    traceInput: core.getInput("trace"),
    usernameInput: core.getInput("username"),
    vcpkgRootInput: core.getInput("vcpkg-root"),
    workspace: process.env.GITHUB_WORKSPACE,
  });
  const traceLogger = createTraceLogger({
    enabled: plan.trace,
    log: (message) => core.info(message),
    secrets: [token],
  });
  const tracedRun = traceLogger.commandRunner(runCommand);

  if (plan.debug || plan.trace) {
    core.info(`Debug: ${plan.debug ? "enabled" : "disabled"}`);
    core.info(`Trace: ${plan.trace ? "enabled" : "disabled"}`);
  }

  if (plan.trace) {
    traceLogger.input("token", token);
    traceLogger.input("token-kind", plan.tokenKind);
    traceLogger.input("feed-owner", plan.feedOwner);
    traceLogger.input("username", plan.username);
    traceLogger.input("vcpkg-root", plan.vcpkgRootInput);
    traceLogger.input("bootstrap", plan.bootstrap ? "true" : "false");
    traceLogger.input("install-mono", plan.installMono ? "true" : "false");
    traceLogger.input("install-nuget", plan.installNuget ? "true" : "false");
    traceLogger.input("source-name", plan.sourceName);
    traceLogger.input("access", plan.access);
    traceLogger.input("execution-mode", plan.executionMode);
    traceLogger.input("target-os", plan.targetOs);
    traceLogger.input("script-directory", plan.scriptDirectory);
    traceLogger.value("platform", `${process.platform}/${process.arch}`);
    traceLogger.value("feed URL", plan.feedUrl);
    traceLogger.value("planned binary sources", plan.binarySources);
    traceLogger.path("GITHUB_WORKSPACE", process.env.GITHUB_WORKSPACE ?? "");
    traceLogger.path("vcpkg root", plan.vcpkg.root);
    traceLogger.path("vcpkg executable", plan.vcpkg.executable);
    traceLogger.path("vcpkg bootstrap script", plan.vcpkg.bootstrapScript);
  }

  if (plan.executionMode === "run" && plan.targetOs !== "current") {
    throw new Error(
      "target-os is only supported with execution-mode=emit-script",
    );
  }

  if (plan.executionMode === "emit-script") {
    throw new Error("execution-mode=emit-script is not implemented yet");
  }

  if (plan.bootstrap) {
    traceLogger.decision("bootstrap vcpkg", "enabled by input");
    core.info(`Bootstrapping vcpkg at ${plan.vcpkg.root}`);
    await traceLogger.step("bootstrap vcpkg", async () =>
      bootstrapVcpkg(plan.vcpkg, tracedRun),
    );
  } else {
    traceLogger.decision("bootstrap vcpkg", "skipped by input");
  }

  await traceLogger.step("verify vcpkg executable", async () =>
    verifyVcpkgExecutable(plan.vcpkg.executable),
  );
  const vcpkgVersion = await traceLogger.step("read vcpkg version", async () =>
    readVcpkgVersion(plan.vcpkg, tracedRun),
  );
  let nugetCommand = "";
  let nugetConfigured = false;

  if (plan.installNuget) {
    traceLogger.decision("NuGet setup", "enabled by input");
    const mono = await traceLogger.step("ensure Mono", async () =>
      ensureMonoAvailable(plan.installMono, process.platform, tracedRun),
    );
    const nugetPath = await traceLogger.step("fetch NuGet", async () =>
      fetchNuget(plan.vcpkg, tracedRun),
    );
    const nuget = buildNugetCommand(nugetPath);
    nugetCommand = nuget.display;
    traceLogger.path("NuGet executable", nugetPath);
    traceLogger.value("NuGet command", nugetCommand);
    await traceLogger.step("configure NuGet source", async () =>
      configureNugetSource(
        nuget,
        {
          feedUrl: plan.feedUrl,
          sourceName: plan.sourceName,
          token,
          username: plan.username,
        },
        {
          debug: plan.debug,
          log: (message) => core.info(message),
          run: tracedRun,
          trace: plan.trace,
        },
      ),
    );
    nugetConfigured = true;

    if (plan.trace) {
      core.info(`Mono required: ${mono.required ? "true" : "false"}`);
      core.info(
        `Mono installed by action: ${mono.installed ? "true" : "false"}`,
      );
      core.info(`NuGet source configured: ${plan.sourceName}`);
    }
  } else {
    traceLogger.decision("NuGet setup", "skipped by input");
  }

  const { binarySources, diagnosis } = setupOutput(
    plan.feedUrl,
    plan.access,
    nugetConfigured,
  );

  core.setOutput("feed-url", plan.feedUrl);
  core.setOutput("binary-sources", binarySources);
  core.setOutput("nuget-command", nugetCommand);
  core.setOutput("vcpkg-version", vcpkgVersion);
  core.setOutput("diagnosis", diagnosis);
  core.exportVariable(BINARY_SOURCES_ENV, binarySources);

  core.info(diagnosis);

  if (plan.debug || plan.trace) {
    core.info(
      `Token path: ${plan.tokenKind === "github" ? "GITHUB_TOKEN" : "PAT"}`,
    );
    core.info(`Feed owner: ${plan.feedOwner}`);
    core.info(`NuGet username: ${plan.username}`);
    core.info(`vcpkg root: ${plan.vcpkg.root}`);
    core.info(`vcpkg version: ${vcpkgVersion}`);
  }

  if (plan.trace) {
    core.info(`binary-sources: ${binarySources}`);
    core.info(`${BINARY_SOURCES_ENV}: ${binarySources}`);
    core.info(`nuget-command: ${nugetCommand}`);
  }

  if (plan.debug || plan.trace) {
    await writeSummary(
      diagnosis,
      plan.feedUrl,
      nugetCommand,
      plan.vcpkg.root,
      vcpkgVersion,
    );
  }
}

if (process.env.VCPKG_GITHUB_CACHE_IMPORT_SMOKE !== "1") {
  void run().catch((error: unknown) => {
    core.setFailed(error instanceof Error ? error.message : String(error));
  });
}
