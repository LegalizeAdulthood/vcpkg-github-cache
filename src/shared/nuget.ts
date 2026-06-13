/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { mkdir } from "node:fs/promises";

import {
  CommandResult,
  CommandRunner,
  formatCommand,
  runCommand,
} from "./command";
import { nugetConfigDirectories } from "./nuget-config-paths";
import { NugetCommand } from "./vcpkg";

export { nugetConfigDirectories } from "./nuget-config-paths";

export interface NugetSourceSettings {
  readonly feedUrl: string;
  readonly sourceName: string;
  readonly token: string;
  readonly username: string;
}

export interface ConfigureNugetSourceOptions {
  readonly configDirectories?: readonly string[];
  readonly debug?: boolean;
  readonly log?: (message: string) => void;
  readonly run?: CommandRunner;
  readonly trace?: boolean;
}

export function buildNugetSourceRemoveArgs(
  sourceName: string,
): readonly string[] {
  return ["sources", "Remove", "-Name", sourceName, "-NonInteractive"];
}

export function buildNugetSourceAddArgs(
  settings: NugetSourceSettings,
): readonly string[] {
  return [
    "sources",
    "Add",
    "-Source",
    settings.feedUrl,
    "-StorePasswordInClearText",
    "-Name",
    settings.sourceName,
    "-UserName",
    settings.username,
    "-Password",
    settings.token,
    "-ValidAuthenticationTypes",
    "basic",
    "-NonInteractive",
    "-Verbosity",
    "detailed",
  ];
}

export function buildNugetSetApiKeyArgs(
  feedUrl: string,
  token: string,
): readonly string[] {
  return [
    "setapikey",
    token,
    "-Source",
    feedUrl,
    "-NonInteractive",
    "-Verbosity",
    "detailed",
  ];
}

export async function ensureNugetConfigDirectories(
  directories: readonly string[] = nugetConfigDirectories(),
): Promise<void> {
  for (const directory of directories) {
    await mkdir(directory, { recursive: true });
  }
}

export function redactNugetSecrets(
  value: string,
  settings: NugetSourceSettings,
): string {
  return value.split(settings.token).join("***");
}

async function runNuget(
  nuget: NugetCommand,
  args: readonly string[],
  settings: NugetSourceSettings,
  options: ConfigureNugetSourceOptions,
): Promise<CommandResult> {
  const commandArgs = [...nuget.args, ...args];

  if (options.trace) {
    options.log?.(
      `NuGet command: ${redactNugetSecrets(
        formatCommand(nuget.file, commandArgs),
        settings,
      )}`,
    );
  }

  const result = await (options.run ?? runCommand)(nuget.file, commandArgs);

  if (options.debug) {
    options.log?.(
      `NuGet stdout: ${redactNugetSecrets(result.stdout.trim(), settings)}`,
    );
    options.log?.(
      `NuGet stderr: ${redactNugetSecrets(result.stderr.trim(), settings)}`,
    );
  }

  return result;
}

function sanitizedErrorMessage(
  operation: string,
  settings: NugetSourceSettings,
  error: unknown,
): string {
  const detail = error instanceof Error ? error.message : String(error);

  return `${operation}: ${redactNugetSecrets(detail, settings)}`;
}

export async function configureNugetSource(
  nuget: NugetCommand,
  settings: NugetSourceSettings,
  options: ConfigureNugetSourceOptions = {},
): Promise<void> {
  const configDirectories =
    options.configDirectories ?? nugetConfigDirectories();

  if (options.trace) {
    for (const directory of configDirectories) {
      options.log?.(`NuGet config directory: ${directory}`);
    }
  }

  await ensureNugetConfigDirectories(configDirectories);

  try {
    await runNuget(
      nuget,
      buildNugetSourceRemoveArgs(settings.sourceName),
      settings,
      options,
    );
  } catch (error) {
    if (options.debug) {
      options.log?.(
        sanitizedErrorMessage(
          "NuGet source remove was ignored",
          settings,
          error,
        ),
      );
    }
    // Missing sources are fine; stale sources are removed before re-adding.
  }

  try {
    await runNuget(nuget, buildNugetSourceAddArgs(settings), settings, options);
  } catch (error) {
    throw new Error(
      sanitizedErrorMessage(
        "Failed to add GitHub Packages NuGet source",
        settings,
        error,
      ),
    );
  }

  try {
    await runNuget(
      nuget,
      buildNugetSetApiKeyArgs(settings.feedUrl, settings.token),
      settings,
      options,
    );
  } catch (error) {
    throw new Error(
      sanitizedErrorMessage(
        "Failed to set GitHub Packages NuGet API key",
        settings,
        error,
      ),
    );
  }
}
