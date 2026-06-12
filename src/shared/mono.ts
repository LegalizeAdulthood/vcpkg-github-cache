/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { CommandRunner, runCommand } from "./command";

export interface MonoInstallCommand {
  readonly args: readonly string[];
  readonly command: string;
}

export interface MonoResult {
  readonly installed: boolean;
  readonly required: boolean;
}

export function monoIsRequired(platform: NodeJS.Platform): boolean {
  return platform !== "win32";
}

export function monoInstallCommands(
  platform: NodeJS.Platform,
): readonly MonoInstallCommand[] {
  if (platform === "linux") {
    return [
      { args: ["apt-get", "update"], command: "sudo" },
      {
        args: ["apt-get", "install", "--yes", "mono-complete"],
        command: "sudo",
      },
    ];
  }

  if (platform === "darwin") {
    return [{ args: ["install", "mono"], command: "brew" }];
  }

  throw new Error(
    `Mono is required to run nuget.exe on ${platform}, but automatic Mono installation is not supported on this platform`,
  );
}

async function monoIsAvailable(run: CommandRunner): Promise<boolean> {
  try {
    await run("mono", ["--version"]);
    return true;
  } catch {
    return false;
  }
}

export async function ensureMonoAvailable(
  install: boolean,
  platform: NodeJS.Platform = process.platform,
  run: CommandRunner = runCommand,
): Promise<MonoResult> {
  if (!monoIsRequired(platform)) {
    return { installed: false, required: false };
  }

  if (await monoIsAvailable(run)) {
    return { installed: false, required: true };
  }

  if (!install) {
    throw new Error(
      "Mono is required to run nuget.exe on Unix; install Mono or set install-mono: true",
    );
  }

  const env = { ...process.env, DEBIAN_FRONTEND: "noninteractive" };

  for (const command of monoInstallCommands(platform)) {
    await run(command.command, command.args, { env });
  }

  if (!(await monoIsAvailable(run))) {
    throw new Error(
      "Mono installation completed, but mono is still unavailable",
    );
  }

  return { installed: true, required: true };
}
