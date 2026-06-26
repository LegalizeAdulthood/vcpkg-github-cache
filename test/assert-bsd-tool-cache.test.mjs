/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { describe, expect, test } from "vitest";

import { assertBsdToolCache } from "../scripts/assert-bsd-tool-cache.mjs";

const coldPublishedLog = `
Restoring FreeBSD vcpkg tool package: vcpkg-tool_freebsd-x64 1.0.0-vcpkgtoolabc
FreeBSD vcpkg tool package not restored
Bootstrapping vcpkg
Published FreeBSD vcpkg tool package
`;

const coldRestoredLog = `
Restoring FreeBSD vcpkg tool package: vcpkg-tool_freebsd-x64 1.0.0-vcpkgtoolabc
Restored cached FreeBSD vcpkg tool
vcpkg bootstrap skipped: cached tool restored
`;

const warmRestoredLog = `
Restoring FreeBSD vcpkg tool package: vcpkg-tool_freebsd-x64 1.0.0-vcpkgtoolabc
Restored cached FreeBSD vcpkg tool
vcpkg bootstrap skipped: cached tool restored
`;

function result(options) {
  return {
    buildStatus: "0",
    targetOs: "freebsd",
    toolLog: coldPublishedLog,
    warmStatus: "0",
    warmToolLog: warmRestoredLog,
    ...options,
  };
}

describe("BSD tool cache assertions", () => {
  test("accepts a cold publish followed by a warm restore", () => {
    expect(assertBsdToolCache(result())).toBe(
      "FreeBSD vcpkg tool cache accepted",
    );
  });

  test("accepts an already-warm first setup followed by a warm restore", () => {
    expect(assertBsdToolCache(result({ toolLog: coldRestoredLog }))).toBe(
      "FreeBSD vcpkg tool cache accepted",
    );
  });

  test("rejects a warm setup that bootstraps from source", () => {
    expect(() =>
      assertBsdToolCache(
        result({
          warmToolLog: `
Restoring FreeBSD vcpkg tool package: vcpkg-tool_freebsd-x64 1.0.0-vcpkgtoolabc
FreeBSD vcpkg tool package not restored
Bootstrapping vcpkg
Published FreeBSD vcpkg tool package
`,
        }),
      ),
    ).toThrow(/warm setup did not restore/);
  });

  test("rejects a cold setup that never mentions the tool package", () => {
    expect(() =>
      assertBsdToolCache(
        result({
          toolLog: "Bootstrapping vcpkg\n",
        }),
      ),
    ).toThrow(/did not mention/);
  });

  test("skips after a failed fixture build", () => {
    expect(assertBsdToolCache(result({ buildStatus: "1" }))).toBe(
      "BSD tool cache assertion skipped after build status 1",
    );
  });
});
