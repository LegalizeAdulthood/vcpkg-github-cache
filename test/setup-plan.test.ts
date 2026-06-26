/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import * as path from "node:path";

import { describe, expect, test } from "vitest";

import { buildSetupPlan } from "../src/shared/setup-plan";

describe("setup plan", () => {
  test("builds the default current-runner setup plan", () => {
    const plan = buildSetupPlan({
      repository: "octo/repo",
      workspace: "/work/repo",
    });

    expect(plan).toMatchObject({
      access: "readwrite",
      binarySources:
        "clear;nuget,https://nuget.pkg.github.com/octo/index.json,readwrite",
      bootstrap: true,
      debug: false,
      executionMode: "run",
      feedOwner: "octo",
      feedUrl: "https://nuget.pkg.github.com/octo/index.json",
      installMono: true,
      installNuget: true,
      scriptDirectory: ".vcpkg-github-cache",
      sourceName: "GitHubPackages",
      targetOs: "current",
      tokenKind: "github",
      trace: false,
      username: "octo",
      vcpkgRootInput: "vcpkg",
    });
    expect(plan.vcpkg.root).toBe(path.resolve("/work/repo", "vcpkg"));
  });

  test("builds a FreeBSD script-emission setup plan", () => {
    const plan = buildSetupPlan({
      accessInput: "readonly",
      actor: "builder",
      bootstrapInput: "false",
      debugInput: "true",
      executionModeInput: "emit-script",
      feedOwnerInput: "packages",
      installMonoInput: "false",
      installNugetInput: "false",
      scriptDirectoryInput: "out/cache",
      sourceNameInput: "Cache",
      targetOsInput: "freebsd",
      tokenKindInput: "pat",
      traceInput: "true",
      usernameInput: "",
      vcpkgRootInput: "deps/vcpkg",
      workspace: "/work/repo",
    });

    expect(plan).toMatchObject({
      access: "readonly",
      binarySources: "clear",
      bootstrap: false,
      debug: true,
      executionMode: "emit-script",
      feedOwner: "packages",
      feedUrl: "https://nuget.pkg.github.com/packages/index.json",
      installMono: false,
      installNuget: false,
      scriptDirectory: "out/cache",
      sourceName: "Cache",
      targetOs: "freebsd",
      tokenKind: "pat",
      trace: true,
      username: "builder",
      vcpkgRootInput: "deps/vcpkg",
    });
    expect(plan.vcpkg.root).toBe(path.resolve("/work/repo", "deps/vcpkg"));
  });

  test("builds an OpenBSD script-emission setup plan", () => {
    const plan = buildSetupPlan({
      executionModeInput: "emit-script",
      repository: "octo/repo",
      targetOsInput: "openbsd",
      workspace: "/work/repo",
    });

    expect(plan).toMatchObject({
      executionMode: "emit-script",
      feedOwner: "octo",
      targetOs: "openbsd",
    });
  });

  test("builds a NetBSD script-emission setup plan", () => {
    const plan = buildSetupPlan({
      executionModeInput: "emit-script",
      repository: "octo/repo",
      targetOsInput: "netbsd",
      workspace: "/work/repo",
    });

    expect(plan).toMatchObject({
      executionMode: "emit-script",
      feedOwner: "octo",
      targetOs: "netbsd",
    });
  });
});
