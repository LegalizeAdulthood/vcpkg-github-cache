/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import * as path from "node:path";

export function nugetConfigDirectories(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): readonly string[] {
  if (platform === "win32") {
    return env.APPDATA ? [path.win32.join(env.APPDATA, "NuGet")] : [];
  }

  return env.HOME
    ? [
        path.posix.join(env.HOME, ".nuget", "NuGet"),
        path.posix.join(env.HOME, ".config", "NuGet"),
      ]
    : [];
}
