/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { constants } from "node:fs";
import { access } from "node:fs/promises";
import * as path from "node:path";

import { runCommand } from "./command";

export interface BootstrapCommand {
  readonly args: readonly string[];
  readonly cwd: string;
  readonly file: string;
}

export interface VcpkgPaths {
  readonly bootstrapScript: string;
  readonly executable: string;
  readonly root: string;
}

export function vcpkgExecutableName(platform: NodeJS.Platform): string {
  return platform === "win32" ? "vcpkg.exe" : "vcpkg";
}

export function bootstrapScriptName(platform: NodeJS.Platform): string {
  return platform === "win32" ? "bootstrap-vcpkg.bat" : "bootstrap-vcpkg.sh";
}

export function resolveVcpkgPaths(
  input: string | undefined,
  workspace: string | undefined,
  platform: NodeJS.Platform = process.platform,
): VcpkgPaths {
  const rootInput = input?.trim() || "vcpkg";
  const base = workspace?.trim() || process.cwd();
  const root = path.resolve(base, rootInput);

  return {
    bootstrapScript: path.join(root, bootstrapScriptName(platform)),
    executable: path.join(root, vcpkgExecutableName(platform)),
    root,
  };
}

export function buildBootstrapCommand(
  vcpkg: VcpkgPaths,
  platform: NodeJS.Platform = process.platform,
): BootstrapCommand {
  if (platform === "win32") {
    return {
      args: ["/d", "/s", "/c", "call", vcpkg.bootstrapScript],
      cwd: vcpkg.root,
      file: "cmd.exe",
    };
  }

  return {
    args: [],
    cwd: vcpkg.root,
    file: vcpkg.bootstrapScript,
  };
}

export async function bootstrapVcpkg(vcpkg: VcpkgPaths): Promise<void> {
  const command = buildBootstrapCommand(vcpkg);
  await runCommand(command.file, command.args, { cwd: command.cwd });
}

export async function verifyVcpkgExecutable(executable: string): Promise<void> {
  try {
    await access(executable, constants.F_OK);
  } catch {
    throw new Error(
      `vcpkg executable was not found at ${executable}; bootstrap vcpkg before setup or set bootstrap: true`,
    );
  }
}

export function extractVcpkgVersion(output: string): string {
  return (
    output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? ""
  );
}

export async function readVcpkgVersion(vcpkg: VcpkgPaths): Promise<string> {
  const result = await runCommand(vcpkg.executable, ["version"], {
    cwd: vcpkg.root,
  });
  return extractVcpkgVersion(`${result.stdout}\n${result.stderr}`);
}
