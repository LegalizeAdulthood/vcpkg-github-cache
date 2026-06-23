/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { describe, expect, test } from "vitest";

import {
  setupEmitSummaryItems,
  setupRunSummaryItems,
  setupStatusHeading,
} from "../src/shared/setup-summary";

describe("setup summary", () => {
  test("renders compact setup status headings", () => {
    expect(
      setupStatusHeading("vcpkg GitHub Packages cache setup complete"),
    ).toBe("Setup status: complete");
    expect(
      setupStatusHeading("vcpkg GitHub Packages cache setup script emitted"),
    ).toBe("Setup status: script emitted");
    expect(
      setupStatusHeading("vcpkg GitHub Packages cache setup skipped NuGet"),
    ).toBe("Setup status: skipped NuGet");
  });

  test("renders emit-mode summary rows without target-side claims", () => {
    const items = setupEmitSummaryItems({
      binarySourceMode: "readwrite",
      diagnosis: "vcpkg GitHub Packages cache setup script emitted",
      feedUrl: "https://nuget.pkg.github.com/octo/index.json",
      setupEnv: ".vcpkg-github-cache/setup.env",
      setupScript: ".vcpkg-github-cache/setup.sh",
      targetOs: "freebsd",
    });

    expect(items).toEqual([
      "Diagnosis: vcpkg GitHub Packages cache setup script emitted",
      "Target OS: freebsd",
      "Setup script: .vcpkg-github-cache/setup.sh",
      "Setup environment: .vcpkg-github-cache/setup.env",
      "Feed: https://nuget.pkg.github.com/octo/index.json",
      "Binary source mode: readwrite",
    ]);
    expect(items.join("\n")).not.toContain("vcpkg version");
    expect(items.join("\n")).not.toContain("NuGet command");
  });

  test("renders run-mode summary rows with host-side setup details", () => {
    const items = setupRunSummaryItems({
      diagnosis: "vcpkg GitHub Packages cache setup complete",
      feedUrl: "https://nuget.pkg.github.com/octo/index.json",
      nugetCommand: "mono /vcpkg/downloads/tools/nuget.exe",
      vcpkgRoot: "/work/repo/vcpkg",
      vcpkgVersion: "vcpkg package management program version 1",
    });

    expect(items).toEqual([
      "Diagnosis: vcpkg GitHub Packages cache setup complete",
      "Feed: https://nuget.pkg.github.com/octo/index.json",
      "vcpkg root: /work/repo/vcpkg",
      "vcpkg version: vcpkg package management program version 1",
      "NuGet command: mono /vcpkg/downloads/tools/nuget.exe",
    ]);
  });
});
