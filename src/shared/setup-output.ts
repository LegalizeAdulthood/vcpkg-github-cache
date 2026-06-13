/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { buildBinarySources, buildDisabledBinarySources } from "./cache";

export interface SetupOutput {
  readonly binarySources: string;
  readonly diagnosis: string;
}

export function setupOutput(
  feedUrl: string,
  access: string,
  nugetConfigured: boolean,
): SetupOutput {
  if (!nugetConfigured) {
    return {
      binarySources: buildDisabledBinarySources(),
      diagnosis: "vcpkg GitHub Packages cache setup skipped NuGet",
    };
  }

  return {
    binarySources: buildBinarySources(feedUrl, access),
    diagnosis: "vcpkg GitHub Packages cache setup complete",
  };
}
