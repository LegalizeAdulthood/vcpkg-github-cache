/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { describe, expect, test } from "vitest";

import { parseBuildLog } from "../src/shared/build-log";
import { formatSystemDependencyReportTable } from "../src/shared/system-dependency-report";

describe("build log parser", () => {
  test("extracts package, restore, build, and upload counts", () => {
    const facts =
      parseBuildLog(`2026-06-13T00:00:00Z \x1b[36mThe following packages will be built and installed:\x1b[0m
2026-06-13T00:00:01Z   * boost-config:x64-linux@1.90.0#1
2026-06-13T00:00:02Z     gtest:x64-linux@1.17.0#2
2026-06-13T00:00:03Z Additional packages (*) will be modified to complete this operation.
Restored 2 package(s) from NuGet
Building ncurses:x64-linux@6.5#3...
ncurses:x64-linux package ABI: 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
Elapsed time to handle ncurses:x64-linux: 42 s
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
    expect(facts.packageAbiHashes).toEqual([
      {
        abiHash:
          "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        packageId: "ncurses_x64-linux",
        packageSpec: "ncurses:x64-linux",
      },
    ]);
    expect(facts.packageHandleTimes).toEqual([
      {
        elapsed: "42 s",
        packageId: "ncurses_x64-linux",
        packageSpec: "ncurses:x64-linux",
      },
    ]);
    expect(facts.packageUploadStatuses).toEqual([
      {
        packageId: "ncurses_x64-linux",
        packageSpec: "ncurses:x64-linux",
        status: "succeeded",
      },
    ]);
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
    expect(facts.packageUploadStatuses).toEqual([
      {
        packageId: "boost_x64-linux",
        packageSpec: "boost:x64-linux",
        status: "failed",
      },
    ]);
    expect(facts.writeDeniedPackages).toEqual([]);
  });

  test("ignores ctest numbers that look like http status codes", () => {
    const facts = parseBuildLog(`
Restored 33 package(s) from NuGet in 8.7 s.
          Start  401: TestParameterCommand.longFilenameExtensionOK
  398/1226 Test  #401: TestParameterCommand.longFilenameExtensionOK .......... Passed
          Start  403: TestParameterCommand.mapSpecifiesSubdir
  400/1226 Test  #403: TestParameterCommand.mapSpecifiesSubdir ............... Passed
`);

    expect(facts.restoredCount).toBe(33);
    expect(facts.authMessages).toEqual([]);
    expect(facts.failedHttpStatuses).toEqual([]);
  });

  test("ignores CMake and MSBuild lines that look like build starts", () => {
    const facts = parseBuildLog(`
-- Building for: Visual Studio 17 2022
Restored 25 package(s) from NuGet in 10 s.
  Building Custom Rule D:/a/project/project/algos/CMakeLists.txt
  Building documentation text file
`);

    expect(facts.restoredCount).toBe(25);
    expect(facts.builtCount).toBeUndefined();
    expect(facts.builtPackages).toEqual([]);
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

  test("extracts missing system dependencies", () => {
    const facts = parseBuildLog(`
Building boost-cmake:x64-freebsd@1.90.0#1...
Could not find patchelf. Please install it via your package manager.
Building ncurses:x64-freebsd@6.5#3...
Could not find Z_VCPKG_MAKE using the following names: gmake
-- Running vcpkg install - done
Bootstrapping vcpkg
Could not find tar. Please install it (and other dependencies) with:
CMake Error at config/cmake/configure_trn.cmake:123 (message):
  Couldn't locate preferred shell 'bash'
Could NOT find BISON (missing: BISON_EXECUTABLE)
`);

    expect(facts.missingSystemDependencies).toEqual([
      {
        evidence:
          "Could not find patchelf. Please install it via your package manager.",
        neededBy: "boost-cmake:x64-freebsd@1.90.0#1",
        suggestedPackage: "patchelf",
        tool: "patchelf",
      },
      {
        evidence:
          "Could not find Z_VCPKG_MAKE using the following names: gmake",
        neededBy: "ncurses:x64-freebsd@6.5#3",
        suggestedPackage: "gmake",
        tool: "gmake",
      },
      {
        evidence:
          "Could not find tar. Please install it (and other dependencies) with:",
        neededBy: "vcpkg bootstrap",
        suggestedPackage: "tar",
        tool: "tar",
      },
      {
        evidence: "Couldn't locate preferred shell 'bash'",
        neededBy: "project configure",
        suggestedPackage: "bash",
        tool: "bash",
      },
      {
        evidence: "Could NOT find BISON (missing: BISON_EXECUTABLE)",
        neededBy: "project configure",
        suggestedPackage: "bison",
        tool: "bison",
      },
    ]);
    expect(
      formatSystemDependencyReportTable(facts.missingSystemDependencies ?? []),
    ).toContain("| Tool | Suggested Package | Needed By | Evidence |");
    expect(facts.vcpkgInstallSucceeded).toBe(true);
  });

  test("extracts OpenBSD missing system dependencies", () => {
    const facts = parseBuildLog(`
Bootstrapping vcpkg
env: curl: No such file or directory
/bin/sh: tar: not found
error: vcpkg was unable to find a libcurl.so.4, libcurl-gnutls.so.4, or libcurl-nss.so.4 to use on this system. Please install libcurl from your system package manager and retry vcpkg.
-- Running vcpkg install - done
Building sqlite3:x64-openbsd@3.50.4#1...
pkg_add: can't find automake
sh: gmake: not found
-- Running vcpkg install - done
cmake: not found
Couldn't locate preferred shell 'bash'
Could NOT find BISON (missing: BISON_EXECUTABLE)
`);

    expect(facts.missingSystemDependencies).toEqual([
      {
        evidence: "env: curl: No such file or directory",
        neededBy: "vcpkg bootstrap",
        suggestedPackage: "curl",
        tool: "curl",
      },
      {
        evidence: "/bin/sh: tar: not found",
        neededBy: "vcpkg bootstrap",
        suggestedPackage: "tar",
        tool: "tar",
      },
      {
        evidence:
          "error: vcpkg was unable to find a libcurl.so.4, libcurl-gnutls.so.4, or libcurl-nss.so.4 to use on this system. Please install libcurl from your system package manager and retry vcpkg.",
        neededBy: "vcpkg bootstrap",
        suggestedPackage: "curl",
        tool: "libcurl",
      },
      {
        evidence: "pkg_add: can't find automake",
        neededBy: "sqlite3:x64-openbsd@3.50.4#1",
        suggestedPackage: "automake",
        tool: "automake",
      },
      {
        evidence: "sh: gmake: not found",
        neededBy: "sqlite3:x64-openbsd@3.50.4#1",
        suggestedPackage: "gmake",
        tool: "gmake",
      },
      {
        evidence: "cmake: not found",
        neededBy: "project configure",
        suggestedPackage: "cmake",
        tool: "cmake",
      },
      {
        evidence: "Couldn't locate preferred shell 'bash'",
        neededBy: "project configure",
        suggestedPackage: "bash",
        tool: "bash",
      },
      {
        evidence: "Could NOT find BISON (missing: BISON_EXECUTABLE)",
        neededBy: "project configure",
        suggestedPackage: "bison",
        tool: "bison",
      },
    ]);
    expect(
      formatSystemDependencyReportTable(facts.missingSystemDependencies ?? []),
    ).toContain("| Tool | Suggested Package | Needed By | Evidence |");
  });

  test("extracts FreeBSD vcpkg tool source rebuilds", () => {
    const facts = parseBuildLog(`
Restoring FreeBSD vcpkg tool package: vcpkg-tool_freebsd-x64 1.0.0-vcpkgtoolabcdef0123456789
FreeBSD vcpkg tool package not restored
Bootstrapping vcpkg
Published FreeBSD vcpkg tool package
`);

    expect(facts.vcpkgTool).toEqual({
      packageId: "vcpkg-tool_freebsd-x64",
      publishStatus: "published",
      status: "built-from-source",
      version: "1.0.0-vcpkgtoolabcdef0123456789",
    });
  });

  test("extracts FreeBSD vcpkg tool restore hits", () => {
    const facts = parseBuildLog(`
Restoring FreeBSD vcpkg tool package: vcpkg-tool_freebsd-x64 1.0.0-vcpkgtoolabcdef0123456789
Restored cached FreeBSD vcpkg tool
vcpkg bootstrap skipped: cached tool restored
`);

    expect(facts.vcpkgTool).toEqual({
      packageId: "vcpkg-tool_freebsd-x64",
      publishStatus: "not-attempted",
      status: "restored",
      version: "1.0.0-vcpkgtoolabcdef0123456789",
    });
  });

  test("extracts OpenBSD vcpkg tool source rebuilds", () => {
    const facts = parseBuildLog(`
Restoring OpenBSD vcpkg tool package: vcpkg-tool_openbsd-x64 1.0.0-vcpkgtoolabcdef0123456789
OpenBSD vcpkg tool package not restored
Bootstrapping vcpkg
Published OpenBSD vcpkg tool package
`);

    expect(facts.vcpkgTool).toEqual({
      packageId: "vcpkg-tool_openbsd-x64",
      publishStatus: "published",
      status: "built-from-source",
      version: "1.0.0-vcpkgtoolabcdef0123456789",
    });
  });

  test("extracts OpenBSD vcpkg tool restore hits", () => {
    const facts = parseBuildLog(`
Restoring OpenBSD vcpkg tool package: vcpkg-tool_openbsd-x64 1.0.0-vcpkgtoolabcdef0123456789
Restored cached OpenBSD vcpkg tool
vcpkg bootstrap skipped: cached tool restored
`);

    expect(facts.vcpkgTool).toEqual({
      packageId: "vcpkg-tool_openbsd-x64",
      publishStatus: "not-attempted",
      status: "restored",
      version: "1.0.0-vcpkgtoolabcdef0123456789",
    });
  });

  test("extracts OpenBSD vcpkg tool publish failures", () => {
    const facts = parseBuildLog(`
Restoring OpenBSD vcpkg tool package: vcpkg-tool_openbsd-x64 1.0.0-vcpkgtoolabcdef0123456789
OpenBSD vcpkg tool package did not contain tools/vcpkg
Bootstrapping vcpkg
OpenBSD vcpkg tool package publish failed
`);

    expect(facts.vcpkgTool).toEqual({
      packageId: "vcpkg-tool_openbsd-x64",
      publishStatus: "failed",
      status: "built-from-source",
      version: "1.0.0-vcpkgtoolabcdef0123456789",
    });
  });

  test("extracts OpenBSD vcpkg tool skipped publishes", () => {
    const facts = parseBuildLog(`
Restoring OpenBSD vcpkg tool package: vcpkg-tool_openbsd-x64 1.0.0-vcpkgtoolabcdef0123456789
OpenBSD vcpkg tool package not restored
Bootstrapping vcpkg
OpenBSD vcpkg tool package skipped: vcpkg is missing
`);

    expect(facts.vcpkgTool).toEqual({
      packageId: "vcpkg-tool_openbsd-x64",
      publishStatus: "skipped",
      status: "not-restored",
      version: "1.0.0-vcpkgtoolabcdef0123456789",
    });
  });

  test("does not mark the vcpkg tool built when bootstrap fails early", () => {
    const facts = parseBuildLog(`
Restoring OpenBSD vcpkg tool package: vcpkg-tool_openbsd-x64 1.0.0-vcpkgtoolabcdef0123456789
OpenBSD vcpkg tool package not restored
Bootstrapping vcpkg
Could not find unzip. Please install it.
`);

    expect(facts.vcpkgTool).toEqual({
      packageId: "vcpkg-tool_openbsd-x64",
      publishStatus: "not-attempted",
      status: "not-restored",
      version: "1.0.0-vcpkgtoolabcdef0123456789",
    });
  });
});
