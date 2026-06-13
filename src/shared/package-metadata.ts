/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { request as httpsRequest } from "node:https";
import { URL } from "node:url";

import { PackageIdentity } from "./package-config";

export type PackageMetadataStatus = "failed" | "missing" | "ok";
export type PackageOwnerEndpoint = "orgs" | "users";

export interface PackageMetadataHttpRequest {
  readonly headers: Readonly<Record<string, string>>;
  readonly url: string;
}

export interface PackageMetadataHttpResponse {
  readonly body: string;
  readonly statusCode?: number;
  readonly statusMessage?: string;
}

export interface PackageMetadataProbe {
  readonly limit: number;
  readonly owner: string;
  readonly probedPackageIds: number;
  readonly requestedPackageIds: number;
  readonly results: readonly PackageMetadataResult[];
}

export interface PackageMetadataProbeOptions {
  readonly apiUrl?: string;
  readonly feedOwner: string;
  readonly maxPackages?: number;
  readonly packageIdentities: readonly PackageIdentity[];
  readonly request?: PackageMetadataRequester;
  readonly timeoutMilliseconds?: number;
  readonly token: string;
}

export interface PackageMetadataResult {
  readonly detail: string;
  readonly endpoint?: PackageOwnerEndpoint;
  readonly name: string;
  readonly packageType?: string;
  readonly repository?: string;
  readonly repositoryUrl?: string;
  readonly settingsUrl?: string;
  readonly status: PackageMetadataStatus;
  readonly url?: string;
  readonly visibility?: string;
}

export type PackageMetadataRequester = (
  request: PackageMetadataHttpRequest,
) => Promise<PackageMetadataHttpResponse>;

const DEFAULT_API_URL = "https://api.github.com";
const DEFAULT_LIMIT = 20;
const DEFAULT_TIMEOUT_MILLISECONDS = 10000;
const OWNER_ENDPOINTS: readonly PackageOwnerEndpoint[] = ["users", "orgs"];

function uniquePackageIds(
  packageIdentities: readonly PackageIdentity[],
): readonly string[] {
  return [
    ...new Set(
      packageIdentities
        .map((identity) => identity.id.trim())
        .filter((identity) => identity.length > 0),
    ),
  ];
}

function boundedPackageIds(
  packageIdentities: readonly PackageIdentity[],
  limit: number,
): readonly string[] {
  return uniquePackageIds(packageIdentities).slice(0, limit);
}

function trimApiUrl(apiUrl: string): string {
  return apiUrl.replace(/\/+$/g, "");
}

export function packageMetadataUrl(
  apiUrl: string,
  endpoint: PackageOwnerEndpoint,
  owner: string,
  packageName: string,
): string {
  return `${trimApiUrl(apiUrl)}/${endpoint}/${encodeURIComponent(
    owner,
  )}/packages/nuget/${encodeURIComponent(packageName)}`;
}

export function packageSettingsUrl(
  endpoint: PackageOwnerEndpoint,
  owner: string,
  packageName: string,
): string {
  return `https://github.com/${endpoint}/${encodeURIComponent(
    owner,
  )}/packages/nuget/${encodeURIComponent(packageName)}/settings`;
}

function statusDetail(response: PackageMetadataHttpResponse): string {
  const statusCode = response.statusCode ?? 0;
  const statusMessage = response.statusMessage ?? "";

  return `HTTP ${statusCode}${statusMessage ? ` ${statusMessage}` : ""}`;
}

function responseSucceeded(response: PackageMetadataHttpResponse): boolean {
  const statusCode = response.statusCode ?? 0;
  return statusCode >= 200 && statusCode < 300;
}

function responseMissing(response: PackageMetadataHttpResponse): boolean {
  return response.statusCode === 404;
}

