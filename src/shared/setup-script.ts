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
  script.line("command_exists() {");
  script.line('  command -v "$1" >/dev/null 2>&1');
  script.line("}");
  script.blank();
  script.line("ensure_freebsd_bootstrap_packages() {");
  script.line('  missing_packages=""');
  script.line("  if ! command_exists curl; then");
  script.line('    missing_packages="${missing_packages} curl"');
  script.line("  fi");
  script.line("  if ! command_exists zip; then");
  script.line('    missing_packages="${missing_packages} zip"');
  script.line("  fi");
  script.line("  if ! command_exists unzip; then");
  script.line('    missing_packages="${missing_packages} unzip"');
  script.line("  fi");
  script.line('  if [ -n "${missing_packages}" ]; then');
  script.command("    printf", [
    posixLiteral("%s%s\\n"),
    posixLiteral("Installing FreeBSD vcpkg bootstrap packages:"),
    posixRuntimeExpression('"${missing_packages}"'),
  ]);
  script.line("    pkg install -y ${missing_packages}");
  script.line("  fi");
  script.line("}");
  script.blank();
  script.line("has_freebsd_nuget_tool() {");
  script.line("  awk '");
  script.line('    /"name": "nuget"/ { in_nuget = 1 }');
  script.line('    in_nuget && /"os": "freebsd"/ { found = 1 }');
  script.line("    in_nuget && /^[[:space:]]*}/ { in_nuget = 0 }");
  script.line("    END { exit found ? 0 : 1 }");
  script.line('  \' "${VCPKG_ROOT}/scripts/vcpkg-tools.json"');
  script.line("}");
  script.blank();
  script.line("enable_freebsd_nuget_tool() {");
  script.line('  tools_json="${VCPKG_ROOT}/scripts/vcpkg-tools.json"');
  script.line("  if has_freebsd_nuget_tool; then");
  script.command("    printf", [
    posixLiteral("%s\\n"),
    posixLiteral("FreeBSD NuGet tool metadata already available"),
  ]);
  script.line("    return");
  script.line("  fi");
  script.line('  tmp_tools_json="${tools_json}.tmp"');
  script.line("  if ! awk '");
  script.line('    BEGIN { in_block = 0; block = ""; patched = 0 }');
  script.line("    in_block {");
  script.line('      block = block $0 "\\n"');
  script.line("      if ($0 ~ /^[[:space:]]*}[,]?[[:space:]]*$/) {");
  script.line("        in_block = 0");
  script.line("        if (!patched &&");
  script.line(
    '            block ~ /"name"[[:space:]]*:[[:space:]]*"nuget"/ &&',
  );
  script.line('            block ~ /"os"[[:space:]]*:[[:space:]]*"linux"/) {');
  script.line('          printf "%s", block');
  script.line("          freebsd_block = block");
  script.line('          sub(/"os"[[:space:]]*:[[:space:]]*"linux"/,');
  script.line('              "\\"os\\": \\"freebsd\\"", freebsd_block)');
  script.line('          printf "%s", freebsd_block');
  script.line("          patched = 1");
  script.line("          next");
  script.line("        }");
  script.line('        printf "%s", block');
  script.line("        next");
  script.line("      }");
  script.line("      next");
  script.line("    }");
  script.line("    !patched && $0 ~ /^[[:space:]]*{[[:space:]]*$/ {");
  script.line("      in_block = 1");
  script.line('      block = $0 "\\n"');
  script.line("      next");
  script.line("    }");
  script.line("    { print }");
  script.line("    END { if (!patched) exit 1 }");
  script.line('  \' "${tools_json}" > "${tmp_tools_json}"; then');
  script.line('    rm -f "${tmp_tools_json}"');
  script.command("    printf", [
    posixLiteral("%s\\n"),
    posixLiteral("Unable to add FreeBSD NuGet tool metadata to vcpkg"),
  ]);
  script.line("    exit 1");
  script.line("  fi");
  script.line('  mv "${tmp_tools_json}" "${tools_json}"');
  script.command("  printf", [
    posixLiteral("%s\\n"),
    posixLiteral("Added FreeBSD NuGet tool metadata to vcpkg"),
  ]);
  script.line("}");
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
    if (plan.targetOs === "freebsd") {
      script.line("ensure_freebsd_bootstrap_packages");
    }
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
    if (plan.installMono) {
      script.command("printf", [
        posixLiteral("%s\\n"),
        posixLiteral("Ensuring Mono is available"),
      ]);
      script.line("if command_exists mono; then");
      script.command("  printf", [
        posixLiteral("%s\\n"),
        posixLiteral("Mono already available"),
      ]);
      script.line("else");
      script.command("  printf", [
        posixLiteral("%s\\n"),
        posixLiteral("Installing Mono with pkg"),
      ]);
      script.line("  pkg install -y mono");
      script.line("fi");
    } else {
      script.command("printf", [
        posixLiteral("%s\\n"),
        posixLiteral("Mono install skipped"),
      ]);
    }

    script.line("if ! command_exists mono; then");
    script.command("  printf", [
      posixLiteral("%s\\n"),
      posixLiteral(
        "Mono is required to run nuget.exe; install Mono or set install-mono true",
      ),
    ]);
    script.line("  exit 1");
    script.line("fi");
    script.blank();
    script.command("printf", [
      posixLiteral("%s\\n"),
      posixLiteral("Fetching NuGet with vcpkg"),
    ]);
    if (plan.targetOs === "freebsd") {
      script.line("enable_freebsd_nuget_tool");
    }
    script.line('if ! nuget_output=$("${vcpkg_exe}" fetch nuget 2>&1); then');
    script.command("  printf", [
      posixLiteral("%s\\n"),
      posixRuntimeExpression('"${nuget_output}"'),
    ]);
    script.command("  printf", [
      posixLiteral("%s\\n"),
      posixLiteral("vcpkg fetch nuget failed"),
    ]);
    script.line("  exit 1");
    script.line("fi");
    script.command("printf", [
      posixLiteral("%s\\n"),
      posixRuntimeExpression('"${nuget_output}"'),
    ]);
    script.line("nuget_exe=$(");
    script.line("  printf '%s\\n' \"${nuget_output}\" | awk '");
    script.line("    {");
    script.line("      candidate = $0");
    script.line('      gsub(/^"|"$/, "", candidate)');
    script.line(
      "      if (candidate ~ /\\/[Nn][Uu][Gg][Ee][Tt]\\.[Ee][Xx][Ee]$/ &&",
    );
    script.line("          $0 !~ /^Downloading/ && $0 !~ / -> /) {");
    script.line("        print candidate");
    script.line("        exit");
    script.line("      }");
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
    script.blank();
    script.line("run_nuget() {");
    script.line('  mono "${VCPKG_GITHUB_CACHE_NUGET_EXE}" "$@"');
    script.line("}");
    script.blank();
    script.command("printf", [
      posixLiteral("%s\\n"),
      posixLiteral("Configuring GitHub Packages NuGet source"),
    ]);
    script.line(
      `run_nuget sources Remove -Name ${quotePosixShellLiteral(
        plan.sourceName,
      )} -NonInteractive >/dev/null 2>&1 || true`,
    );
    script.command("run_nuget", [
      posixLiteral("sources"),
      posixLiteral("Add"),
      posixLiteral("-Source"),
      posixLiteral(plan.feedUrl),
      posixLiteral("-StorePasswordInClearText"),
      posixLiteral("-Name"),
      posixLiteral(plan.sourceName),
      posixLiteral("-UserName"),
      posixLiteral(plan.username),
      posixLiteral("-Password"),
      posixRuntimeExpression('"${VCPKG_GITHUB_CACHE_TOKEN}"'),
      posixLiteral("-ValidAuthenticationTypes"),
      posixLiteral("basic"),
      posixLiteral("-NonInteractive"),
      posixLiteral("-Verbosity"),
      posixLiteral("detailed"),
    ]);
    script.command("run_nuget", [
      posixLiteral("setapikey"),
      posixRuntimeExpression('"${VCPKG_GITHUB_CACHE_TOKEN}"'),
      posixLiteral("-Source"),
      posixLiteral(plan.feedUrl),
      posixLiteral("-NonInteractive"),
      posixLiteral("-Verbosity"),
      posixLiteral("detailed"),
    ]);
    script.command("printf", [
      posixLiteral("%s%s\\n"),
      posixLiteral("NuGet source configured: "),
      posixLiteral(plan.sourceName),
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
