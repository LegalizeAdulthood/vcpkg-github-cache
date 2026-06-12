/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { CommandRunner, runCommand } from "./command";
import { NugetCommand } from "./vcpkg";

export interface NugetSourceSettings {
  readonly feedUrl: string;
  readonly sourceName: string;
  readonly token: string;
  readonly username: string;
}

export function buildNugetSourceRemoveArgs(
  sourceName: string,
): readonly string[] {
  return ["sources", "Remove", "-Name", sourceName];
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
  ];
}

export function buildNugetSetApiKeyArgs(
  feedUrl: string,
  token: string,
): readonly string[] {
  return ["setapikey", token, "-Source", feedUrl];
}

async function runNuget(
  nuget: NugetCommand,
  args: readonly string[],
  run: CommandRunner,
): Promise<void> {
  await run(nuget.file, [...nuget.args, ...args]);
}

export async function configureNugetSource(
  nuget: NugetCommand,
  settings: NugetSourceSettings,
  run: CommandRunner = runCommand,
): Promise<void> {
  try {
    await runNuget(nuget, buildNugetSourceRemoveArgs(settings.sourceName), run);
  } catch {
    // Missing sources are fine; stale sources are removed before re-adding.
  }

  try {
    await runNuget(nuget, buildNugetSourceAddArgs(settings), run);
  } catch {
    throw new Error("Failed to add GitHub Packages NuGet source");
  }

  try {
    await runNuget(
      nuget,
      buildNugetSetApiKeyArgs(settings.feedUrl, settings.token),
      run,
    );
  } catch {
    throw new Error("Failed to set GitHub Packages NuGet API key");
  }
}
