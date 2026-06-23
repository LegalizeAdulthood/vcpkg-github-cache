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

export function renderSetupScript(plan: SetupPlan): string {
  const script = new PosixScript();

  script.line("#!/bin/sh");
  script.line("set -eu");
  script.blank();
  script.line(
    ': "${VCPKG_GITHUB_CACHE_TOKEN:?VCPKG_GITHUB_CACHE_TOKEN is required}"',
  );
  script.line('if [ -z "${VCPKG_ROOT:-}" ]; then');
  script.line(`  VCPKG_ROOT=${quotePosixShellLiteral(plan.vcpkgRootInput)}`);
  script.line("fi");
  script.line("export VCPKG_ROOT");
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
  script.line('vcpkg_exe="${VCPKG_ROOT}/vcpkg"');
  script.blank();

  if (plan.bootstrap) {
    script.command("printf", [
      posixLiteral("%s\\n"),
      posixLiteral("Bootstrapping vcpkg"),
    ]);
    script.line('"${VCPKG_ROOT}/bootstrap-vcpkg.sh"');
  } else {
    script.command("printf", [
      posixLiteral("%s\\n"),
      posixLiteral("vcpkg bootstrap skipped"),
    ]);
  }

  script.blank();

  if (plan.installNuget) {
    script.command("printf", [
      posixLiteral("%s\\n"),
      posixLiteral("Fetching NuGet with vcpkg"),
    ]);
    script.line('nuget_output=$("${vcpkg_exe}" fetch nuget)');
    script.command("printf", [
      posixLiteral("%s\\n"),
      posixRuntimeExpression('"${nuget_output}"'),
    ]);
    script.line("nuget_exe=$(");
    script.line("  printf '%s\\n' \"${nuget_output}\" | awk '");
    script.line(
      "    /[Nn][Uu][Gg][Ee][Tt]\\.[Ee][Xx][Ee]$/ && $0 !~ /^Downloading/ && $0 !~ / -> / {",
    );
    script.line('      gsub(/^"|"$/, "")');
    script.line("      print");
    script.line("      exit");
    script.line("    }");
    script.line("  '");
    script.line(")");
    script.line('if [ -z "${nuget_exe}" ]; then');
    script.command("printf", [
      posixLiteral("%s\\n"),
      posixLiteral("vcpkg fetch nuget did not report a nuget.exe path"),
    ]);
    script.line("  exit 1");
    script.line("fi");
    script.line('VCPKG_GITHUB_CACHE_NUGET_EXE="${nuget_exe}"');
    script.line('VCPKG_GITHUB_CACHE_NUGET_COMMAND="mono ${nuget_exe}"');
    script.line("export VCPKG_GITHUB_CACHE_NUGET_EXE");
    script.line("export VCPKG_GITHUB_CACHE_NUGET_COMMAND");
    script.command("printf", [
      posixLiteral("%s%s\\n"),
      posixLiteral("NuGet executable: "),
      posixRuntimeExpression('"${VCPKG_GITHUB_CACHE_NUGET_EXE}"'),
    ]);
    script.command("printf", [
      posixLiteral("%s%s\\n"),
      posixLiteral("NuGet command: "),
      posixRuntimeExpression('"${VCPKG_GITHUB_CACHE_NUGET_COMMAND}"'),
    ]);
  } else {
    script.command("printf", [
      posixLiteral("%s\\n"),
      posixLiteral("NuGet fetch skipped"),
    ]);
  }

  return script.render();
}

export function renderSetupEnvironment(plan: SetupPlan): string {
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
  await writeFile(setupScriptPath, renderSetupScript(plan), "utf8");
  await writeFile(setupEnvPath, renderSetupEnvironment(plan), "utf8");

  return {
    setupEnvOutput: outputPath(plan.scriptDirectory, SETUP_ENV_NAME),
    setupEnvPath,
    setupScriptOutput: outputPath(plan.scriptDirectory, SETUP_SCRIPT_NAME),
    setupScriptPath,
  };
}
