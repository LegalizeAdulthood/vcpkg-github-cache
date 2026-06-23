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
  renderMinimalSetupEnvironment,
  renderMinimalSetupScript,
} from "../src/shared/setup-script";

describe("setup script emission", () => {
  test("renders a minimal POSIX setup script", () => {
    const plan = buildSetupPlan({
      executionModeInput: "emit-script",
      repository: "octo/repo",
      targetOsInput: "freebsd",
    });
    const script = renderMinimalSetupScript(plan);

    expect(script).toContain("#!/bin/sh\nset -eu\n");
    expect(script).toContain(
      ': "${VCPKG_GITHUB_CACHE_TOKEN:?VCPKG_GITHUB_CACHE_TOKEN is required}"',
    );
    expect(script).toContain(': "${VCPKG_ROOT:=vcpkg}"');
    expect(script).toContain(
      "printf '%s\\n' 'vcpkg GitHub Packages cache setup script'",
    );
    expect(script).toContain("printf '%s\\n' 'Target OS: freebsd'");
    expect(script).toContain(
      "printf '%s\\n' 'Feed: https://nuget.pkg.github.com/octo/index.json'",
    );
  });

  test("renders a dot-sourceable placeholder environment file", () => {
    expect(renderMinimalSetupEnvironment()).toBe(
      "# vcpkg-github-cache setup environment\n" +
        "# VCPKG_BINARY_SOURCES is emitted by a later setup slice.\n",
    );
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
      "setup environment",
    );
  });
});
