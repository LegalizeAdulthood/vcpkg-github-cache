/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { describe, expect, test } from "vitest";

import {
  defaultNugetConfigPaths,
  sanitizedNugetConfigDump,
  sanitizeNugetConfig,
} from "../src/shared/nuget-config";

describe("NuGet config diagnostics", () => {
  test("builds default NuGet config paths", () => {
    expect(defaultNugetConfigPaths("linux", { HOME: "/home/runner" })).toEqual([
      "/home/runner/.nuget/NuGet/NuGet.Config",
      "/home/runner/.config/NuGet/NuGet.Config",
    ]);
    expect(
      defaultNugetConfigPaths("win32", {
        APPDATA: "C:\\Users\\r\\AppData\\Roaming",
      }),
    ).toEqual(["C:\\Users\\r\\AppData\\Roaming\\NuGet\\NuGet.Config"]);
  });

  test("sanitizes NuGet credentials and API keys", () => {
    const config = `<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <packageSources>
    <add key="GitHubPackages" value="https://nuget.pkg.github.com/octo/index.json" />
  </packageSources>
  <packageSourceCredentials>
    <GitHubPackages>
      <add key="Username" value="octo" />
      <add key="ClearTextPassword" value="token" />
    </GitHubPackages>
  </packageSourceCredentials>
  <apikeys>
    <add key="https://nuget.pkg.github.com/octo/index.json" value="api-key" />
  </apikeys>
</configuration>`;

    const sanitized = sanitizeNugetConfig(config, "token");

    expect(sanitized).toContain('value="octo"');
    expect(sanitized).toContain("https://nuget.pkg.github.com/octo/index.json");
    expect(sanitized).not.toContain("token");
    expect(sanitized).not.toContain("api-key");
    expect(sanitized).toContain('<add key="ClearTextPassword" value="***" />');
    expect(sanitized).toContain(
      '<add key="https://nuget.pkg.github.com/octo/index.json" value="***" />',
    );
  });

  test("dumps sanitized NuGet config files", async () => {
    const dump = await sanitizedNugetConfigDump({
      configPaths: ["NuGet.Config", "NuGet.Config"],
      readFile: async () =>
        '<configuration><apikeys><add key="feed" value="secret" /></apikeys></configuration>',
    });

    expect(dump).toContain("file: NuGet.Config");
    expect(dump).toContain("status: ok");
    expect(dump).not.toContain("secret");
    expect(dump.match(/file: NuGet\.Config/g)).toHaveLength(1);
  });
});
