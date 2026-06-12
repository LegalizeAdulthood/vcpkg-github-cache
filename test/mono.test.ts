/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { describe, expect, test } from "vitest";

import { CommandResult } from "../src/shared/command";
import {
  ensureMonoAvailable,
  monoInstallCommands,
  monoIsRequired,
} from "../src/shared/mono";

interface RecordedCommand {
  readonly args: readonly string[];
  readonly command: string;
}

function result(): CommandResult {
  return { stderr: "", stdout: "" };
}

describe("mono helpers", () => {
  test("requires Mono on Unix platforms", () => {
    expect(monoIsRequired("win32")).toBe(false);
    expect(monoIsRequired("linux")).toBe(true);
    expect(monoIsRequired("darwin")).toBe(true);
  });

  test("builds platform-specific install commands", () => {
    expect(monoInstallCommands("linux")).toEqual([
      { args: ["apt-get", "update"], command: "sudo" },
      {
        args: ["apt-get", "install", "--yes", "mono-complete"],
        command: "sudo",
      },
    ]);
    expect(monoInstallCommands("darwin")).toEqual([
      { args: ["install", "mono"], command: "brew" },
    ]);
  });

  test("rejects unsupported automatic install platforms", () => {
    expect(() => monoInstallCommands("freebsd")).toThrow(/not supported/);
  });

  test("skips Mono checks on Windows", async () => {
    const commands: RecordedCommand[] = [];
    const mono = await ensureMonoAvailable(
      false,
      "win32",
      async (command, args) => {
        commands.push({ args, command });
        return result();
      },
    );

    expect(mono).toEqual({ installed: false, required: false });
    expect(commands).toEqual([]);
  });

  test("accepts an existing Mono installation", async () => {
    const commands: RecordedCommand[] = [];
    const mono = await ensureMonoAvailable(
      false,
      "linux",
      async (command, args) => {
        commands.push({ args, command });
        return result();
      },
    );

    expect(mono).toEqual({ installed: false, required: true });
    expect(commands).toEqual([{ args: ["--version"], command: "mono" }]);
  });

  test("installs Mono when it is missing", async () => {
    const commands: RecordedCommand[] = [];
    let monoAvailable = false;
    const mono = await ensureMonoAvailable(
      true,
      "linux",
      async (command, args) => {
        commands.push({ args, command });

        if (command === "mono") {
          if (monoAvailable) {
            return result();
          }

          throw new Error("missing mono");
        }

        if (command === "sudo" && args[1] === "install") {
          monoAvailable = true;
        }

        return result();
      },
    );

    expect(mono).toEqual({ installed: true, required: true });
    expect(commands).toEqual([
      { args: ["--version"], command: "mono" },
      { args: ["apt-get", "update"], command: "sudo" },
      {
        args: ["apt-get", "install", "--yes", "mono-complete"],
        command: "sudo",
      },
      { args: ["--version"], command: "mono" },
    ]);
  });

  test("rejects missing Mono when install is disabled", async () => {
    await expect(
      ensureMonoAvailable(false, "linux", async () => {
        throw new Error("missing mono");
      }),
    ).rejects.toThrow(/install-mono/);
  });
});
