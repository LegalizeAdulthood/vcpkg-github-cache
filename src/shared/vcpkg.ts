/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { constants } from "node:fs";
import { access } from "node:fs/promises";
import * as path from "node:path";

import { formatCommand, runCommand } from "./command";

export interface BootstrapCommand {
  readonly args: readonly string[];
  readonly cwd: string;
  readonly file: string;
}

export interface NugetCommand {
  readonly args: readonly string[];
  readonly display: string;
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

export async function bootstrapVcpkg(
  vcpkg: VcpkgPaths,
  run: typeof runCommand = runCommand,
): Promise<void> {
  const command = buildBootstrapCommand(vcpkg);
  await run(command.file, command.args, { cwd: command.cwd });
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

export async function readVcpkgVersion(
  vcpkg: VcpkgPaths,
  run: typeof runCommand = runCommand,
): Promise<string> {
  const result = await run(vcpkg.executable, ["version"], {
    cwd: vcpkg.root,
  });
  return extractVcpkgVersion(`${result.stdout}\n${result.stderr}`);
}

export function extractFetchedNugetPath(output: string): string {
  const pathLine = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => line.replace(/^"(.*)"$/, "$1"))
    .filter((line) => line.length > 0)
    .find((line) => {
      if (!/nuget\.exe$/i.test(line)) {
        return false;
      }

      if (/^Downloading\b/i.test(line) || line.includes(" -> ")) {
        return false;
      }

      return (
        /^(\/|\.{1,2}[\\/]|[A-Za-z]:[\\/]|\\\\)/.test(line) ||
        /^[A-Za-z0-9_.-]+[\\/]/.test(line) ||
        /^nuget\.exe$/i.test(line)
      );
    });

  if (!pathLine) {
    const detail = output.trim();
    const suffix = detail ? `:\n${detail}` : "";

    throw new Error(
      `vcpkg fetch nuget did not report a nuget.exe path${suffix}`,
    );
  }

  return pathLine;
}

export async function fetchNuget(
  vcpkg: VcpkgPaths,
  run: typeof runCommand = runCommand,
): Promise<string> {
  const result = await run(vcpkg.executable, ["fetch", "nuget"], {
    cwd: vcpkg.root,
  });
  return extractFetchedNugetPath(`${result.stdout}\n${result.stderr}`);
}

export function buildNugetCommand(
  nugetPath: string,
  platform: NodeJS.Platform = process.platform,
): NugetCommand {
  if (platform === "win32") {
    return {
      args: [],
      display: formatCommand(nugetPath, []),
      file: nugetPath,
    };
  }

  return {
    args: [nugetPath],
    display: formatCommand("mono", [nugetPath]),
    file: "mono",
  };
}
