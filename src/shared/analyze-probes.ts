/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { Buffer } from "node:buffer";
import { request as httpsRequest } from "node:https";
import { URL } from "node:url";

import { CommandResult, CommandRunner, runCommand } from "./command";
import {
  buildNugetCommand,
  fetchNuget,
  NugetCommand,
  readVcpkgVersion,
  VcpkgPaths,
} from "./vcpkg";

export type ProbeStatus = "failed" | "ok" | "skipped";

export interface AnalyzerLiveProbes {
  readonly feedBasicAuth: ProbeResult;
  readonly feedBearerAuth: ProbeResult;
  readonly nugetCommand?: NugetCommand;
  readonly nugetSources: ProbeResult;
  readonly nugetVersion: ProbeResult;
  readonly vcpkgNuget: ProbeResult;
  readonly vcpkgVersion: ProbeResult;
}

export interface HttpProbeRequest {
  readonly headers: Readonly<Record<string, string>>;
  readonly url: string;
}

export interface HttpProbeResponse {
  readonly statusCode?: number;
  readonly statusMessage?: string;
}

export interface ProbeResult {
  readonly detail: string;
  readonly output?: string;
  readonly status: ProbeStatus;
}

export interface RunAnalyzerLiveProbesOptions {
  readonly feedUrl: string;
  readonly httpProbe?: HttpProbeRunner;
  readonly platform?: NodeJS.Platform;
  readonly run?: CommandRunner;
  readonly timeoutMilliseconds?: number;
  readonly token: string;
  readonly username: string;
  readonly vcpkg: VcpkgPaths;
}

export type HttpProbeRunner = (
  request: HttpProbeRequest,
) => Promise<HttpProbeResponse>;

const DEFAULT_HTTP_TIMEOUT_MILLISECONDS = 10000;
const MAX_PROBE_OUTPUT_LENGTH = 4000;

function ok(detail: string, output?: string): ProbeResult {
  return { detail, output, status: "ok" };
}

function failed(error: unknown): ProbeResult {
  const detail = error instanceof Error ? error.message : String(error);
  return { detail: trimProbeOutput(detail), status: "failed" };
}

function skipped(detail: string): ProbeResult {
  return { detail, status: "skipped" };
}

function trimProbeOutput(value: string): string {
  const trimmed = value.trim();

  if (trimmed.length <= MAX_PROBE_OUTPUT_LENGTH) {
    return trimmed;
  }

  return `${trimmed.slice(0, MAX_PROBE_OUTPUT_LENGTH)}...`;
}

function combinedOutput(result: CommandResult): string {
  return trimProbeOutput(`${result.stdout}\n${result.stderr}`);
}

export function buildBasicAuthorization(
  username: string,
  token: string,
): string {
  return `Basic ${Buffer.from(`${username}:${token}`, "utf8").toString(
    "base64",
  )}`;
}

export function buildBearerAuthorization(token: string): string {
  return `Bearer ${token}`;
}

export function extractNugetVersion(output: string): string {
  const versionLine = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /^NuGet Version:/i.test(line));

  if (versionLine) {
    return versionLine.replace(/^NuGet Version:\s*/i, "");
  }

  return (
    output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? ""
  );
}

