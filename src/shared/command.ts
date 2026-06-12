/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { spawn } from "node:child_process";

export interface CommandResult {
  readonly stdout: string;
  readonly stderr: string;
}

export interface CommandOptions {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
}

export type CommandRunner = (
  command: string,
  args: readonly string[],
  options?: CommandOptions,
) => Promise<CommandResult>;

export function quoteCommandArgument(value: string): string {
  if (/^[A-Za-z0-9_./:\\-]+$/.test(value)) {
    return value;
  }

  return `"${value.replaceAll('"', '\\"')}"`;
}

export function formatCommand(
  command: string,
  args: readonly string[],
): string {
  return [command, ...args].map(quoteCommandArgument).join(" ");
}

export async function runCommand(
  command: string,
  args: readonly string[],
  options: CommandOptions = {},
): Promise<CommandResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      const exitCode = code ?? 1;
      const detail = stderr.trim() || stdout.trim();
      const message = detail ? `: ${detail}` : "";
      reject(
        new Error(
          `${formatCommand(command, args)} failed with exit code ${exitCode}${message}`,
        ),
      );
    });
  });
}
