/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { describe, expect, test } from "vitest";

import {
  assertMissingSystemDependency,
  parseMissingSystemDependencies,
} from "../scripts/assert-missing-system-dependency.mjs";

const bisonLog = `
## Configure fixture
> cmake -S test/fixtures/cmake-vcpkg -B /tmp/build -G Ninja
CMake Error at /usr/share/cmake/Modules/FindPackageHandleStandardArgs.cmake:
  Could NOT find BISON (missing: BISON_EXECUTABLE)
`;

function result(options) {
  return {
    buildLog: bisonLog,
    buildStatus: "1",
    expectedNeededBy: "project configure",
    expectedTool: "bison",
    ...options,
  };
}

describe("missing system dependency assertions", () => {
  test("extracts Bison project configure failures", () => {
    expect(parseMissingSystemDependencies(bisonLog)).toEqual([
      {
        evidence: "Could NOT find BISON (missing: BISON_EXECUTABLE)",
        neededBy: "project configure",
        suggestedPackage: "bison",
        tool: "bison",
      },
    ]);
  });

  test("accepts expected missing system dependency", () => {
    expect(assertMissingSystemDependency(result())).toBe(
      "Missing dependency bison accepted for project configure",
    );
  });

  test("rejects successful builds", () => {
    expect(() =>
      assertMissingSystemDependency(result({ buildStatus: "0" })),
    ).toThrow(/unexpectedly succeeded/);
  });

  test("rejects missing expected dependency", () => {
    expect(() =>
      assertMissingSystemDependency(
        result({
          expectedTool: "gmake",
        }),
      ),
    ).toThrow(/was not reported/);
  });
});
