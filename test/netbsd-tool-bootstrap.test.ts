/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";

import { expect, test } from "vitest";

import { buildSetupPlan } from "../src/shared/setup-plan";
import { renderSetupScript } from "../src/shared/setup-script";

test.each(["fresh", "upgrade", "linux", "unlisted", "mismatch"])(
  "handles the %s NetBSD 2025-06-02 cold bootstrap",
  async (scenario) => {
    const fixture = JSON.parse(
      await readFile(
        new URL(
          "./fixtures/netbsd-legacy-tool/2025-06-02.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ) as { files: Record<string, string> };
    const workspace = await mkdtemp(path.join(tmpdir(), "vc-cache-netbsd-"));
    try {
      const sourceDir = path.join(workspace, "tool sources");
      for (const [file, content] of Object.entries(fixture.files)) {
        const target = path.join(sourceDir, file);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, content);
      }
      if (scenario === "mismatch") {
        await writeFile(
          path.join(sourceDir, "include/vcpkg/tools.test.h"),
          "unexpected source layout\n",
        );
      }

      const helperFile = path.join(workspace, "scripts", "bootstrap.sh");
      await mkdir(path.dirname(helperFile));
      const extractor = scenario === "upgrade" ? "Archive" : "Tar";
      const archive = extractor === "Archive" ? "archivePath" : "tarballPath";
      const oldPatch =
        scenario === "upgrade"
          ? [
              "    # vcpkg-github-cache NetBSD legacy tool patch",
              '    case "$VCPKG_TOOL_RELEASE_TAG" in',
              "    2025-07-21|2025-09-03) : ;;",
              "    esac",
              "    # vcpkg-github-cache NetBSD vcpkg-tool isfinite patch",
            ]
          : [];
      await writeFile(
        helperFile,
        [
          "#!/bin/sh",
          "set -eu",
          'uname() { printf "%s\\n" "$TEST_HOST"; }',
          `vcpkgExtract${extractor}() { :; }`,
          `${archive}=unused`,
          "srcBaseDir=unused",
          "srcDir='tool sources'",
          `vcpkgExtract${extractor} "$${archive}" "$srcBaseDir"`,
          ...oldPatch,
          "printf '%s\\n' ready > compile.started",
          "",
        ].join("\n"),
      );

      const plan = buildSetupPlan({
        executionModeInput: "emit-script",
        repository: "octo/repo",
        targetOsInput: "netbsd",
      });
      const script = renderSetupScript(plan);
      const start = script.indexOf("patch_netbsd_vcpkg_tool_bootstrap() {");
      const patch = script.slice(start, script.indexOf("\n}\n", start) + 3);
      const apply = () =>
        execFileSync("sh", ["-s"], {
          cwd: workspace,
          input: `set -eu\nVCPKG_ROOT=.\n${patch}\npatch_netbsd_vcpkg_tool_bootstrap\n`,
        });
      apply();
      const patched = await readFile(helperFile, "utf8");
      apply();
      await expect(readFile(helperFile, "utf8")).resolves.toBe(patched);
      expect(
        patched.match(/^ {4}# vcpkg-github-cache NetBSD legacy tool patch$/gm),
      ).toHaveLength(1);
      expect(
        patched.match(
          /^ {4}# vcpkg-github-cache NetBSD vcpkg-tool isfinite patch$/gm,
        ),
      ).toHaveLength(1);
      execFileSync("sh", ["-n", helperFile]);

      const result = spawnSync("sh", [helperFile], {
        cwd: workspace,
        encoding: "utf8",
        env: {
          ...process.env,
          TEST_HOST: scenario === "linux" ? "Linux" : "NetBSD",
          VCPKG_TOOL_RELEASE_TAG:
            scenario === "unlisted" ? "2026-01-01" : "2025-06-02",
        },
      });
      if (scenario === "mismatch") {
        expect(result.status).not.toBe(0);
        await expect(
          readFile(path.join(workspace, "compile.started")),
        ).rejects.toThrow();
        return;
      }
      expect(result.status, result.stdout + result.stderr).toBe(0);
      await expect(
        readFile(path.join(workspace, "compile.started"), "utf8"),
      ).resolves.toBe("ready\n");
      if (scenario === "linux" || scenario === "unlisted") {
        for (const [file, content] of Object.entries(fixture.files)) {
          await expect(
            readFile(path.join(sourceDir, file), "utf8"),
          ).resolves.toBe(content);
        }
        return;
      }

      const source = async (file: string) =>
        readFile(path.join(sourceDir, file), "utf8");
      await expect(source("src/vcpkg/base/system.cpp")).resolves.toContain(
        'return "netbsd";',
      );
      await expect(source("src/vcpkg/base/system.cpp")).resolves.toContain(
        'return "unknown";',
      );
      await expect(
        source("src/vcpkg/base/system.process.cpp"),
      ).resolves.toContain(
        "#if defined(__FreeBSD__) || defined(__OpenBSD__) || defined(__NetBSD__)\nextern char** environ;",
      );
      const mac = await source("src/vcpkg/base/system.mac.cpp");
      expect(mac.match(/defined\(__NetBSD__\)/g)).toHaveLength(3);
      await expect(source("include/vcpkg/tools.test.h")).resolves.toContain(
        "NetBsd,",
      );
      await expect(source("src/vcpkg-test/tools.cpp")).resolves.toContain(
        'openbsd, netbsd" == invalid_os.error()',
      );
      await expect(source("src/vcpkg/commands.build.cpp")).resolves.toContain(
        '"toolchains/netbsd.cmake"',
      );
      await expect(
        source("src/vcpkg/platform-expression.cpp"),
      ).resolves.toContain(
        'Identifier::netbsd: return true_if_exists_and_equal("VCPKG_CMAKE_SYSTEM_NAME", "NetBSD")',
      );
      await expect(source("src/vcpkg/tools.cpp")).resolves.toContain(
        "hp, ToolOs::NetBsd)",
      );
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  },
);
