/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { describe, expect, test } from "vitest";

import { CommandResult } from "../src/shared/command";
import {
  buildNugetSetApiKeyArgs,
  buildNugetSourceAddArgs,
  buildNugetSourceRemoveArgs,
  configureNugetSource,
} from "../src/shared/nuget";
import { NugetCommand } from "../src/shared/vcpkg";

interface RecordedCommand {
  readonly args: readonly string[];
  readonly command: string;
}

const settings = {
  feedUrl: "https://nuget.pkg.github.com/octo/index.json",
  sourceName: "GitHubPackages",
  token: "token",
  username: "octo",
};

function result(): CommandResult {
  return { stderr: "", stdout: "" };
}

function nugetCommand(): NugetCommand {
  return {
    args: ["nuget.exe"],
    display: "mono nuget.exe",
    file: "mono",
  };
}

describe("nuget helpers", () => {
  test("builds source configuration arguments", () => {
    expect(buildNugetSourceRemoveArgs("GitHubPackages")).toEqual([
      "sources",
      "Remove",
      "-Name",
      "GitHubPackages",
    ]);
    expect(buildNugetSourceAddArgs(settings)).toEqual([
      "sources",
      "Add",
      "-Source",
      "https://nuget.pkg.github.com/octo/index.json",
      "-StorePasswordInClearText",
      "-Name",
      "GitHubPackages",
      "-UserName",
      "octo",
      "-Password",
      "token",
    ]);
    expect(
      buildNugetSetApiKeyArgs(
        "https://nuget.pkg.github.com/octo/index.json",
        "token",
      ),
    ).toEqual([
      "setapikey",
      "token",
      "-Source",
      "https://nuget.pkg.github.com/octo/index.json",
    ]);
  });

  test("removes stale source before adding credentials", async () => {
    const commands: RecordedCommand[] = [];

    await configureNugetSource(
      nugetCommand(),
      settings,
      async (command, args) => {
        commands.push({ args, command });
        return result();
      },
    );

    expect(commands).toEqual([
      {
        args: ["nuget.exe", ...buildNugetSourceRemoveArgs("GitHubPackages")],
        command: "mono",
      },
      {
        args: ["nuget.exe", ...buildNugetSourceAddArgs(settings)],
        command: "mono",
      },
      {
        args: [
          "nuget.exe",
          ...buildNugetSetApiKeyArgs(
            "https://nuget.pkg.github.com/octo/index.json",
            "token",
          ),
        ],
        command: "mono",
      },
    ]);
  });

  test("ignores missing source removal", async () => {
    const commands: RecordedCommand[] = [];

    await configureNugetSource(
      nugetCommand(),
      settings,
      async (command, args) => {
        commands.push({ args, command });

        if (args.includes("Remove")) {
          throw new Error("missing source");
        }

        return result();
      },
    );

    expect(commands).toHaveLength(3);
  });

  test("reports sanitized add failures", async () => {
    await expect(
      configureNugetSource(nugetCommand(), settings, async (_command, args) => {
        if (args.includes("Add")) {
          throw new Error("token");
        }

        return result();
      }),
    ).rejects.toThrow("Failed to add GitHub Packages NuGet source");
  });
});
