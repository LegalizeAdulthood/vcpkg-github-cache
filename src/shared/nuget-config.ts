/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { readFile as readFileDefault } from "node:fs/promises";
import * as path from "node:path";

import { nugetConfigDirectories } from "./nuget-config-paths";

export type ReadTextFile = (path: string) => Promise<string>;

export interface NugetConfigDumpOptions {
  readonly configPaths?: readonly string[];
  readonly env?: NodeJS.ProcessEnv;
  readonly extraConfigPaths?: readonly string[];
  readonly platform?: NodeJS.Platform;
  readonly readFile?: ReadTextFile;
  readonly token?: string;
}

const CONFIG_FILE_NAME = "NuGet.Config";

async function readTextFileDefault(path: string): Promise<string> {
  return await readFileDefault(path, "utf8");
}

function joinConfigPath(directory: string, platform: NodeJS.Platform): string {
  if (platform === "win32") {
    return path.win32.join(directory, CONFIG_FILE_NAME);
  }

  return path.posix.join(directory, CONFIG_FILE_NAME);
}

export function defaultNugetConfigPaths(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): readonly string[] {
  return nugetConfigDirectories(platform, env).map((directory) =>
    joinConfigPath(directory, platform),
  );
}

function uniqueValues(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

function redactExactSecret(value: string, secret: string | undefined): string {
  return secret ? value.split(secret).join("***") : value;
}

function redactValueAttributes(value: string): string {
  return value.replace(/(\bvalue\s*=\s*["'])[^"']*(["'])/gi, "$1***$2");
}

function redactLine(line: string, insideApiKeys: boolean): string {
  const credentialKey =
    /\bkey\s*=\s*["'](?:ClearTextPassword|Password|ApiKey|apikey)["']/i;
  const credentialText =
    /(\b(?:ClearTextPassword|Password|ApiKey|apikey)\b\s*[:=]\s*)[^\r\n]+/gi;

  if (insideApiKeys || credentialKey.test(line)) {
    return redactValueAttributes(line);
  }

  return line.replace(credentialText, "$1***");
}

export function sanitizeNugetConfig(value: string, token = ""): string {
  let insideApiKeys = false;
  const lines = redactExactSecret(value, token)
    .split(/\r?\n/)
    .map((line) => {
      const lineInsideApiKeys = insideApiKeys || /<apikeys\b/i.test(line);
      const redacted = redactLine(line, lineInsideApiKeys);

      if (/<apikeys\b/i.test(line) && !/<\/apikeys>/i.test(line)) {
        insideApiKeys = true;
      }

      if (/<\/apikeys>/i.test(line)) {
        insideApiKeys = false;
      }

      return redacted;
    });

  return lines.join("\n");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function configFileOutput(
  configPath: string,
  status: string,
  content = "",
): string {
  const output = [`file: ${configPath}`, `status: ${status}`];

  if (content) {
    output.push("", content.trimEnd());
  }

  return output.join("\n");
}

export async function sanitizedNugetConfigDump(
  options: NugetConfigDumpOptions = {},
): Promise<string> {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const readFile = options.readFile ?? readTextFileDefault;
  const configPaths = uniqueValues([
    ...(options.configPaths ?? defaultNugetConfigPaths(platform, env)),
    ...(options.extraConfigPaths ?? []),
  ]);

  if (configPaths.length === 0) {
    return "no NuGet config paths found\n";
  }

  const outputs: string[] = [];

  for (const configPath of configPaths) {
    try {
      const content = await readFile(configPath);
      outputs.push(
        configFileOutput(
          configPath,
          "ok",
          sanitizeNugetConfig(content, options.token),
        ),
      );
    } catch (error) {
      outputs.push(
        configFileOutput(configPath, `unreadable: ${errorMessage(error)}`),
      );
    }
  }

  return `${outputs.join("\n\n")}\n`;
}
