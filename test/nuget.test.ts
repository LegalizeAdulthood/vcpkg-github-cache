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
  nugetConfigDirectories,
  redactNugetSecrets,
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
      "-NonInteractive",
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
      "-ValidAuthenticationTypes",
      "basic",
      "-NonInteractive",
      "-Verbosity",
      "detailed",
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
      "-NonInteractive",
      "-Verbosity",
      "detailed",
    ]);
  });

  test("builds platform config directories", () => {
    expect(nugetConfigDirectories("linux", { HOME: "/home/runner" })).toEqual([
      "/home/runner/.nuget/NuGet",
      "/home/runner/.config/NuGet",
    ]);
    expect(
      nugetConfigDirectories("win32", {
        APPDATA: "C:\\Users\\r\\AppData\\Roaming",
      }),
    ).toEqual(["C:\\Users\\r\\AppData\\Roaming\\NuGet"]);
  });

  test("redacts tokens from NuGet diagnostics", () => {
    expect(redactNugetSecrets("password token value", settings)).toBe(
      "password *** value",
    );
  });

  test("removes stale source before adding credentials", async () => {
    const commands: RecordedCommand[] = [];

    await configureNugetSource(nugetCommand(), settings, {
      configDirectories: [],
      run: async (command, args) => {
        commands.push({ args, command });
        return result();
      },
    });

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

    await configureNugetSource(nugetCommand(), settings, {
      configDirectories: [],
      run: async (command, args) => {
        commands.push({ args, command });

        if (args.includes("Remove")) {
          throw new Error("missing source");
        }

        return result();
      },
    });

    expect(commands).toHaveLength(3);
  });

  test("emits redacted trace and debug diagnostics", async () => {
    const logs: string[] = [];

    await configureNugetSource(nugetCommand(), settings, {
      configDirectories: [],
      debug: true,
      log: (message) => logs.push(message),
      run: async () => ({ stderr: "stderr token", stdout: "stdout token" }),
      trace: true,
    });

    expect(logs.join("\n")).not.toContain("token");
    expect(logs.join("\n")).toContain("***");
    expect(logs.some((log) => log.startsWith("NuGet command: "))).toBe(true);
    expect(logs.some((log) => log.startsWith("NuGet stdout: "))).toBe(true);
    expect(logs.some((log) => log.startsWith("NuGet stderr: "))).toBe(true);
  });

  test("reports sanitized add failures", async () => {
    await expect(
      configureNugetSource(nugetCommand(), settings, {
        configDirectories: [],
        run: async (_command, args) => {
          if (args.includes("Add")) {
            throw new Error("token");
          }

          return result();
        },
      }),
    ).rejects.toThrow("Failed to add GitHub Packages NuGet source");
  });
});
