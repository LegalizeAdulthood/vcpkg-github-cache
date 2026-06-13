/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { mkdir } from "node:fs/promises";
import * as path from "node:path";

import { describe, expect, test } from "vitest";

import { CommandResult } from "../src/shared/command";
import { PackageConfigDiscovery } from "../src/shared/package-config";
import { runRestoreProbe } from "../src/shared/restore-probe";
import { NugetCommand } from "../src/shared/vcpkg";

interface RecordedCommand {
  readonly args: readonly string[];
  readonly command: string;
}

const discovery: PackageConfigDiscovery = {
  files: [
    {
      packages: [{ id: "fmt", version: "8.0.0" }],
      path: "C:\\work\\vcpkg\\buildtrees\\packages.config",
    },
  ],
  requestedPackages: [{ id: "fmt", version: "8.0.0" }],
};

const nuget: NugetCommand = {
  args: ["nuget.exe"],
  display: "mono nuget.exe",
  file: "mono",
};

function commandResult(stdout: string): CommandResult {
  return { stderr: "", stdout };
}

function packageDirectory(args: readonly string[]): string {
  const index = args.indexOf("-PackagesDirectory");

  if (index < 0) {
    throw new Error("missing -PackagesDirectory");
  }

  return args[index + 1];
}

describe("restore probe", () => {
  test("runs exact package restore against the feed", async () => {
    const commands: RecordedCommand[] = [];
    const probe = await runRestoreProbe({
      feedUrl: "https://nuget.pkg.github.com/octo/index.json",
      nuget,
      packageConfigs: discovery,
      run: async (command, args) => {
        commands.push({ args, command });
        await mkdir(path.join(packageDirectory(args), "fmt.8.0.0"), {
          recursive: true,
        });
        return commandResult("Restored package fmt 8.0.0\n");
      },
    });

    expect(probe.restoredCount).toBe(1);
    expect(probe.result).toMatchObject({
      detail: "restored 1/1 packages",
      status: "ok",
    });
    expect(commands).toEqual([
      {
        args: [
          "nuget.exe",
          "restore",
          "C:\\work\\vcpkg\\buildtrees\\packages.config",
          "-PackagesDirectory",
          expect.any(String) as string,
          "-Source",
          "https://nuget.pkg.github.com/octo/index.json",
          "-NoHttpCache",
          "-NonInteractive",
          "-Verbosity",
          "detailed",
        ],
        command: "mono",
      },
    ]);
  });

  test("keeps probing after a restore failure", async () => {
    const commands: RecordedCommand[] = [];
    const probe = await runRestoreProbe({
      feedUrl: "https://nuget.pkg.github.com/octo/index.json",
      nuget: { args: [], display: "nuget.exe", file: "nuget.exe" },
      packageConfigs: {
        files: [
          {
            packages: [{ id: "fmt", version: "8.0.0" }],
            path: "C:\\work\\one\\packages.config",
          },
          {
            packages: [{ id: "zlib", version: "1.2.13" }],
            path: "C:\\work\\two\\packages.config",
          },
        ],
        requestedPackages: [
          { id: "fmt", version: "8.0.0" },
          { id: "zlib", version: "1.2.13" },
        ],
      },
      run: async (command, args) => {
        commands.push({ args, command });

        if (commands.length === 1) {
          throw new Error("Unauthorized");
        }

        await mkdir(path.join(packageDirectory(args), "zlib.1.2.13"), {
          recursive: true,
        });
        return commandResult("Restored package zlib 1.2.13\n");
      },
    });

    expect(commands).toHaveLength(2);
    expect(probe.restoredCount).toBe(1);
    expect(probe.result.status).toBe("failed");
    expect(probe.result.detail).toBe(
      "NuGet restore failed; restored 1/2 packages",
    );
    expect(probe.result.output).toContain("Unauthorized");
  });

  test("skips restore when NuGet is unavailable", async () => {
    const probe = await runRestoreProbe({
      feedUrl: "https://nuget.pkg.github.com/octo/index.json",
      packageConfigs: discovery,
    });

    expect(probe.result).toMatchObject({
      detail: "NuGet command unavailable",
      status: "skipped",
    });
  });
});
