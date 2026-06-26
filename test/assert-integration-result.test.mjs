/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { describe, expect, test } from "vitest";

import { assertIntegrationResult } from "../scripts/assert-integration-result.mjs";

function result(options) {
  return {
    buildStatus: "0",
    cacheMode: "readwrite",
    cacheStatus: "warm-hit",
    diagnosis: "Cache status: warm hit",
    failureKind: "",
    ...options,
  };
}

describe("integration result assertions", () => {
  test("accepts healthy readwrite cache outcomes", () => {
    expect(
      assertIntegrationResult(
        result({ cacheStatus: "partial-hit", failureKind: "cache-miss" }),
      ),
    ).toBe("Cache status partial-hit accepted for readwrite");

    expect(assertIntegrationResult(result({ cacheStatus: "cold-seed" }))).toBe(
      "Cache status cold-seed accepted for readwrite",
    );
  });

  test("rejects upload failures even when the cache status is partial", () => {
    expect(() =>
      assertIntegrationResult(
        result({ cacheStatus: "partial-hit", failureKind: "upload-failure" }),
      ),
    ).toThrow(/Unexpected failure kind/);
  });

  test("accepts disabled and readonly expectations", () => {
    expect(
      assertIntegrationResult(
        result({
          cacheMode: "disabled",
          cacheStatus: "cache-disabled",
          failureKind: "cache-miss",
        }),
      ),
    ).toBe("Cache status cache-disabled accepted for disabled");

    expect(
      assertIntegrationResult(
        result({
          cacheMode: "readonly",
          cacheStatus: "cache-disabled",
          failureKind: "cache-miss",
        }),
      ),
    ).toBe("Cache status cache-disabled accepted for readonly");
  });

  test("rejects unexpected statuses for the selected cache mode", () => {
    expect(() =>
      assertIntegrationResult(
        result({ cacheMode: "disabled", cacheStatus: "warm-hit" }),
      ),
    ).toThrow(/Unexpected cache status/);
  });

  test("skips cache assertions after build failure", () => {
    expect(
      assertIntegrationResult(
        result({ buildStatus: "1", cacheStatus: "unknown" }),
      ),
    ).toBe("Cache assertion skipped after build status 1");
  });
});
