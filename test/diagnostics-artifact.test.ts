/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { AnalyzerLiveProbes, ProbeResult } from "../src/shared/analyze-probes";
import { CacheDiagnosis } from "../src/shared/diagnosis";
import {
  defaultDiagnosticsArtifactName,
  sanitizeDiagnosticsText,
  uploadDiagnosticsArtifact,
} from "../src/shared/diagnostics-artifact";
import { PackageConfigDiscovery } from "../src/shared/package-config";
import { RestoreProbe } from "../src/shared/restore-probe";
import { VcpkgPaths } from "../src/shared/vcpkg";

const tempDirectories: string[] = [];

function probe(status: ProbeResult["status"], detail: string): ProbeResult {
  return { detail, status };
}

function liveProbes(): AnalyzerLiveProbes {
  return {
    feedBasicAuth: probe("ok", "HTTP 200 OK"),
    feedBearerAuth: probe("failed", "HTTP 401 Unauthorized"),
    nugetCommand: {
      args: [],
      display: "nuget.exe",
      file: "nuget.exe",
    },
    nugetSources: {
      detail: "NuGet sources listed",
      output: "Password: token\nGitHubPackages",
      status: "ok",
    },
    nugetVersion: probe("ok", "7.6.0"),
    vcpkgNuget: probe("ok", "nuget.exe"),
    vcpkgVersion: probe("ok", "vcpkg 2026"),
  };
}

function diagnosis(): CacheDiagnosis {
  return {
    cacheStatus: "upload-failure",
    diagnosis: "vcpkg GitHub Packages cache: upload failure",
    failureKind: "upload-failure",
  };
}

function packageConfigs(): PackageConfigDiscovery {
  return {
    files: [
      {
        packages: [{ id: "fmt", version: "8.0.0" }],
        path: "C:\\work\\vcpkg\\buildtrees\\packages.config",
      },
    ],
    requestedPackages: [{ id: "fmt", version: "8.0.0" }],
  };
}

function restoreProbe(): RestoreProbe {
  return {
    restoredCount: 0,
    result: {
      detail: "NuGet restore failed; restored 0/1 packages",
      output: "Authorization: token\nClearTextPassword=token",
      status: "failed",
    },
  };
}

function vcpkg(): VcpkgPaths {
  return {
    bootstrapScript: "C:\\work\\vcpkg\\bootstrap-vcpkg.bat",
    executable: "C:\\work\\vcpkg\\vcpkg.exe",
    root: "C:\\work\\vcpkg",
  };
}

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

describe("diagnostics artifact", () => {
  test("builds a safe default artifact name", () => {
    expect(
      defaultDiagnosticsArtifactName(
        {
          GITHUB_JOB: "build",
          RUNNER_ARCH: "X64",
          RUNNER_OS: "Windows",
        },
        "abc12345",
      ),
    ).toBe("vcpkg-cache-diagnostics-build-Windows-X64-abc12345");
  });

  test("sanitizes configured artifact names", async () => {
    const rootDirectory = await createTempDirectory();
    await mkdir(rootDirectory, { recursive: true });

    await expect(
      uploadDiagnosticsArtifact(
        {
          buildLog: "",
          builtCount: "",
          diagnosis: diagnosis(),
          failOnPolicy: "never",
          feedOwner: "octo",
          feedUrl: "https://nuget.pkg.github.com/octo/index.json",
          liveProbes: liveProbes(),
          packageConfigGlob: "**/packages.config",
          packageConfigs: packageConfigs(),
          requestedCount: 1,
          restoreProbe: restoreProbe(),
          restoredCount: "",
          token: "",
          tokenKind: "github",
          uploadedCount: "",
          username: "octo",
          vcpkg: vcpkg(),
          workspace: "C:\\work",
        },
        {
          artifactName: "release:windows/x64",
          rootDirectory,
          upload: async (name) => {
            expect(name).toBe("release-windows-x64");
            return { id: 1 };
          },
        },
      ),
    ).resolves.toBe("release-windows-x64");
  });

  test("redacts tokens and credential fields", () => {
    expect(
      sanitizeDiagnosticsText(
        'Authorization: token\n<add key="ClearTextPassword" value="token" />',
        "token",
      ),
    ).toBe('Authorization: ***\n<add key="ClearTextPassword" value="***" />');
  });

  test("writes and uploads sanitized diagnostics files", async () => {
    const rootDirectory = await createTempDirectory();
    await mkdir(rootDirectory, { recursive: true });
    const uploads: string[] = [];

    const artifactName = await uploadDiagnosticsArtifact(
      {
        buildLog: "build.log",
        buildLogFacts: {
          authMessages: ["Response status code: 403 Forbidden token"],
          builtCount: 1,
          builtPackages: [],
          failedHttpStatuses: ["403"],
          feeds: ["https://nuget.pkg.github.com/octo/index.json"],
          nugetConfigPaths: ["C:\\Users\\runner\\NuGet.Config"],
          quotaMessages: [],
          requestedCount: 1,
          restoredCount: 0,
          restoredPackages: [],
          submissionsStarted: 1,
          uploadedCount: undefined,
          uploadsAttempted: 1,
          zeroCacheSubmissions: 1,
        },
        builtCount: "1",
        diagnosis: diagnosis(),
        failOnPolicy: "never",
        feedOwner: "octo",
        feedUrl: "https://nuget.pkg.github.com/octo/index.json",
        liveProbes: liveProbes(),
        packageConfigGlob: "**/packages.config",
        packageConfigs: packageConfigs(),
        requestedCount: 1,
        restoreProbe: restoreProbe(),
        restoredCount: "0",
        token: "token",
        tokenKind: "github",
        uploadedCount: "",
        username: "octo",
        vcpkg: vcpkg(),
        workspace: "C:\\work",
      },
      {
        artifactName: "test-diagnostics",
        env: {
          GITHUB_JOB: "build",
          GITHUB_REPOSITORY: "octo/repo",
          RUNNER_OS: "Windows",
        },
        rootDirectory,
        upload: async (name, files, uploadRoot) => {
          uploads.push(
            name,
            uploadRoot,
            ...files.map((file) => path.basename(file)),
          );
          return { id: 1, size: 2 };
        },
      },
    );
    const summary = await readFile(
      path.join(rootDirectory, "vcpkg-cache-diagnostics", "summary.md"),
      "utf8",
    );
    const restore = await readFile(
      path.join(rootDirectory, "vcpkg-cache-diagnostics", "restore-probe.txt"),
      "utf8",
    );
    const buildLog = await readFile(
      path.join(
        rootDirectory,
        "vcpkg-cache-diagnostics",
        "build-log-extract.txt",
      ),
      "utf8",
    );

    expect(artifactName).toBe("test-diagnostics");
    expect(uploads[0]).toBe("test-diagnostics");
    expect(uploads).toContain("summary.md");
    expect(summary).toContain("cache status: upload-failure");
    expect(restore).not.toContain("token");
    expect(buildLog).not.toContain("token");
    expect(buildLog).toContain("auth: Response status code: 403 Forbidden ***");
  });
});
