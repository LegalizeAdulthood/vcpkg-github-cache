/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";

import { AnalyzerLiveProbes, formatProbeResult } from "./analyze-probes";
import { BuildLogFacts } from "./build-log";
import { CacheDiagnosis, FailOnPolicy } from "./diagnosis";
import { safeGithubContext } from "./github-context";
import { TokenKind } from "./inputs";
import { ReadTextFile, sanitizedNugetConfigDump } from "./nuget-config";
import { PackageConfigDiscovery, packageIdentityKey } from "./package-config";
import {
  formatPackageMetadataProbe,
  PackageMetadataProbe,
} from "./package-metadata";
import { RestoreProbe } from "./restore-probe";
import { VcpkgPaths } from "./vcpkg";

export interface DiagnosticsArtifactInput {
  readonly buildLog: string;
  readonly buildLogFacts?: BuildLogFacts;
  readonly builtCount: string;
  readonly diagnosis: CacheDiagnosis;
  readonly failOnPolicy: FailOnPolicy;
  readonly feedOwner: string;
  readonly feedUrl: string;
  readonly liveProbes: AnalyzerLiveProbes;
  readonly packageConfigGlob: string;
  readonly packageConfigs: PackageConfigDiscovery;
  readonly packageMetadata?: PackageMetadataProbe;
  readonly requestedCount: number;
  readonly restoreProbe: RestoreProbe;
  readonly restoredCount: string;
  readonly token: string;
  readonly tokenKind: TokenKind;
  readonly uploadedCount: string;
  readonly username: string;
  readonly vcpkg: VcpkgPaths;
  readonly workspace: string;
}

export interface DiagnosticsArtifactOptions {
  readonly artifactName?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly nugetConfigPaths?: readonly string[];
  readonly readNugetConfigFile?: ReadTextFile;
  readonly rootDirectory?: string;
  readonly upload?: ArtifactUpload;
}

export interface UploadArtifactResult {
  readonly digest?: string;
  readonly id?: number;
  readonly size?: number;
}

export type ArtifactUpload = (
  name: string,
  files: string[],
  rootDirectory: string,
) => Promise<UploadArtifactResult>;

interface ArtifactFile {
  readonly content: string;
  readonly path: string;
}

const ARTIFACT_DIRECTORY_NAME = "vcpkg-cache-diagnostics";
const ARTIFACT_NAME_PREFIX = "vcpkg-cache-diagnostics";
const MAX_FILE_LENGTH = 64 * 1024;
const MAX_LIST_ITEMS = 200;

function optional(value: string | undefined): string {
  return value && value.length > 0 ? value : "unknown";
}

