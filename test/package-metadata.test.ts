/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { describe, expect, test } from "vitest";

import {
  formatPackageMetadataProbe,
  PackageMetadataHttpRequest,
  packageMetadataUrl,
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
        return {
          body: JSON.stringify({
            html_url: "https://github.com/octo/repo/packages/1",
            name: "fmt",
            package_type: "nuget",
            repository: {
              full_name: "octo/repo",
              html_url: "https://github.com/octo/repo",
            },
            visibility: "public",
          }),
          statusCode: 200,
          statusMessage: "OK",
        };
      },
      token: "token",
    });

    expect(requests).toHaveLength(1);
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
      repository: "octo/repo",
      status: "ok",
      visibility: "public",
    });
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

        return {
          body: JSON.stringify({
            name: "zlib",
            repository: { full_name: "octo-org/repo" },
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
    ]);
    expect(probe.results[0]).toMatchObject({
      endpoint: "orgs",
      repository: "octo-org/repo",
      status: "ok",
      visibility: "private",
    });
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
