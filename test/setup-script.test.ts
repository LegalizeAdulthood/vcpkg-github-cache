/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";

import { describe, expect, test } from "vitest";

import { buildSetupPlan } from "../src/shared/setup-plan";
import {
  emitSetupFiles,
  renderSetupEnvironment,
  renderSetupScript,
} from "../src/shared/setup-script";

describe("setup script emission", () => {
  test("renders a minimal POSIX setup script", () => {
    const plan = buildSetupPlan({
      executionModeInput: "emit-script",
      repository: "octo/repo",
      targetOsInput: "freebsd",
    });
    const script = renderSetupScript(plan);

    expect(script).toContain("#!/bin/sh\nset -eu\n");
    expect(script).toContain("command_exists() {\n");
    expect(script).toContain('  command -v "$1" >/dev/null 2>&1\n');
    expect(script).toContain(
      ': "${VCPKG_GITHUB_CACHE_TOKEN:?VCPKG_GITHUB_CACHE_TOKEN is required}"',
    );
    expect(script).toContain('if [ -z "${VCPKG_ROOT:-}" ]; then');
    expect(script).toContain("  VCPKG_ROOT='vcpkg'");
    expect(script).toContain("export VCPKG_ROOT");
    expect(script).toContain(
      "printf '%s\\n' 'vcpkg GitHub Packages cache setup script'",
    );
    expect(script).toContain("printf '%s\\n' 'Target OS: freebsd'");
    expect(script).toContain(
      "printf '%s\\n' 'Feed: https://nuget.pkg.github.com/octo/index.json'",
    );
  });

  test("renders target-side vcpkg bootstrap and NuGet fetch", () => {
    const plan = buildSetupPlan({
      executionModeInput: "emit-script",
      repository: "octo/repo",
      targetOsInput: "freebsd",
      vcpkgRootInput: "deps/vcpkg",
      workspace: "C:/host/repo",
    });
    const script = renderSetupScript(plan);

    expect(script).toContain('vcpkg_exe="${VCPKG_ROOT}/vcpkg"');
    expect(script).toContain("  VCPKG_ROOT='deps/vcpkg'");
    expect(script).toContain("ensure_bsd_bootstrap_packages");
    expect(script).toContain("pkg install -y ${missing_packages}");
    expect(script).toContain("ensure_bsd_nuget_command");
    expect(script).toContain("configure_github_nuget_source");
    expect(script).toContain("has_bsd_nuget_tool");
    expect(script).toContain("enable_bsd_nuget_tool");
    expect(script).toContain("Added FreeBSD NuGet tool metadata to vcpkg");
    expect(script).toContain('\\"version\\": \\"6.8.0\\"');
    expect(script).toContain("/v6.8.0/nuget.exe");
    expect(script).toContain(
      "337d517ae6459ebb140a0c5bedff9ed205f46fafcd9a4efb83c12b12118844ce239b35885defcac4271bb1e397385e02ef3b6f585e5af7ea0d4b8868ed32310c",
    );
    expect(script).toContain("set_bsd_vcpkg_tool_identity");
    expect(script).toContain("VCPKG_TOOL_PACKAGE_ID=");
    expect(script).toContain("VCPKG_TOOL_PACKAGE_VERSION=");
    expect(script).toContain("restore_bsd_vcpkg_tool_package");
    expect(script).toContain("publish_bsd_vcpkg_tool_package");
    expect(script).toContain("vcpkg-tool_freebsd-${tool_arch}");
    expect(script).toContain("1.0.0-vcpkgtool${identity_hash}");
    expect(script).toContain("run_nuget install \\");
    expect(script).toContain("run_nuget pack \\");
    expect(script).toContain("run_nuget push \\");
    expect(script).toContain("vcpkg bootstrap skipped: cached tool restored");
    expect(script).toContain('"${VCPKG_ROOT}/bootstrap-vcpkg.sh"');
    expect(script).toContain("Ensuring Mono is available");
    expect(script).toContain("if command_exists mono; then");
    expect(script).toContain("pkg install -y mono");
    expect(script).toContain("if ! command_exists mono; then");
    expect(script).toContain(
      'if ! nuget_output=$("${vcpkg_exe}" fetch nuget 2>&1); then',
    );
    expect(script).toContain("vcpkg fetch nuget failed");
    expect(script).toContain("nuget_exe=$(");
    expect(script).toContain(
      "candidate ~ /\\/[Nn][Uu][Gg][Ee][Tt]\\.[Ee][Xx][Ee]$/",
    );
    expect(script).toContain(
      'VCPKG_GITHUB_CACHE_NUGET_COMMAND="mono ${nuget_exe}"',
    );
    expect(script).toContain("run_nuget() {\n");
    expect(script).toContain(
      "run_nuget sources Remove -Name 'GitHubPackages' -NonInteractive",
    );
    expect(script).toContain("run_nuget 'sources' 'Add'");
    expect(script).toContain(
      "'-Source' 'https://nuget.pkg.github.com/octo/index.json'",
    );
    expect(script).toContain("'-UserName' 'octo'");
    expect(script).toContain("'-Password' \"${VCPKG_GITHUB_CACHE_TOKEN}\"");
    expect(script).toContain(
      "run_nuget 'setapikey' \"${VCPKG_GITHUB_CACHE_TOKEN}\"",
    );
    expect(script).not.toContain("C:/host/repo");
  });

  test("honors skipped Mono install when NuGet is fetched", () => {
    const plan = buildSetupPlan({
      executionModeInput: "emit-script",
      installMonoInput: "false",
      repository: "octo/repo",
      targetOsInput: "freebsd",
    });
    const script = renderSetupScript(plan);

    expect(script).toContain("Mono install skipped");
    expect(script).toContain("if ! command_exists mono; then");
    expect(script).not.toContain("pkg install -y mono");
  });

  test("honors skipped vcpkg bootstrap and NuGet fetch", () => {
    const plan = buildSetupPlan({
      bootstrapInput: "false",
      executionModeInput: "emit-script",
      installNugetInput: "false",
      repository: "octo/repo",
      targetOsInput: "freebsd",
    });
    const script = renderSetupScript(plan);

    expect(script).toContain("vcpkg bootstrap skipped");
    expect(script).toContain("NuGet fetch skipped");
    expect(script).not.toContain('"${VCPKG_ROOT}/bootstrap-vcpkg.sh"');
    expect(script).not.toContain(
      'nuget_output=$("${vcpkg_exe}" fetch nuget 2>&1)',
    );
    expect(script).not.toContain("\nensure_bsd_nuget_command\n");
    expect(script).not.toContain("\nconfigure_github_nuget_source\n");
    expect(script).not.toContain("\nrestore_bsd_vcpkg_tool_package\n");
    expect(script).not.toContain("pkg install -y mono");
  });

  test("renders a dot-sourceable binary source environment file", () => {
    const plan = buildSetupPlan({
      accessInput: "readwrite",
      executionModeInput: "emit-script",
      feedOwnerInput: "octo",
      targetOsInput: "freebsd",
    });
    const env = renderSetupEnvironment(plan);

    expect(env).toBe(
      "# vcpkg-github-cache setup environment\n" +
        "export VCPKG_BINARY_SOURCES='clear;nuget,https://nuget.pkg.github.com/octo/index.json,readwrite'\n",
    );
    expect(env).toContain("https://nuget.pkg.github.com/octo/index.json");
    expect(env).toContain("readwrite");
    expect(env).not.toContain("VCPKG_GITHUB_CACHE_TOKEN");
  });

  test("writes setup files and returns relative output paths", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "vc-cache-"));
    const plan = buildSetupPlan({
      executionModeInput: "emit-script",
      repository: "octo/repo",
      scriptDirectoryInput: "out/cache",
      targetOsInput: "freebsd",
      workspace,
    });

    const files = await emitSetupFiles(plan, workspace);

    expect(files.setupScriptOutput).toBe("out/cache/setup.sh");
    expect(files.setupEnvOutput).toBe("out/cache/setup.env");
    await expect(readFile(files.setupScriptPath, "utf8")).resolves.toContain(
      "Target OS: freebsd",
    );
    await expect(readFile(files.setupEnvPath, "utf8")).resolves.toContain(
      "export VCPKG_BINARY_SOURCES=",
    );
  });
});