function sanitizeArtifactName(value: string): string {
  const name = value
    .replace(/["*:<>?|\\/\r\n]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return name || ARTIFACT_NAME_PREFIX;
}

export function defaultDiagnosticsArtifactName(
  env: NodeJS.ProcessEnv = process.env,
  uniqueId = randomUUID().slice(0, 8),
): string {
  return sanitizeArtifactName(
    [
      ARTIFACT_NAME_PREFIX,
      env.GITHUB_JOB,
      env.RUNNER_OS,
      env.RUNNER_ARCH,
      uniqueId,
    ]
      .filter((value) => value && value.length > 0)
      .join("-"),
  );
}

export function sanitizeDiagnosticsText(value: string, token: string): string {
  const tokenRedacted = token ? value.split(token).join("***") : value;

  return tokenRedacted
    .replace(/\bAuthorization:\s*[^\r\n]+/gi, "Authorization: ***")
    .replace(/\bX-NuGet-ApiKey:\s*[^\r\n]+/gi, "X-NuGet-ApiKey: ***")
    .replace(
      /(\b(?:ClearTextPassword|Password|ApiKey|apikey)\b\s*[:=]\s*)[^\r\n]+/gi,
      "$1***",
    )
    .replace(
      /(<add\b[^>]*\bkey=["'](?:ClearTextPassword|Password|ApiKey|apikey)["'][^>]*\bvalue=["'])[^"']+(["'][^>]*>)/gi,
      "$1***$2",
    );
}

function boundFileContent(value: string): string {
  if (value.length <= MAX_FILE_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_FILE_LENGTH)}\n... truncated ...\n`;
}

function lines(values: readonly string[]): string {
  return `${values.join("\n")}\n`;
}

function listValues(values: readonly string[]): readonly string[] {
  if (values.length <= MAX_LIST_ITEMS) {
    return values;
  }

  return [
    ...values.slice(0, MAX_LIST_ITEMS),
    `... truncated ${values.length - MAX_LIST_ITEMS} item(s) ...`,
  ];
}

function keyValue(label: string, value: string | number): string {
  return `${label}: ${value}`;
}

function probeFile(label: string, output: string | undefined): string {
  return lines([label, "", output?.trim() || ""]);
}

function environment(input: DiagnosticsArtifactInput, env: NodeJS.ProcessEnv) {
  return lines([
    keyValue("runner os", optional(env.RUNNER_OS)),
    keyValue("runner arch", optional(env.RUNNER_ARCH)),
    keyValue("image os", optional(env.ImageOS)),
    keyValue("image version", optional(env.ImageVersion)),
    keyValue("node platform", process.platform),
    keyValue("node arch", process.arch),
    keyValue("workspace", input.workspace),
    keyValue("vcpkg root", input.vcpkg.root),
    keyValue("feed owner", input.feedOwner),
    keyValue("token kind", input.tokenKind),
    keyValue("username", input.username),
  ]);
}

function summary(input: DiagnosticsArtifactInput): string {
  return lines([
    "# vcpkg GitHub Packages cache diagnostics",
    "",
    keyValue("diagnosis", input.diagnosis.diagnosis),
    keyValue("cache status", input.diagnosis.cacheStatus),
    keyValue("failure kind", input.diagnosis.failureKind || "none"),
    keyValue("feed", input.feedUrl),
    keyValue("requested packages", input.requestedCount),
    keyValue("restored packages", input.restoredCount || "unknown"),
    keyValue("built packages", input.builtCount || "unknown"),
    keyValue("uploaded packages", input.uploadedCount || "unknown"),
    keyValue("fail-on", input.failOnPolicy),
  ]);
}

function vcpkgToolMetadata(input: DiagnosticsArtifactInput): string {
  return lines([
    keyValue("root", input.vcpkg.root),
    keyValue("executable", input.vcpkg.executable),
    keyValue("bootstrap script", input.vcpkg.bootstrapScript),
  ]);
}

function nugetCommand(input: DiagnosticsArtifactInput): string {
  return lines([
    keyValue(
      "command",
      input.liveProbes.nugetCommand?.display ??
        input.liveProbes.vcpkgNuget.detail,
    ),
  ]);
}

function packageConfig(input: DiagnosticsArtifactInput): string {
  const output: string[] = [
    keyValue("glob", input.packageConfigGlob),
    keyValue("files", input.packageConfigs.files.length),
    keyValue(
      "requested packages",
      input.packageConfigs.requestedPackages.length,
    ),
    "",
  ];

  for (const file of input.packageConfigs.files) {
    output.push(keyValue("file", `${file.path} (${file.packages.length})`));
    output.push(
      ...listValues(
        file.packages.map((identity) => packageIdentityKey(identity)),
      ),
    );
    output.push("");
  }

  return lines(output);
}

function buildLogExtract(facts: BuildLogFacts | undefined): string {
  if (!facts) {
    return lines(["build log not supplied"]);
  }

  return lines([
    keyValue("requested packages", optional(facts.requestedCount?.toString())),
    keyValue("restored packages", optional(facts.restoredCount?.toString())),
    keyValue("built packages", optional(facts.builtCount?.toString())),
    keyValue("uploaded packages", optional(facts.uploadedCount?.toString())),
    keyValue("submissions started", facts.submissionsStarted),
    keyValue("uploads attempted", facts.uploadsAttempted),
    keyValue("zero-cache submissions", facts.zeroCacheSubmissions),
    keyValue("failed HTTP statuses", facts.failedHttpStatuses.join(", ")),
    keyValue("auth messages", facts.authMessages.length),
    ...listValues(facts.authMessages).map((message) => `auth: ${message}`),
    keyValue("quota messages", facts.quotaMessages.length),
    ...listValues(facts.quotaMessages).map((message) => `quota: ${message}`),
    keyValue("NuGet config paths", facts.nugetConfigPaths.length),
    ...listValues(facts.nugetConfigPaths),
    keyValue("feeds", facts.feeds.length),
    ...listValues(facts.feeds),
  ]);
}

function artifactFiles(
  input: DiagnosticsArtifactInput,
  env: NodeJS.ProcessEnv,
  nugetConfig: string,
): readonly ArtifactFile[] {
  return [
    { content: summary(input), path: "summary.md" },
    { content: environment(input, env), path: "environment.txt" },
    { content: safeGithubContext(env), path: "github-context.txt" },
    {
      content: `${input.liveProbes.vcpkgVersion.detail}\n`,
      path: "vcpkg-version.txt",
    },
    { content: vcpkgToolMetadata(input), path: "vcpkg-tool-metadata.txt" },
    {
      content: `${input.liveProbes.nugetVersion.detail}\n`,
      path: "nuget-version.txt",
    },
    { content: nugetCommand(input), path: "nuget-command.txt" },
    {
      content: probeFile(
        formatProbeResult(input.liveProbes.nugetSources),
        input.liveProbes.nugetSources.output,
      ),
      path: "nuget-sources.txt",
    },
    {
      content: nugetConfig,
      path: "nuget-config-sanitized.txt",
    },
    {
      content: probeFile(formatProbeResult(input.liveProbes.feedBasicAuth), ""),
      path: "feed-probe-basic.txt",
    },
    {
      content: probeFile(
        formatProbeResult(input.liveProbes.feedBearerAuth),
        "",
      ),
      path: "feed-probe-bearer.txt",
    },
    { content: packageConfig(input), path: "packages-config.txt" },
    {
      content: formatPackageMetadataProbe(input.packageMetadata),
      path: "package-metadata.txt",
    },
    {
      content: probeFile(
        formatProbeResult(input.restoreProbe.result),
        input.restoreProbe.result.output,
      ),
      path: "restore-probe.txt",
    },
    {
      content: buildLogExtract(input.buildLogFacts),
      path: "build-log-extract.txt",
    },
  ];
}

async function writeArtifactFile(
  rootDirectory: string,
  relativePath: string,
  content: string,
  token: string,
): Promise<string> {
  const filePath = path.join(
    rootDirectory,
    ARTIFACT_DIRECTORY_NAME,
    relativePath,
  );
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(
    filePath,
    boundFileContent(sanitizeDiagnosticsText(content, token)),
    "utf8",
  );
  return filePath;
}

export async function uploadDiagnosticsArtifact(
  input: DiagnosticsArtifactInput,
  options: DiagnosticsArtifactOptions = {},
): Promise<string> {
  if (!options.upload) {
    throw new Error("diagnostics artifact upload function is required");
  }

  const artifactName = options.artifactName
    ? sanitizeArtifactName(options.artifactName)
    : defaultDiagnosticsArtifactName(options.env);
  const rootDirectory =
    options.rootDirectory ??
    (await mkdtemp(path.join(tmpdir(), "vcpkg-cache-diagnostics-")));
  const env = options.env ?? process.env;
  const nugetConfig = await sanitizedNugetConfigDump({
    configPaths: options.nugetConfigPaths,
    env,
    extraConfigPaths: input.buildLogFacts?.nugetConfigPaths,
    readFile: options.readNugetConfigFile,
    token: input.token,
  });
  const files = await Promise.all(
    artifactFiles(input, env, nugetConfig).map((file) =>
      writeArtifactFile(rootDirectory, file.path, file.content, input.token),
    ),
  );

  await options.upload(artifactName, files, rootDirectory);
  return artifactName;
}
