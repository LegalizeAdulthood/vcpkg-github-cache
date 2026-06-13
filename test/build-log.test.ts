/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { describe, expect, test } from "vitest";

import { parseBuildLog } from "../src/shared/build-log";

describe("build log parser", () => {
  test("extracts package, restore, build, and upload counts", () => {
    const facts =
      parseBuildLog(`2026-06-13T00:00:00Z \x1b[36mThe following packages will be built and installed:\x1b[0m
2026-06-13T00:00:01Z   * boost-config:x64-linux@1.90.0#1
2026-06-13T00:00:02Z     gtest:x64-linux@1.17.0#2
2026-06-13T00:00:03Z Additional packages (*) will be modified to complete this operation.
Restored 2 package(s) from NuGet
Building ncurses:x64-linux@6.5#3...
Starting submission of ncurses:x64-linux to 1 binary cache(s)
Uploading binaries for ncurses:x64-linux to NuGet
Completed submission of ncurses:x64-linux to 1 binary cache(s)
NuGet Config files used:
  /home/runner/.nuget/NuGet/NuGet.Config
Feeds used:
  https://nuget.pkg.github.com/octo/index.json
`);

    expect(facts.requestedCount).toBe(2);
    expect(facts.restoredCount).toBe(2);
    expect(facts.builtCount).toBe(1);
    expect(facts.uploadedCount).toBe(1);
    expect(facts.submissionsStarted).toBe(1);
    expect(facts.uploadsAttempted).toBe(1);
    expect(facts.zeroCacheSubmissions).toBe(0);
    expect(facts.writeDeniedPackages).toEqual([]);
    expect(facts.builtPackages).toEqual(["ncurses:x64-linux@6.5#3"]);
    expect(facts.nugetConfigPaths).toEqual([
      "/home/runner/.nuget/NuGet/NuGet.Config",
    ]);
    expect(facts.feeds).toEqual([
      "https://nuget.pkg.github.com/octo/index.json",
    ]);
  });

  test("extracts auth, quota, and zero-cache upload evidence", () => {
    const facts = parseBuildLog(`
Response status code does not indicate success: 403 (Forbidden).
Account has reached its billing limit.
Completed submission of boost:x64-linux to 0 binary cache(s)
`);

    expect(facts.failedHttpStatuses).toEqual(["403"]);
    expect(facts.authMessages).toEqual([
      "Response status code does not indicate success: 403 (Forbidden).",
    ]);
    expect(facts.quotaMessages).toEqual([
      "Account has reached its billing limit.",
    ]);
    expect(facts.uploadedCount).toBeUndefined();
    expect(facts.zeroCacheSubmissions).toBe(1);
    expect(facts.writeDeniedPackages).toEqual([]);
  });

  test("counts restored packages when NuGet lists package identities", () => {
    const facts = parseBuildLog(`
Restored NuGet package boost_config_x64-linux.1.90.0-vcpkgabcdef.
Restored NuGet package boost_config_x64-linux.1.90.0-vcpkgabcdef.
Restored NuGet package gtest_x64-linux.1.17.0-vcpkg123456.
`);

    expect(facts.restoredCount).toBe(2);
    expect(facts.restoredPackages).toEqual([
      "boost_config_x64-linux",
      "gtest_x64-linux",
    ]);
  });

  test("extracts packages denied write access from NuGet push failures", () => {
    const facts = parseBuildLog(`
Uploading binaries for vcpkg-make:x64-linux@2026-01-01 to NuGet from https://nuget.pkg.github.com/octo/index.json
Waiting for 1 remaining binary cache submissions...
error: /usr/bin/mono /work/vcpkg/downloads/tools/nuget.exe push -ForceEnglishOutput -Verbosity detailed -NonInteractive /work/vcpkg/buildtrees/gtest_x64-linux.1.17.0-vcpkg4cc21124af27493ac1787e1dc10c3210a797392776b8c63de971fa570703f0b9.nupkg -Timeout 100 -Source https://nuget.pkg.github.com/octo/index.json failed with exit code 1
WARNING: Your request could not be authenticated by the GitHub Packages service.
Forbidden https://nuget.pkg.github.com/octo/ 265ms
Response status code does not indicate success: 403 (Forbidden).
System.Net.Http.HttpRequestException: Response status code does not indicate success: 403 (Forbidden).
`);

    expect(facts.writeDeniedPackages).toEqual([
      {
        packageId: "gtest_x64-linux",
        version:
          "1.17.0-vcpkg4cc21124af27493ac1787e1dc10c3210a797392776b8c63de971fa570703f0b9",
      },
    ]);
  });
});
