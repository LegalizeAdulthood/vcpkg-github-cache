/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { execFileSync } from "node:child_process";

import { describe, expect, test } from "vitest";

import { buildSetupPlan } from "../src/shared/setup-plan";
import { renderSetupScript } from "../src/shared/setup-script";

const combinations = [
  { target: "freebsd", manager: "pkg", command: "pkg install -y" },
  { target: "netbsd", manager: "pkg_add", command: "/usr/sbin/pkg_add -u" },
  { target: "netbsd", manager: "pkgin", command: "pkgin -y install" },
  { target: "openbsd", manager: "pkg_add", command: "pkg_add -I" },
];

describe("BSD package manager selection", () => {
  test.each(combinations)(
    "uses $manager for every $target install",
    ({ target, manager, command }) => {
      for (const installNuget of ["true", "false"]) {
        const plan = buildSetupPlan({
          repository: "octo/repo",
          executionModeInput: "emit-script",
          targetOsInput: target,
          packageManagerInput: manager,
          installNugetInput: installNuget,
        });
        expect(plan.packageManager).toBe(manager);
        const script = renderSetupScript(plan);
        expect(script).toContain(`${command} \${missing_packages}`);
        if (installNuget === "true") {
          expect(script).toContain(`${command} mono`);
        } else {
          expect(script).not.toContain(`${command} mono`);
        }
        if (target === "netbsd") {
          expect(script).toContain(`${command} mozilla-rootcerts-openssl`);
        }
        for (const other of combinations) {
          if (other.command !== command)
            expect(script).not.toContain(`${other.command} `);
        }
        execFileSync("sh", ["-n"], { input: script });
      }
    },
  );

  test.each([
    ["freebsd", "pkg"],
    ["netbsd", "pkg_add"],
    ["openbsd", "pkg_add"],
  ])("preserves the default manager for %s", (target, expected) => {
    for (const value of [undefined, "", "  "]) {
      const plan = buildSetupPlan({
        repository: "octo/repo",
        targetOsInput: target,
        packageManagerInput: value,
      });
      expect(plan.packageManager).toBe(expected);
      const explicit = buildSetupPlan({
        repository: "octo/repo",
        targetOsInput: target,
        packageManagerInput: expected,
      });
      expect(renderSetupScript(plan)).toBe(renderSetupScript(explicit));
    }
  });

  test("normalizes an explicit manager", () => {
    expect(
      buildSetupPlan({
        repository: "octo/repo",
        targetOsInput: "netbsd",
        packageManagerInput: " PKGIN ",
      }).packageManager,
    ).toBe("pkgin");
  });

  for (const target of ["current", "freebsd", "netbsd", "openbsd"]) {
    const invalid = [
      "pkg",
      "pkg_add",
      "pkgin",
      "apt",
      "pkgin; echo unsafe",
    ].filter(
      (manager) =>
        !combinations.some(
          (combination) =>
            combination.target === target && combination.manager === manager,
        ),
    );
    test.each(invalid)(`rejects %s for ${target}`, (manager) => {
      expect(() =>
        buildSetupPlan({
          repository: "octo/repo",
          targetOsInput: target,
          packageManagerInput: manager,
        }),
      ).toThrow(
        `Unsupported package-manager '${manager}' for target-os=${target}`,
      );
    });
  }

  test("passes bootstrap dependency arguments to pkgin", () => {
    const plan = buildSetupPlan({
      repository: "octo/repo",
      targetOsInput: "netbsd",
      packageManagerInput: "pkgin",
    });
    const script = renderSetupScript(plan);
    const start = script.indexOf("ensure_bsd_bootstrap_packages() {");
    const install = script.slice(start, script.indexOf("\n}\n", start) + 3);
    const result = execFileSync("sh", ["-s"], {
      encoding: "utf8",
      input: [
        "set -eu",
        "command_exists() { return 1; }",
        "pkgin() { printf '<%s>\\n' \"$@\"; }",
        install,
        "ensure_bsd_bootstrap_packages",
      ].join("\n"),
    });
    expect(result).toContain("<-y>\n<install>\n<curl>\n<zip>\n<unzip>\n");
  });
});