export async function requestHttpStatus(
  probe: HttpProbeRequest,
  timeoutMilliseconds = DEFAULT_HTTP_TIMEOUT_MILLISECONDS,
): Promise<HttpProbeResponse> {
  return await new Promise((resolve, reject) => {
    const url = new URL(probe.url);
    const request = httpsRequest(
      url,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "vcpkg-github-cache-action",
          ...probe.headers,
        },
        method: "GET",
      },
      (response) => {
        response.resume();
        response.on("end", () => {
          resolve({
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

function httpProbeDetail(response: HttpProbeResponse): string {
  const statusCode = response.statusCode ?? 0;
  const statusMessage = response.statusMessage ?? "";
  return `HTTP ${statusCode}${statusMessage ? ` ${statusMessage}` : ""}`;
}

function httpProbeSucceeded(response: HttpProbeResponse): boolean {
  const statusCode = response.statusCode ?? 0;
  return statusCode >= 200 && statusCode < 400;
}

async function probeFeedAuth(
  feedUrl: string,
  authorization: string,
  httpProbe: HttpProbeRunner,
): Promise<ProbeResult> {
  try {
    const response = await httpProbe({
      headers: { Authorization: authorization },
      url: feedUrl,
    });
    const detail = httpProbeDetail(response);

    if (httpProbeSucceeded(response)) {
      return ok(detail);
    }

    return { detail, status: "failed" };
  } catch (error) {
    return failed(error);
  }
}

async function probeVcpkgVersion(
  vcpkg: VcpkgPaths,
  run: CommandRunner,
): Promise<ProbeResult> {
  try {
    const version = await readVcpkgVersion(vcpkg, run);
    return ok(version || "vcpkg version command returned no output");
  } catch (error) {
    return failed(error);
  }
}

interface NugetCommandProbe {
  readonly nuget?: NugetCommand;
  readonly result: ProbeResult;
}

async function probeVcpkgNugetCommand(
  vcpkg: VcpkgPaths,
  run: CommandRunner,
  platform: NodeJS.Platform,
): Promise<NugetCommandProbe> {
  try {
    const nugetPath = await fetchNuget(vcpkg, run);
    const nuget = buildNugetCommand(nugetPath, platform);
    return { nuget, result: ok(nuget.display) };
  } catch (error) {
    return { result: failed(error) };
  }
}

async function runNuget(
  nuget: NugetCommand,
  args: readonly string[],
  run: CommandRunner,
): Promise<CommandResult> {
  return await run(nuget.file, [...nuget.args, ...args]);
}

async function probeNugetVersion(
  nuget: NugetCommand | undefined,
  run: CommandRunner,
): Promise<ProbeResult> {
  if (!nuget) {
    return skipped("NuGet command unavailable");
  }

  try {
    const result = await runNuget(nuget, ["help"], run);
    const output = combinedOutput(result);
    return ok(extractNugetVersion(output) || "NuGet responded", output);
  } catch (error) {
    return failed(error);
  }
}

async function probeNugetSources(
  nuget: NugetCommand | undefined,
  run: CommandRunner,
): Promise<ProbeResult> {
  if (!nuget) {
    return skipped("NuGet command unavailable");
  }

  try {
    const result = await runNuget(
      nuget,
      ["sources", "List", "-Format", "Detailed", "-NonInteractive"],
      run,
    );
    const output = combinedOutput(result);
    return ok("NuGet sources listed", output);
  } catch (error) {
    return failed(error);
  }
}

export function formatProbeResult(result: ProbeResult): string {
  return `${result.status}: ${result.detail}`;
}

export async function runAnalyzerLiveProbes(
  options: RunAnalyzerLiveProbesOptions,
): Promise<AnalyzerLiveProbes> {
  const httpProbe =
    options.httpProbe ??
    ((request) =>
      requestHttpStatus(request, options.timeoutMilliseconds).then(
        (response) => response,
      ));
  const run = options.run ?? runCommand;
  const [feedBasicAuth, feedBearerAuth] = await Promise.all([
    probeFeedAuth(
      options.feedUrl,
      buildBasicAuthorization(options.username, options.token),
      httpProbe,
    ),
    probeFeedAuth(
      options.feedUrl,
      buildBearerAuthorization(options.token),
      httpProbe,
    ),
  ]);
  const vcpkgVersion = await probeVcpkgVersion(options.vcpkg, run);
  const vcpkgNuget = await probeVcpkgNugetCommand(
    options.vcpkg,
    run,
    options.platform ?? process.platform,
  );
  const nugetVersion = await probeNugetVersion(vcpkgNuget.nuget, run);
  const nugetSources = await probeNugetSources(vcpkgNuget.nuget, run);

  return {
    feedBasicAuth,
    feedBearerAuth,
    nugetCommand: vcpkgNuget.nuget,
    nugetSources,
    nugetVersion,
    vcpkgNuget: vcpkgNuget.result,
    vcpkgVersion,
  };
}
