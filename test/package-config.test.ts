/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import {
  discoverPackageConfigs,
  globToRegex,
  packageIdentityKey,
  parsePackagesConfig,
} from "../src/shared/package-config";

const tempDirectories: string[] = [];

async function createTempDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "vcpkg-cache-test-"));
  tempDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  for (const directory of tempDirectories.splice(0)) {
    await rm(directory, { force: true, recursive: true });
  }
});

describe("packages.config helpers", () => {
  test("parses package identities", () => {
    expect(
      parsePackagesConfig(`<?xml version="1.0" encoding="utf-8"?>
<packages>
  <package id="zlib" version="1.2.13" />
  <package version='8.0.0' id='fmt' />
  <package id="missing-version" />
  <package id="escaped&amp;id" version="1.0.0" />
</packages>`),
    ).toEqual([
      { id: "zlib", version: "1.2.13" },
      { id: "fmt", version: "8.0.0" },
      { id: "escaped&id", version: "1.0.0" },
    ]);
  });

  test("matches common package config globs", () => {
    expect(globToRegex("**/packages.config").test("packages.config")).toBe(
      true,
    );
    expect(
      globToRegex("**/packages.config").test(
        "vcpkg/buildtrees/packages.config",
      ),
    ).toBe(true);
    expect(
      globToRegex("vcpkg/**/packages.config").test("src/packages.config"),
    ).toBe(false);
  });

  test("discovers package configs and de-duplicates identities", async () => {
    const root = await createTempDirectory();
    await mkdir(path.join(root, "vcpkg", "buildtrees"), { recursive: true });
    await mkdir(path.join(root, "node_modules", "ignore"), { recursive: true });
    await writeFile(
      path.join(root, "packages.config"),
      '<packages><package id="fmt" version="8.0.0" /></packages>',
    );
    await writeFile(
      path.join(root, "vcpkg", "buildtrees", "packages.config"),
      '<packages><package id="fmt" version="8.0.0" /><package id="zlib" version="1.2.13" /></packages>',
    );
    await writeFile(
      path.join(root, "node_modules", "ignore", "packages.config"),
      '<packages><package id="ignored" version="1.0.0" /></packages>',
    );

    const discovery = await discoverPackageConfigs(root, "**/packages.config");

    expect(discovery.files).toHaveLength(2);
    expect(discovery.requestedPackages.map(packageIdentityKey)).toEqual([
      "fmt@8.0.0",
      "zlib@1.2.13",
    ]);
  });

  test("bounds discovered package config files", async () => {
    const root = await createTempDirectory();
    await mkdir(path.join(root, "one"), { recursive: true });
    await mkdir(path.join(root, "two"), { recursive: true });
    await writeFile(
      path.join(root, "one", "packages.config"),
      '<packages><package id="one" version="1.0.0" /></packages>',
    );
    await writeFile(
      path.join(root, "two", "packages.config"),
      '<packages><package id="two" version="1.0.0" /></packages>',
    );

    const discovery = await discoverPackageConfigs(root, "**/packages.config", {
      maxFiles: 1,
    });

    expect(discovery.files).toHaveLength(1);
  });
});
