/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { Buffer } from "node:buffer";

import { describe, expect, test } from "vitest";

import {
  buildBasicAuthorization,
  buildBearerAuthorization,
  extractNugetVersion,
  runAnalyzerLiveProbes,
} from "../src/shared/analyze-probes";
import { CommandResult } from "../src/shared/command";
import { VcpkgPaths } from "../src/shared/vcpkg";

interface RecordedCommand {
  readonly args: readonly string[];
  readonly command: string;
}

const vcpkg: VcpkgPaths = {
  bootstrapScript: "C:\\vcpkg\\bootstrap-vcpkg.bat",
  executable: "C:\\vcpkg\\vcpkg.exe",
  root: "C:\\vcpkg",
};

function commandResult(stdout: string): CommandResult {
  return { stderr: "", stdout };
}

describe("analyzer live probes", () => {
  test("builds feed authorization headers", () => {
    expect(buildBasicAuthorization("octo", "token")).toBe(
      `Basic ${Buffer.from("octo:token", "utf8").toString("base64")}`,
    );
    expect(buildBearerAuthorization("token")).toBe("Bearer token");
  });

  test("extracts NuGet version output", () => {
    expect(extractNugetVersion("NuGet Version: 7.6.0.59\nusage")).toBe(
      "7.6.0.59",
    );
    expect(extractNugetVersion("\nNuGet Command Line\n")).toBe(
      "NuGet Command Line",
    );
  });

  test("runs feed, vcpkg, and NuGet probes", async () => {
    const commands: RecordedCommand[] = [];
    const probes = await runAnalyzerLiveProbes({
      feedUrl: "https://nuget.pkg.github.com/octo/index.json",
      httpProbe: async () => ({ statusCode: 200, statusMessage: "OK" }),
      platform: "win32",
      run: async (command, args) => {
        commands.push({ args, command });

        if (args[0] === "version") {
          return commandResult("vcpkg package manager version 2026\n");
        }

        if (args[0] === "fetch") {
          return commandResult("C:\\tools\\nuget.exe\n");
        }

        if (args[0] === "help") {
          return commandResult("NuGet Version: 7.6.0.59\n");
        }

        return commandResult("Registered Sources:\n  1. GitHubPackages\n");
      },
      token: "token",
      username: "octo",
      vcpkg,
    });

    expect(probes.feedBasicAuth.status).toBe("ok");
    expect(probes.feedBearerAuth.status).toBe("ok");
    expect(probes.vcpkgVersion.detail).toBe(
      "vcpkg package manager version 2026",
    );
    expect(probes.vcpkgNuget.detail).toBe("C:\\tools\\nuget.exe");
    expect(probes.nugetVersion.detail).toBe("7.6.0.59");
    expect(probes.nugetSources.output).toContain("GitHubPackages");
    expect(commands).toEqual([
      { args: ["version"], command: "C:\\vcpkg\\vcpkg.exe" },
      { args: ["fetch", "nuget"], command: "C:\\vcpkg\\vcpkg.exe" },
      { args: ["help"], command: "C:\\tools\\nuget.exe" },
      {
        args: ["sources", "List", "-Format", "Detailed", "-NonInteractive"],
        command: "C:\\tools\\nuget.exe",
      },
    ]);
  });

  test("keeps collecting diagnostics after probe failures", async () => {
    const probes = await runAnalyzerLiveProbes({
      feedUrl: "https://nuget.pkg.github.com/octo/index.json",
      httpProbe: async () => ({
        statusCode: 401,
        statusMessage: "Unauthorized",
      }),
      platform: "linux",
      run: async (_command, args) => {
        if (args[0] === "version") {
          return commandResult("vcpkg package manager version 2026\n");
        }

        throw new Error("nuget unavailable");
      },
      token: "token",
      username: "octo",
      vcpkg,
    });

    expect(probes.feedBasicAuth.status).toBe("failed");
    expect(probes.feedBearerAuth.status).toBe("failed");
    expect(probes.vcpkgVersion.status).toBe("ok");
    expect(probes.vcpkgNuget.status).toBe("failed");
    expect(probes.nugetVersion.status).toBe("skipped");
    expect(probes.nugetSources.status).toBe("skipped");
  });
});