function stringField(
  object: Readonly<Record<string, unknown>> | undefined,
  key: string,
): string | undefined {
  const value = object?.[key];

  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function objectField(
  object: Readonly<Record<string, unknown>> | undefined,
  key: string,
): Readonly<Record<string, unknown>> | undefined {
  const value = object?.[key];

  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}

function parseMetadataResponse(
  packageName: string,
  endpoint: PackageOwnerEndpoint,
  owner: string,
  response: PackageMetadataHttpResponse,
): PackageMetadataResult {
  try {
    const metadata = JSON.parse(response.body) as Readonly<
      Record<string, unknown>
    >;
    const repository = objectField(metadata, "repository");
    const name = stringField(metadata, "name") ?? packageName;

    return {
      detail: statusDetail(response),
      endpoint,
      name,
      packageType: stringField(metadata, "package_type"),
      repository: stringField(repository, "full_name"),
      repositoryUrl: stringField(repository, "html_url"),
      settingsUrl: packageSettingsUrl(endpoint, owner, name),
      status: "ok",
      url: stringField(metadata, "html_url"),
      visibility: stringField(metadata, "visibility"),
    };
  } catch (error) {
    return {
      detail: error instanceof Error ? error.message : String(error),
      endpoint,
      name: packageName,
      status: "failed",
    };
  }
}

async function requestPackageMetadataDefault(
  probe: PackageMetadataHttpRequest,
  timeoutMilliseconds = DEFAULT_TIMEOUT_MILLISECONDS,
): Promise<PackageMetadataHttpResponse> {
  return await new Promise((resolve, reject) => {
    const request = httpsRequest(
      new URL(probe.url),
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "vcpkg-github-cache-action",
          ...probe.headers,
        },
        method: "GET",
      },
      (response) => {
        let body = "";

        response.setEncoding("utf8");
        response.on("data", (chunk: string) => {
          body += chunk;
        });
        response.on("end", () => {
          resolve({
            body,
            statusCode: response.statusCode,
            statusMessage: response.statusMessage,
          });
        });
      },
    );

    request.setTimeout(timeoutMilliseconds, () => {
      request.destroy(
        new Error(`HTTP probe timed out after ${timeoutMilliseconds} ms`),
      );
    });
    request.on("error", reject);
    request.end();
  });
}

async function queryPackageMetadata(
  packageName: string,
  options: PackageMetadataProbeOptions,
  request: PackageMetadataRequester,
): Promise<PackageMetadataResult> {
  let missingResult: PackageMetadataResult | undefined;

  for (const endpoint of OWNER_ENDPOINTS) {
    try {
      const response = await request({
        headers: {
          Authorization: `Bearer ${options.token}`,
        },
        url: packageMetadataUrl(
          options.apiUrl ?? DEFAULT_API_URL,
          endpoint,
          options.feedOwner,
          packageName,
        ),
      });

      if (responseSucceeded(response)) {
        return parseMetadataResponse(
          packageName,
          endpoint,
          options.feedOwner,
          response,
        );
      }

      const result: PackageMetadataResult = {
        detail: statusDetail(response),
        endpoint,
        name: packageName,
        status: responseMissing(response) ? "missing" : "failed",
      };

      if (!responseMissing(response)) {
        return result;
      }

      missingResult = result;
    } catch (error) {
      return {
        detail: error instanceof Error ? error.message : String(error),
        endpoint,
        name: packageName,
        status: "failed",
      };
    }
  }

  return (
    missingResult ?? {
      detail: "package metadata not found",
      name: packageName,
      status: "missing",
    }
  );
}

export async function runPackageMetadataProbe(
  options: PackageMetadataProbeOptions,
): Promise<PackageMetadataProbe> {
  const limit = options.maxPackages ?? DEFAULT_LIMIT;
  const packageIds = boundedPackageIds(options.packageIdentities, limit);
  const request =
    options.request ??
    ((probe) =>
      requestPackageMetadataDefault(probe, options.timeoutMilliseconds));
  const results = await Promise.all(
    packageIds.map((packageName) =>
      queryPackageMetadata(packageName, options, request),
    ),
  );

  return {
    limit,
    owner: options.feedOwner,
    probedPackageIds: packageIds.length,
    requestedPackageIds: uniquePackageIds(options.packageIdentities).length,
    results,
  };
}

function optional(value: string | undefined): string {
  return value && value.length > 0 ? value : "unknown";
}

function formatResult(result: PackageMetadataResult): readonly string[] {
  return [
    `package: ${result.name}`,
    `status: ${result.status}`,
    `detail: ${result.detail}`,
    `endpoint: ${optional(result.endpoint)}`,
    `type: ${optional(result.packageType)}`,
    `visibility: ${optional(result.visibility)}`,
    `repository: ${optional(result.repository)}`,
    `repository url: ${optional(result.repositoryUrl)}`,
    `settings url: ${optional(result.settingsUrl)}`,
    `url: ${optional(result.url)}`,
  ];
}

export function formatPackageMetadataProbe(
  probe: PackageMetadataProbe | undefined,
): string {
  if (!probe) {
    return "package metadata probe not supplied\n";
  }

  const output = [
    `owner: ${probe.owner}`,
    `requested package ids: ${probe.requestedPackageIds}`,
    `probed package ids: ${probe.probedPackageIds}`,
    `limit: ${probe.limit}`,
    "",
  ];

  for (const result of probe.results) {
    output.push(...formatResult(result), "");
  }

  return `${output.join("\n")}\n`;
}
