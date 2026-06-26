/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { describe, expect, test } from "vitest";

import {
  matrixFromRefs,
  parseArgs,
  parseRefList,
  refSlug,
  releaseTagKey,
  resolveRefs,
  selectLatestReleaseTags,
  uniqueRefs,
} from "../scripts/resolve-vcpkg-refs.mjs";

describe("vcpkg ref resolver", () => {
  test("parses explicit refs and removes duplicates", () => {
    expect(parseRefList("2026.06.01, master,2026.06.01", "--refs")).toEqual([
      "2026.06.01",
      "master",
    ]);

    const options = parseArgs(
      ["--refs", "2026.06.01,master,master", "--no-github-output"],
      {},
    );

    expect(options.explicitRefs).toEqual(["2026.06.01", "master"]);
    expect(options.githubOutput).toBeUndefined();
  });

  test("rejects malformed arguments", () => {
    expect(() => parseArgs(["--refs", "2026.06.01,bad ref"], {})).toThrow(
      /whitespace/,
    );
    expect(() => parseArgs(["--latest"], {})).toThrow(/requires a value/);
    expect(() => parseArgs(["--latest", "many"], {})).toThrow(
      /non-negative integer/,
    );
    expect(() => parseArgs(["--latest", "0"], {})).toThrow(/requires/);
    expect(() => parseArgs(["--unknown"], {})).toThrow(/unknown option/);
  });

  test("sorts release tags newest first", () => {
    expect(releaseTagKey("2026.06.01")).toBe(20260601);
    expect(releaseTagKey("2026-05-15")).toBe(20260515);
    expect(releaseTagKey("master")).toBeUndefined();
    expect(releaseTagKey("2026.13.01")).toBeUndefined();

    expect(
      selectLatestReleaseTags(
        ["master", "2026.04.01", "2026.06.01", "2026.05.01", "2025.12.01"],
        3,
      ),
    ).toEqual(["2026.06.01", "2026.05.01", "2026.04.01"]);
  });

  test("emits stable explicit matrix JSON", async () => {
    const matrix = await resolveRefs(
      parseArgs(["--refs", "2026.06.01,master"], {}),
    );

    expect(matrix).toEqual(
      matrixFromRefs(["2026.06.01", "master"], "explicit"),
    );
    expect(JSON.stringify(matrix)).toBe(
      '{"include":[{"vcpkg_ref":"2026.06.01",' +
        '"vcpkg_ref_kind":"explicit","vcpkg_ref_slug":"2026.06.01"},' +
        '{"vcpkg_ref":"master","vcpkg_ref_kind":"explicit",' +
        '"vcpkg_ref_slug":"master"}]}',
    );
  });

  test("discovers release refs from mocked GitHub tag pages", async () => {
    const requestedUrls = [];
    const options = {
      ...parseArgs(["--latest", "3", "--extra-ref", "master"], {}),
      requestJson: async (url) => {
        requestedUrls.push(url);
        return [
          { name: "master" },
          { name: "2026.06.01" },
          { name: "2026.05.01" },
          { name: "2026.04.01" },
          { name: "2025.12.01" },
        ];
      },
    };

    await expect(resolveRefs(options)).resolves.toEqual({
      include: [
        {
          vcpkg_ref: "2026.06.01",
          vcpkg_ref_kind: "release-tag",
          vcpkg_ref_slug: "2026.06.01",
        },
        {
          vcpkg_ref: "2026.05.01",
          vcpkg_ref_kind: "release-tag",
          vcpkg_ref_slug: "2026.05.01",
        },
        {
          vcpkg_ref: "2026.04.01",
          vcpkg_ref_kind: "release-tag",
          vcpkg_ref_slug: "2026.04.01",
        },
        {
          vcpkg_ref: "master",
          vcpkg_ref_kind: "explicit",
          vcpkg_ref_slug: "master",
        },
      ],
    });
    expect(requestedUrls).toEqual([
      "https://api.github.com/repos/microsoft/vcpkg/tags?per_page=100&page=1",
    ]);
  });

  test("reports too few release refs from mocked data", async () => {
    const options = {
      ...parseArgs(["--latest", "2"], {}),
      requestJson: async () => [{ name: "master" }, { name: "2026.06.01" }],
    };

    await expect(resolveRefs(options)).rejects.toThrow(
      /found 1 release tags, expected 2/,
    );
  });

  test("keeps first occurrence when uniquing refs", () => {
    expect(uniqueRefs(["master", "2026.06.01", "master"])).toEqual([
      "master",
      "2026.06.01",
    ]);
  });

  test("slugifies refs for artifact names", () => {
    expect(refSlug("feature/vcpkg test")).toBe("feature-vcpkg-test");
    expect(refSlug("2026.06.01")).toBe("2026.06.01");
    expect(refSlug("///")).toBe("ref");
  });
});
