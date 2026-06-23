/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { mkdir, writeFile } from "node:fs/promises";
import * as path from "node:path";

import {
  posixLiteral,
  posixRuntimeExpression,
  PosixScript,
  quotePosixShellLiteral,
} from "./posix-script";
import { SetupPlan } from "./setup-plan";

const SETUP_SCRIPT_NAME = "setup.sh";
const SETUP_ENV_NAME = "setup.env";

export interface EmittedSetupFiles {
  readonly setupEnvOutput: string;
  readonly setupEnvPath: string;
  readonly setupScriptOutput: string;
  readonly setupScriptPath: string;
}

function outputPath(directory: string, file: string): string {
  const normalized = directory.replaceAll("\\", "/").replace(/\/+$/, "");

  if (normalized === "" || normalized === ".") {
    return file;
  }

  return `${normalized}/${file}`;
}

function resolveScriptDirectory(
  directory: string,
  workspace: string | undefined,
): string {
  if (path.isAbsolute(directory)) {
    return directory;
  }

  return path.resolve(workspace?.trim() || process.cwd(), directory);
}

export function renderMinimalSetupScript(plan: SetupPlan): string {
  const script = new PosixScript();

  script.line("#!/bin/sh");
  script.line("set -eu");
  script.blank();
  script.line(
    ': "${VCPKG_GITHUB_CACHE_TOKEN:?VCPKG_GITHUB_CACHE_TOKEN is required}"',
  );
  script.line(': "${VCPKG_ROOT:=vcpkg}"');
  script.blank();
  script.command("printf", [
    posixLiteral("%s\\n"),
    posixLiteral("vcpkg GitHub Packages cache setup script"),
  ]);
  script.command("printf", [
    posixLiteral("%s\\n"),
    posixLiteral(`Target OS: ${plan.targetOs}`),
  ]);
  script.command("printf", [
    posixLiteral("%s\\n"),
    posixLiteral(`Feed: ${plan.feedUrl}`),
  ]);
  script.command("printf", [
    posixLiteral("%s\\n"),
    posixLiteral(`Source: ${plan.sourceName}`),
  ]);
  script.command("printf", [
    posixLiteral("%s%s\\n"),
    posixLiteral("vcpkg root: "),
    posixRuntimeExpression("${VCPKG_ROOT}"),
  ]);

  return script.render();
}

export function renderMinimalSetupEnvironment(plan: SetupPlan): string {
  const script = new PosixScript();

  script.line("# vcpkg-github-cache setup environment");
  script.line(
    `export VCPKG_BINARY_SOURCES=${quotePosixShellLiteral(plan.binarySources)}`,
  );

  return script.render();
}

export async function emitSetupFiles(
  plan: SetupPlan,
  workspace: string | undefined,
): Promise<EmittedSetupFiles> {
  const directory = resolveScriptDirectory(plan.scriptDirectory, workspace);
  const setupScriptPath = path.join(directory, SETUP_SCRIPT_NAME);
  const setupEnvPath = path.join(directory, SETUP_ENV_NAME);

  await mkdir(directory, { recursive: true });
  await writeFile(setupScriptPath, renderMinimalSetupScript(plan), "utf8");
  await writeFile(setupEnvPath, renderMinimalSetupEnvironment(plan), "utf8");

  return {
    setupEnvOutput: outputPath(plan.scriptDirectory, SETUP_ENV_NAME),
    setupEnvPath,
    setupScriptOutput: outputPath(plan.scriptDirectory, SETUP_SCRIPT_NAME),
    setupScriptPath,
  };
}
