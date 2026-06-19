/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { describe, expect, test } from "vitest";

import {
  formatPackageMetadataProbe,
  PackageMetadataHttpRequest,
  packageMetadataQuotaRiskCount,
  packageMetadataUrl,
  packageQuotaRisk,
  packageSettingsUrl,
  packageVersionExists,
  packageVersionsUrl,
  runPackageMetadataProbe,
} from "../src/shared/package-metadata";

describe("package metadata probes", () => {
  test("builds GitHub package metadata URLs", () => {
    expect(
      packageMetadataUrl(
        "https://api.github.com/",
        "users",
        "octo",
        "fmt:x64-windows",
      ),
    ).toBe(
      "https://api.github.com/users/octo/packages/nuget/fmt%3Ax64-windows",
    );
    expect(packageSettingsUrl("users", "octo", "fmt:x64-windows")).toBe(
      "https://github.com/users/octo/packages/nuget/fmt%3Ax64-windows/settings",
    );
    expect(
      packageVersionsUrl(
        "https://api.github.com/",
        "users",
        "octo",
        "fmt:x64-windows",
      ),
    ).toBe(
      "https://api.github.com/users/octo/packages/nuget/fmt%3Ax64-windows/versions?per_page=100",
    );
  });

  test("queries package visibility and repository association", async () => {
    const requests: PackageMetadataHttpRequest[] = [];
    const probe = await runPackageMetadataProbe({
      feedOwner: "octo",
      packageIdentities: [
        { id: "fmt", version: "1" },
        { id: "fmt", version: "2" },
      ],
      request: async (request) => {
        requests.push(request);

        if (request.url.endsWith("/versions?per_page=100")) {
          return {
            body: JSON.stringify([
              {
                name: "1.0.0-vcpkg0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
              },
            ]),
            statusCode: 200,
            statusMessage: "OK",
          };
        }

        return {
          body: JSON.stringify({
            html_url: "https://github.com/octo/repo/packages/1",
            name: "fmt",
            package_type: "nuget",
            repository: {
              full_name: "octo/repo",
              html_url: "https://github.com/octo/repo",
            },
            version_count: 3,
            visibility: "public",
          }),
          statusCode: 200,
          statusMessage: "OK",
        };
      },
      token: "token",
    });

    expect(requests).toHaveLength(2);
    expect(requests[0].url).toBe(
      "https://api.github.com/users/octo/packages/nuget/fmt",
    );
    expect(requests[0].headers.Authorization).toBe("Bearer token");
    expect(probe.requestedPackageIds).toBe(1);
    expect(probe.probedPackageIds).toBe(1);
    expect(probe.results[0]).toMatchObject({
      endpoint: "users",
      name: "fmt",
      packageType: "nuget",
      quotaRisk: "none",
      repository: "octo/repo",
      settingsUrl: "https://github.com/users/octo/packages/nuget/fmt/settings",
      status: "ok",
      versionCount: 3,
      versionNames: [
        "1.0.0-vcpkg0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      ],
      visibility: "public",
    });
    expect(packageMetadataQuotaRiskCount(probe)).toBe(0);
    expect(
      packageVersionExists(
        probe.results[0],
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      ),
    ).toBe(true);
    expect(formatPackageMetadataProbe(probe)).toContain("versions: 3");
    expect(formatPackageMetadataProbe(probe)).toContain(
      "version names: 1.0.0-vcpkg0123456789abcdef",
    );
    expect(formatPackageMetadataProbe(probe)).toContain("quota risk: none");
  });

  test("falls back from user to organization package metadata", async () => {
    const requests: string[] = [];
    const probe = await runPackageMetadataProbe({
      feedOwner: "octo-org",
      packageIdentities: [{ id: "zlib", version: "1" }],
      request: async (request) => {
        requests.push(request.url);

        if (request.url.includes("/users/")) {
          return {
            body: "{}",
            statusCode: 404,
            statusMessage: "Not Found",
          };
        }

        if (request.url.endsWith("/versions?per_page=100")) {
          return {
            body: JSON.stringify([{ name: "1.0.0-vcpkgabcdef" }]),
            statusCode: 200,
            statusMessage: "OK",
          };
        }

        return {
          body: JSON.stringify({
            name: "zlib",
            repository: { full_name: "octo-org/repo" },
            version_count: 7,
            visibility: "private",
          }),
          statusCode: 200,
          statusMessage: "OK",
        };
      },
      token: "token",
    });

    expect(requests).toEqual([
      "https://api.github.com/users/octo-org/packages/nuget/zlib",
      "https://api.github.com/orgs/octo-org/packages/nuget/zlib",
      "https://api.github.com/orgs/octo-org/packages/nuget/zlib/versions?per_page=100",
    ]);
    expect(probe.results[0]).toMatchObject({
      endpoint: "orgs",
      quotaRisk: "private package storage",
      repository: "octo-org/repo",
      status: "ok",
      versionCount: 7,
      visibility: "private",
    });
    expect(packageMetadataQuotaRiskCount(probe)).toBe(1);
  });

  test("classifies package quota risk from visibility", () => {
    expect(packageQuotaRisk("public")).toBe("none");
    expect(packageQuotaRisk("private")).toBe("private package storage");
    expect(packageQuotaRisk("internal")).toBe("private package storage");
    expect(packageQuotaRisk(undefined)).toBe("unknown");
  });

  test("bounds package metadata probes", async () => {
    const requests: string[] = [];
    const probe = await runPackageMetadataProbe({
      feedOwner: "octo",
      maxPackages: 2,
      packageIdentities: [
        { id: "a", version: "1" },
        { id: "b", version: "1" },
        { id: "c", version: "1" },
      ],
      request: async (request) => {
        requests.push(request.url);
        return { body: "{}", statusCode: 404, statusMessage: "Not Found" };
      },
      token: "token",
    });

    expect(probe.requestedPackageIds).toBe(3);
    expect(probe.probedPackageIds).toBe(2);
    expect(requests).toHaveLength(4);
    expect(formatPackageMetadataProbe(probe)).toContain("limit: 2");
  });
});
