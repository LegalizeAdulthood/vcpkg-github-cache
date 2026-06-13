/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { describe, expect, test } from "vitest";

import {
  buildBinarySources,
  buildDisabledBinarySources,
  buildFeedUrl,
} from "../src/shared/cache";
import {
  normalizeTokenKind,
  parseBoolean,
  resolveFeedOwner,
  resolveUsername,
} from "../src/shared/inputs";
import { setupOutput } from "../src/shared/setup-output";

describe("shared action helpers", () => {
  test("parses enabled boolean inputs", () => {
    for (const value of ["1", "ON", "true", "Yes"]) {
      expect(parseBoolean(value)).toBe(true);
    }
  });

  test("treats every other boolean input as disabled", () => {
    for (const value of [undefined, "", "0", "false", "enabled"]) {
      expect(parseBoolean(value)).toBe(false);
    }
  });

  test("normalizes supported token kinds", () => {
    expect(normalizeTokenKind(undefined)).toBe("github");
    expect(normalizeTokenKind("")).toBe("github");
    expect(normalizeTokenKind("PAT")).toBe("pat");
  });

  test("rejects unsupported token kinds", () => {
    expect(() => normalizeTokenKind("oauth")).toThrow(/Unsupported/);
  });

  test("resolves feed owner from input or repository", () => {
    expect(resolveFeedOwner("LegalizeAdulthood", undefined)).toBe(
      "LegalizeAdulthood",
    );
    expect(resolveFeedOwner("", "octo/repo")).toBe("octo");
  });

  test("resolves token-kind-specific usernames", () => {
    expect(resolveUsername("", "github", "octo", "actor")).toBe("octo");
    expect(resolveUsername("", "pat", "octo", "actor")).toBe("actor");
    expect(resolveUsername("explicit", "pat", "octo", "actor")).toBe(
      "explicit",
    );
  });

  test("builds feed URL and vcpkg binary source", () => {
    const feedUrl = buildFeedUrl("octo");

    expect(feedUrl).toBe("https://nuget.pkg.github.com/octo/index.json");
    expect(buildBinarySources(feedUrl, "readwrite")).toBe(
      "clear;nuget,https://nuget.pkg.github.com/octo/index.json,readwrite",
    );
  });

  test("builds disabled binary source value", () => {
    expect(buildDisabledBinarySources()).toBe("clear");
  });

  test("builds setup outputs for configured and skipped NuGet", () => {
    const feedUrl = buildFeedUrl("octo");

    expect(setupOutput(feedUrl, "readwrite", true)).toEqual({
      binarySources:
        "clear;nuget,https://nuget.pkg.github.com/octo/index.json,readwrite",
      diagnosis: "vcpkg GitHub Packages cache setup complete",
    });
    expect(setupOutput(feedUrl, "readwrite", false)).toEqual({
      binarySources: "clear",
      diagnosis: "vcpkg GitHub Packages cache setup skipped NuGet",
    });
  });
});
