/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import * as path from "node:path";

import { describe, expect, test } from "vitest";

import {
  bootstrapScriptName,
  buildBootstrapCommand,
  buildNugetCommand,
  extractFetchedNugetPath,
  extractVcpkgVersion,
  resolveVcpkgPaths,
  vcpkgExecutableName,
} from "../src/shared/vcpkg";

describe("vcpkg helpers", () => {
  test("resolves relative vcpkg paths against workspace", () => {
    const paths = resolveVcpkgPaths("tools/vcpkg", "C:/work/repo", "win32");

    expect(paths.root).toBe(path.resolve("C:/work/repo", "tools/vcpkg"));
    expect(paths.executable).toBe(
      path.resolve("C:/work/repo", "tools/vcpkg", "vcpkg.exe"),
    );
    expect(paths.bootstrapScript).toBe(
      path.resolve("C:/work/repo", "tools/vcpkg", "bootstrap-vcpkg.bat"),
    );
  });

  test("uses default vcpkg root when input is empty", () => {
    const paths = resolveVcpkgPaths("", "/work/repo", "linux");

    expect(paths.root).toBe(path.resolve("/work/repo", "vcpkg"));
  });

  test("uses platform-specific executable and bootstrap names", () => {
    expect(vcpkgExecutableName("win32")).toBe("vcpkg.exe");
    expect(vcpkgExecutableName("linux")).toBe("vcpkg");
    expect(bootstrapScriptName("win32")).toBe("bootstrap-vcpkg.bat");
    expect(bootstrapScriptName("darwin")).toBe("bootstrap-vcpkg.sh");
  });

  test("builds platform-specific bootstrap commands", () => {
    const paths = resolveVcpkgPaths("vcpkg", "C:/work/repo", "win32");
    const command = buildBootstrapCommand(paths, "win32");

    expect(command.file).toBe("cmd.exe");
    expect(command.args).toEqual([
      "/d",
      "/s",
      "/c",
      "call",
      paths.bootstrapScript,
    ]);
    expect(command.cwd).toBe(paths.root);
  });

  test("extracts first non-empty vcpkg version line", () => {
    expect(extractVcpkgVersion("\r\nvcpkg package manager 2026\r\nmore")).toBe(
      "vcpkg package manager 2026",
    );
  });

  test("extracts fetched NuGet path from vcpkg output", () => {
    expect(
      extractFetchedNugetPath(
        "Downloading NuGet\r\nC:\\vcpkg\\downloads\\tools\\nuget.exe\r\n",
      ),
    ).toBe("C:\\vcpkg\\downloads\\tools\\nuget.exe");
    expect(extractFetchedNugetPath('"/tmp/downloads/nuget.exe"\n')).toBe(
      "/tmp/downloads/nuget.exe",
    );
  });

  test("rejects NuGet fetch output without a path", () => {
    expect(() => extractFetchedNugetPath("Downloading NuGet\r\n")).toThrow(
      /nuget\.exe path/,
    );
  });

  test("builds platform-specific NuGet commands", () => {
    expect(buildNugetCommand("C:\\Program Files\\nuget.exe", "win32")).toEqual({
      args: [],
      display: '"C:\\Program Files\\nuget.exe"',
      file: "C:\\Program Files\\nuget.exe",
    });
    expect(buildNugetCommand("/tmp/nuget.exe", "linux")).toEqual({
      args: ["/tmp/nuget.exe"],
      display: "mono /tmp/nuget.exe",
      file: "mono",
    });
  });
});
