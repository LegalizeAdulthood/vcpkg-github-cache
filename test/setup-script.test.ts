/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";

import { describe, expect, test } from "vitest";

import { buildSetupPlan } from "../src/shared/setup-plan";
import {
  emitSetupFiles,
  readVcpkgCommit,
  renderSetupEnvironment,
  renderSetupScript,
} from "../src/shared/setup-script";

describe("setup script emission", () => {
  test("renders a minimal POSIX setup script", () => {
    const plan = buildSetupPlan({
      executionModeInput: "emit-script",
      repository: "octo/repo",
      targetOsInput: "freebsd",
    });
    const script = renderSetupScript(plan);

    expect(script).toContain("#!/bin/sh\nset -eu\n");
    expect(script).toContain("command_exists() {\n");
    expect(script).toContain('  command -v "$1" >/dev/null 2>&1\n');
    expect(script).toContain(
      ': "${VCPKG_GITHUB_CACHE_TOKEN:?VCPKG_GITHUB_CACHE_TOKEN is required}"',
    );
    expect(script).toContain('if [ -z "${VCPKG_ROOT:-}" ]; then');
    expect(script).toContain("  VCPKG_ROOT='vcpkg'");
    expect(script).toContain("export VCPKG_ROOT");
    expect(script).toContain(
      "printf '%s\\n' 'vcpkg GitHub Packages cache setup script'",
    );
    expect(script).toContain("printf '%s\\n' 'Target OS: freebsd'");
    expect(script).toContain(
      "printf '%s\\n' 'Feed: https://nuget.pkg.github.com/octo/index.json'",
    );
  });

  test("renders target-side vcpkg bootstrap and NuGet fetch", () => {
    const plan = buildSetupPlan({
      executionModeInput: "emit-script",
      repository: "octo/repo",
      targetOsInput: "freebsd",
      vcpkgRootInput: "deps/vcpkg",
      workspace: "C:/host/repo",
    });
    const script = renderSetupScript(plan);

    expect(script).toContain('vcpkg_exe="${VCPKG_ROOT}/vcpkg"');
    expect(script).toContain("  VCPKG_ROOT='deps/vcpkg'");
    expect(script).toContain("ensure_bsd_bootstrap_packages");
    expect(script).toContain('missing_packages="${missing_packages} unzip"');
    expect(script).toContain("pkg install -y ${missing_packages}");
    expect(script).toContain("ensure_bsd_libcurl_compat() {\n  :\n}");
    expect(script).toContain("ensure_bsd_nuget_command");
    expect(script).toContain("configure_github_nuget_source");
    expect(script.match(/^ensure_bsd_nuget_command$/gm) ?? []).toHaveLength(1);
    expect(
      script.match(/^configure_github_nuget_source$/gm) ?? [],
    ).toHaveLength(1);
    expect(script).toContain("has_bsd_nuget_tool");
    expect(script).toContain("enable_bsd_nuget_tool");
    expect(script).toContain("Added FreeBSD NuGet tool metadata to vcpkg");
    expect(script).toContain("set_bsd_nuget_metadata");
    expect(script).toContain("FreeBSD NuGet version: ");
    expect(script).not.toContain("bsd_nuget_metadata=$(awk '");
    expect(script).toContain("bsd_nuget_version='6.8.0'");
    expect(script).toContain(
      "bsd_nuget_url='https://dist.nuget.org/win-x86-commandline/v6.8.0/nuget.exe'",
    );
    expect(script).toContain(
      "bsd_nuget_sha512='337d517ae6459ebb140a0c5bedff9ed205f46fafcd9a4efb83c12b12118844ce239b35885defcac4271bb1e397385e02ef3b6f585e5af7ea0d4b8868ed32310c'",
    );
    expect(script).toContain("nuget-${bsd_nuget_version}-freebsd");
    expect(script).toContain(
      'curl -L -o "${nuget_exe}.tmp" "${bsd_nuget_url}"',
    );
    expect(script).toContain('expected_hash="${bsd_nuget_sha512}"');
    expect(script).toContain('\\"version\\": \\"6.8.0\\"');
    expect(script).toContain("/v6.8.0/nuget.exe");
    expect(script).toContain(
      "337d517ae6459ebb140a0c5bedff9ed205f46fafcd9a4efb83c12b12118844ce239b35885defcac4271bb1e397385e02ef3b6f585e5af7ea0d4b8868ed32310c",
    );
    expect(script).toContain(
      String.raw`if sed \"s/\\.string_arg(\\\"-DirectDownload\\\")`,
    );
    expect(script).not.toContain("if sed 's/");
    expect(script).toContain("patch_freebsd_vcpkg_tool_bootstrap");
    expect(script).toContain(
      "Patched FreeBSD vcpkg-tool NuGet NoHttpCache handling",
    );
    expect(script).toContain(
      "Unable to patch FreeBSD vcpkg-tool NuGet NoHttpCache handling",
    );
    expect(script).toContain("patch_bsd_vcpkg_cmake_ninja");
    expect(script).toContain("AND NOT VCPKG_HOST_IS_FREEBSD");
    expect(script).toContain("Patched BSD vcpkg core Ninja handling");
    expect(script).toContain(
      'CMAKE_HOST_SYSTEM_NAME MATCHES \\"^(FreeBSD|OpenBSD|NetBSD)$\\"',
    );
    expect(script).toContain("Patched BSD vcpkg Ninja acquisition");
    expect(script).toContain("vcpkgExtract(Archive|Tar)");
    expect(script).toContain("\\$(archivePath|tarballPath)");
    expect(script).toContain("patch_bsd_vcpkg_spdx_json_string_encode");
    expect(script).toContain("vcpkg-github-cache JSON string fallback");
    expect(script).toContain("Patched FreeBSD vcpkg SPDX JSON string encoding");
    expect(script).toContain("set_bsd_vcpkg_tool_identity");
    expect(script).toContain("printf '%s=%s\\n' 'schema' '2'");
    expect(script).toContain("vcpkg_commit=$(resolve_bsd_vcpkg_commit)");
    expect(script).toContain(
      'if [ -n "${VCPKG_GITHUB_CACHE_VCPKG_COMMIT:-}" ]; then',
    );
    expect(script).toContain(
      'git -C "${VCPKG_ROOT}" rev-parse HEAD 2>/dev/null',
    );
    expect(script).toContain("VCPKG_TOOL_PACKAGE_ID=");
    expect(script).toContain("VCPKG_TOOL_PACKAGE_VERSION=");
    expect(script).toContain("restore_bsd_vcpkg_tool_package");
    expect(script).toContain("validate_restored_bsd_vcpkg_tool");
    expect(script).toContain('"${vcpkg_exe}" version');
    expect(script).toContain(
      "FreeBSD vcpkg tool package is incompatible with this vcpkg checkout",
    );
    expect(script).toContain("publish_bsd_vcpkg_tool_package");
    expect(script).toContain("vcpkg-tool_freebsd-octo-repo-${tool_arch}");
    expect(script).toContain("1.0.0-vcpkgtool${identity_hash}");
    expect(script).toContain("run_nuget locals http-cache -clear || true");
    expect(script).toContain("run_nuget install \\");
    expect(script).toContain("run_nuget pack \\");
    expect(script).toContain("run_nuget push \\");
    expect(script).toContain("vcpkg bootstrap skipped: cached tool restored");
    expect(script).toContain('"${VCPKG_ROOT}/bootstrap-vcpkg.sh"');
    expect(script).toContain("Ensuring Mono is available");
    expect(script).toContain("if command_exists mono; then");
    expect(script).toContain("pkg install -y mono");
    expect(script).toContain("if ! command_exists mono; then");
    expect(script).not.toContain(
      'nuget_output=$("${vcpkg_exe}" fetch nuget 2>&1)',
    );
    expect(script).not.toContain("NuGet fetch skipped");
    expect(script).toContain(
      'VCPKG_GITHUB_CACHE_NUGET_COMMAND="mono ${nuget_exe}"',
    );
    expect(script).toContain("run_nuget() {\n");
    expect(script).toContain(
      "run_nuget sources Remove -Name 'GitHubPackages' -NonInteractive",
    );
    expect(script).toContain("run_nuget 'sources' 'Add'");
    expect(script).toContain(
      "'-Source' 'https://nuget.pkg.github.com/octo/index.json'",
    );
    expect(script).toContain("'-UserName' 'octo'");
    expect(script).toContain("'-Password' \"${VCPKG_GITHUB_CACHE_TOKEN}\"");
    expect(script).toContain(
      "run_nuget 'setapikey' \"${VCPKG_GITHUB_CACHE_TOKEN}\"",
    );
    expect(script).not.toContain("C:/host/repo");
  });

  test("renders BSD vcpkg commit into setup script", () => {
    const plan = buildSetupPlan({
      executionModeInput: "emit-script",
      repository: "octo/repo",
      targetOsInput: "freebsd",
    });
    const script = renderSetupScript(
      plan,
      "0123456789abcdef0123456789abcdef01234567",
    );

    expect(script).toContain(
      "VCPKG_GITHUB_CACHE_VCPKG_COMMIT='0123456789abcdef0123456789abcdef01234567'",
    );
    expect(
      script.indexOf("export VCPKG_GITHUB_CACHE_VCPKG_COMMIT"),
    ).toBeLessThan(script.indexOf("vcpkg GitHub Packages cache setup script"));
  });

  test("emits a POSIX-valid FreeBSD setup script", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "vc-cache-"));
    const setupScript = path.join(workspace, "setup.sh");
    const plan = buildSetupPlan({
      executionModeInput: "emit-script",
      repository: "octo/repo",
      targetOsInput: "freebsd",
    });
    const script = renderSetupScript(plan);

    await writeFile(setupScript, script, "utf8");
    execFileSync("sh", ["-n", setupScript], { stdio: "pipe" });
  });

  test.each(["legacy", "upstream fallback"])(
    "runs BSD setup with the %s SPDX helper",
    async (helper) => {
      const workspace = await mkdtemp(path.join(tmpdir(), "vc-cache-"));
      try {
        const cmakeDir = path.join(workspace, "scripts", "cmake");
        const spdxFile = path.join(cmakeDir, "z_vcpkg_spdx.cmake");
        const legacy = helper === "legacy";
        const source = legacy
          ? [
              '    string(JSON value STRING_ENCODE "${arg_NAME}")',
              '        string(JSON value STRING_ENCODE "${arg_FILENAME}")',
              '    string(JSON value STRING_ENCODE "${arg_DOWNLOAD_LOCATION}")',
              "",
            ].join("\n")
          : [
              "function(z_vcpkg_spdx_json_string_encode_compat out_var value)",
              "endfunction()",
              "function(z_vcpkg_spdx_json_string_encode out_var value)",
              '    if(CMAKE_VERSION VERSION_GREATER_EQUAL "4.3")',
              '        string(JSON encoded STRING_ENCODE "${value}")',
              "    else()",
              '        z_vcpkg_spdx_json_string_encode_compat(encoded "${value}")',
              "    endif()",
              "endfunction()",
              "",
            ].join("\n");
        await mkdir(cmakeDir, { recursive: true });
        await writeFile(spdxFile, source, "utf8");

        const plan = buildSetupPlan({
          bootstrapInput: "false",
          executionModeInput: "emit-script",
          installNugetInput: "false",
          repository: "octo/repo",
          targetOsInput: "freebsd",
        });
        execFileSync("sh", ["-s"], {
          cwd: workspace,
          env: {
            ...process.env,
            VCPKG_GITHUB_CACHE_TOKEN: "test-token",
            VCPKG_ROOT: ".",
          },
          input: renderSetupScript(plan),
        });

        const result = await readFile(spdxFile, "utf8");
        if (legacy) {
          expect(result).toContain("vcpkg-github-cache JSON string fallback");
          expect(result).not.toContain("STRING_ENCODE");
        } else {
          expect(result).toBe(source);
        }
      } finally {
        await rm(workspace, { recursive: true, force: true });
      }
    },
  );

  test("renders OpenBSD target-side vcpkg bootstrap and NuGet fetch", () => {
    const plan = buildSetupPlan({
      executionModeInput: "emit-script",
      repository: "octo/repo",
      targetOsInput: "openbsd",
      vcpkgRootInput: "deps/vcpkg",
    });
    const script = renderSetupScript(plan);

    expect(script).toContain("printf '%s\\n' 'Target OS: openbsd'");
    expect(script).toContain("  VCPKG_ROOT='deps/vcpkg'");
    expect(script).toContain("ensure_bsd_bootstrap_packages");
    expect(script).toContain("find_bsd_libcurl");
    expect(script).toContain("/usr/local/lib/libcurl.so.4");
    expect(script).toContain('missing_packages="${missing_packages} unzip--"');
    expect(script).toContain("pkg_add -I ${missing_packages}");
    expect(script).toContain('compat_root="$(pwd -P)/${VCPKG_ROOT}"');
    expect(script).toContain('ln -sf "${libcurl_file}"');
    expect(script).toContain('bsd_library_path="${compat_dir}:${libcurl_dir}"');
    expect(script).toContain('LD_LIBRARY_PATH="${bsd_library_path}"');
    expect(script).toContain("ensure_bsd_libcurl_compat");
    expect(script).toContain("patch_bsd_vcpkg_cmake_ninja");
    expect(script).toContain("AND NOT VCPKG_HOST_IS_OPENBSD");
    expect(script).toContain("AND NOT VCPKG_HOST_IS_FREEBSD");
    expect(script).toContain("Patched BSD vcpkg core Ninja handling");
    expect(script).toContain("patch_bsd_vcpkg_spdx_json_string_encode");
    expect(script).toContain("vcpkg-github-cache JSON string fallback");
    expect(script).toContain("Patched OpenBSD vcpkg SPDX JSON string encoding");
    expect(script).toContain("scripts/cmake/vcpkg_find_acquire_program.cmake");
    expect(script).toContain(
      "find_program(NINJA NAMES ninja ninja-build REQUIRED)",
    );
    expect(script).toContain("Patched BSD vcpkg Ninja acquisition");
    expect(script).toContain("pkg_add -I mono");
    expect(script).toContain("ensure_bsd_nuget_command");
    expect(script).toContain("configure_github_nuget_source");
    expect(script.match(/^ensure_bsd_nuget_command$/gm) ?? []).toHaveLength(1);
    expect(
      script.match(/^configure_github_nuget_source$/gm) ?? [],
    ).toHaveLength(1);
    expect(script).toContain("enable_bsd_nuget_tool");
    expect(script).toContain("Added OpenBSD NuGet tool metadata to vcpkg");
    expect(script).toContain("bsd_nuget_metadata=$(awk '");
    expect(script).toContain('nuget-${bsd_nuget_version}-openbsd"');
    expect(script).toContain('\\"os\\": \\"openbsd\\"');
    expect(script).not.toContain("/v6.8.0/nuget.exe");
    expect(script).not.toContain(
      "Patched FreeBSD vcpkg-tool NuGet NoHttpCache handling",
    );
    expect(script).toContain("target-os openbsd");
    expect(script).toContain('openbsd-release "${bsd_release}"');
    expect(script).toContain("vcpkg-tool_openbsd-octo-repo-${tool_arch}");
    expect(script).toContain("restore_bsd_vcpkg_tool_package");
    expect(script).toContain("publish_bsd_vcpkg_tool_package");
    expect(script).toContain("Restoring OpenBSD vcpkg tool package: ");
    expect(script).toContain("Published OpenBSD vcpkg tool package");
    expect(script).toContain("vcpkg bootstrap skipped: cached tool restored");
    expect(script).toContain('"${VCPKG_ROOT}/bootstrap-vcpkg.sh"');
    expect(script).toContain(
      'VCPKG_GITHUB_CACHE_NUGET_COMMAND="mono ${nuget_exe}"',
    );
    expect(script).not.toContain(
      'nuget_output=$("${vcpkg_exe}" fetch nuget 2>&1)',
    );
    expect(script).not.toContain("NuGet fetch skipped");
  });

  test("renders NetBSD target-side vcpkg bootstrap and NuGet fetch", () => {
    const plan = buildSetupPlan({
      executionModeInput: "emit-script",
      repository: "octo/repo",
      targetOsInput: "netbsd",
      vcpkgRootInput: "deps/vcpkg",
    });
    const script = renderSetupScript(plan);

    expect(script).toContain("printf '%s\\n' 'Target OS: netbsd'");
    expect(script).toContain("  VCPKG_ROOT='deps/vcpkg'");
    expect(script).toContain("ensure_bsd_bootstrap_packages");
    expect(script).toContain('missing_packages="${missing_packages} unzip"');
    expect(script).toContain("/usr/sbin/pkg_add -u ${missing_packages}");
    expect(script).toContain("/usr/lib/libcurl.so.4");
    expect(script).toContain("/usr/pkg/lib/libcurl.so.4");
    expect(script).toContain("ensure_bsd_libcurl_compat");
    expect(script).toContain("NetBSD libcurl compatibility path: ");
    expect(script).toContain("ensure_netbsd_vcpkg_toolchain");
    expect(script).toContain('toolchain_file="${toolchain_dir}/netbsd.cmake"');
    expect(script).toContain("Added NetBSD vcpkg toolchain file");
    expect(script).toContain("if(NOT _VCPKG_NETBSD_TOOLCHAIN)");
    expect(script).toContain("set(CMAKE_SYSTEM_NAME NetBSD CACHE STRING");
    expect(script).toContain("patch_bsd_vcpkg_cmake_ninja");
    expect(script).toContain(
      'AND NOT CMAKE_HOST_SYSTEM_NAME STREQUAL "NetBSD"',
    );
    expect(script).toContain("patch_bsd_vcpkg_spdx_json_string_encode");
    expect(script).toContain("vcpkg-github-cache JSON string fallback");
    expect(script).toContain("Patched NetBSD vcpkg SPDX JSON string encoding");
    expect(script).toContain("patch_netbsd_vcpkg_tool_bootstrap");
    expect(script).toContain("Patched NetBSD vcpkg-tool bootstrap");
    expect(script).toContain("2025-07-21|2025-09-03)");
    expect(script).toContain(
      "vcpkg-github-cache NetBSD vcpkg-tool isfinite patch",
    );
    expect(script).toContain("std::isfinite(d)");
    expect(script).toContain("std::isfinite(value)");
    expect(script).toContain("std::isfinite(value) || value <= 0.0");
    expect(script).toContain(
      "Patched NetBSD vcpkg-tool metrics isfinite handling",
    );
    expect(script).toContain("std::signbit");
    expect(script).toContain("REQUIRE(std::signbit");
    expect(script).toContain("Patched NetBSD vcpkg-tool test signbit handling");
    expect(script).toContain("ensure_netbsd_mono_certificates");
    expect(script).toContain("mozilla-rootcerts-openssl");
    expect(script).toContain("/usr/pkg/sbin/mozilla-rootcerts install");
    expect(script).toContain("Syncing NetBSD Mono certificates: ");
    expect(script).toContain("cert-sync");
    expect(script).toContain("/usr/sbin/pkg_add -u mono");
    expect(script).toContain("ensure_bsd_nuget_command");
    expect(script).toContain("configure_github_nuget_source");
    expect(script).toContain("enable_bsd_nuget_tool");
    expect(script).toContain("Added NetBSD NuGet tool metadata to vcpkg");
    expect(script).toContain("bsd_nuget_metadata=$(awk '");
    expect(script).toContain('nuget-${bsd_nuget_version}-netbsd"');
    expect(script).toContain('\\"os\\": \\"netbsd\\"');
    expect(script).not.toContain("/v6.8.0/nuget.exe");
    expect(script).not.toContain(
      "Patched FreeBSD vcpkg-tool NuGet NoHttpCache handling",
    );
    expect(script).toContain("target-os netbsd");
    expect(script).toContain('netbsd-release "${bsd_release}"');
    expect(script).toContain("vcpkg-tool_netbsd-octo-repo-${tool_arch}");
    expect(script).toContain("restore_bsd_vcpkg_tool_package");
    expect(script).toContain("publish_bsd_vcpkg_tool_package");
    expect(script).toContain("Restoring NetBSD vcpkg tool package: ");
    expect(script).toContain("Published NetBSD vcpkg tool package");
    expect(script).toContain("vcpkg bootstrap skipped: cached tool restored");
    expect(script).toContain(
      [
        'if [ "${vcpkg_tool_restored}" -eq 1 ]; then',
        "  printf '%s\\n' 'vcpkg bootstrap skipped: cached tool restored'",
        "else",
        "  printf '%s\\n' 'Bootstrapping vcpkg'",
        "  patch_netbsd_vcpkg_tool_bootstrap",
        '  "${VCPKG_ROOT}/bootstrap-vcpkg.sh"',
        "  publish_bsd_vcpkg_tool_package",
        "fi",
      ].join("\n"),
    );
    expect(script).toContain(
      'VCPKG_GITHUB_CACHE_NUGET_COMMAND="mono ${nuget_exe}"',
    );
    expect(script).not.toContain("AND NOT VCPKG_HOST_IS_OPENBSD");
    expect(script).not.toContain("AND NOT VCPKG_HOST_IS_FREEBSD");
    expect(script).not.toContain("NuGet fetch skipped");
  });

  test("uses system Ninja for NetBSD and reapplies setup cleanly", async () => {
    const plan = buildSetupPlan({
      executionModeInput: "emit-script",
      repository: "octo/repo",
      targetOsInput: "netbsd",
    });
    const script = renderSetupScript(plan);
    const start = script.indexOf("patch_bsd_vcpkg_cmake_ninja() {");
    const end = script.indexOf("\n}\n", start);
    const patch = script.slice(start, end + 3);
    const workspace = await mkdtemp(path.join(tmpdir(), "vc-cache-"));
    try {
      const coreDir = path.join(workspace, "scripts", "cmake");
      const coreFile = path.join(coreDir, "vcpkg_configure_cmake.cmake");
      const acquireFile = path.join(
        coreDir,
        "vcpkg_find_acquire_program.cmake",
      );
      await mkdir(coreDir, { recursive: true });
      await writeFile(
        coreFile,
        'if("${generator}" STREQUAL "Ninja" AND NOT DEFINED ENV{VCPKG_FORCE_SYSTEM_BINARIES})\n',
      );
      await writeFile(
        acquireFile,
        "function(vcpkg_find_acquire_program program)\nendfunction()\n",
      );

      const apply = () =>
        execFileSync("sh", ["-s"], {
          cwd: workspace,
          input: `set -eu\nVCPKG_ROOT=.\n${patch}\npatch_bsd_vcpkg_cmake_ninja\n`,
        });
      apply();
      const core = await readFile(coreFile, "utf8");
      const acquire = await readFile(acquireFile, "utf8");
      expect(core).toContain(
        'AND NOT CMAKE_HOST_SYSTEM_NAME STREQUAL "NetBSD")',
      );
      expect(acquire).toContain(
        "        find_program(NINJA NAMES ninja ninja-build REQUIRED)",
      );
      apply();
      await expect(readFile(coreFile, "utf8")).resolves.toBe(core);
      await expect(readFile(acquireFile, "utf8")).resolves.toBe(acquire);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  test.each(["freebsd", "openbsd", "netbsd"])(
    "uses native Ninja from helpers installed after %s setup",
    async (targetOs) => {
      const plan = buildSetupPlan({
        executionModeInput: "emit-script",
        repository: "octo/repo",
        targetOsInput: targetOs,
      });
      const script = renderSetupScript(plan);
      const start = script.indexOf("patch_bsd_vcpkg_cmake_ninja() {");
      const patch = script.slice(start, script.indexOf("\n}\n", start) + 3);
      const workspace = await mkdtemp(path.join(tmpdir(), "vc-cache-"));
      try {
        const cmakeDir = path.join(workspace, "scripts", "cmake");
        const acquireFile = path.join(
          cmakeDir,
          "vcpkg_find_acquire_program.cmake",
        );
        const nativeDir = path.join(workspace, "native");
        const ninjaName = process.platform === "win32" ? "ninja.exe" : "ninja";
        await mkdir(cmakeDir, { recursive: true });
        await mkdir(nativeDir);
        await writeFile(path.join(nativeDir, ninjaName), "native Ninja", {
          mode: 0o755,
        });
        await writeFile(
          acquireFile,
          [
            "function(vcpkg_find_acquire_program program)",
            "    if(${program})",
            "        return()",
            "    endif()",
            '    set("${program}" "${linux_ninja}" PARENT_SCOPE)',
            "endfunction()",
            "",
          ].join("\n"),
        );
        const apply = () =>
          execFileSync("sh", ["-s"], {
            cwd: workspace,
            input: `set -eu\nVCPKG_ROOT=.\n${patch}\npatch_bsd_vcpkg_cmake_ninja\n`,
          });
        apply();
        const patched = await readFile(acquireFile, "utf8");
        apply();
        await expect(readFile(acquireFile, "utf8")).resolves.toBe(patched);

        // A registry helper arrives after setup, without a working-tree port.
        const installedDir = path.join(
          workspace,
          "installed",
          "share",
          "vcpkg-cmake",
        );
        await mkdir(installedDir, { recursive: true });
        const helperFile = path.join(
          installedDir,
          "vcpkg_cmake_configure.cmake",
        );
        const helper = [
          "function(vcpkg_cmake_configure)",
          '    if(generator STREQUAL "Ninja")',
          "        vcpkg_find_acquire_program(NINJA)",
          '        set(make_program "${NINJA}" PARENT_SCOPE)',
          "    endif()",
          "    vcpkg_find_acquire_program(NINJA)",
          '    set(parallel_program "${NINJA}" PARENT_SCOPE)',
          "endfunction()",
          "",
        ].join("\n");
        await writeFile(helperFile, helper);
        const cmakeTest = path.join(workspace, "test.cmake");
        await writeFile(
          cmakeTest,
          [
            "cmake_minimum_required(VERSION 3.21)",
            'set(CMAKE_HOST_SYSTEM_NAME "${host}")',
            'set(CMAKE_PROGRAM_PATH "${CMAKE_CURRENT_LIST_DIR}/native")',
            "set(CMAKE_FIND_USE_SYSTEM_ENVIRONMENT_PATH FALSE)",
            "set(CMAKE_FIND_USE_CMAKE_ENVIRONMENT_PATH FALSE)",
            "set(CMAKE_FIND_USE_CMAKE_SYSTEM_PATH FALSE)",
            'if(seed STREQUAL "missing")',
            '    set(CMAKE_PROGRAM_PATH "${CMAKE_CURRENT_LIST_DIR}/missing")',
            "endif()",
            'set(linux_ninja "${CMAKE_CURRENT_LIST_DIR}/downloads/tools/ninja/1.12.1-linux/ninja")',
            'if(seed STREQUAL "normal")',
            '    set(NINJA "${linux_ninja}")',
            'elseif(seed STREQUAL "cache")',
            '    set(NINJA "${linux_ninja}" CACHE FILEPATH "")',
            "endif()",
            'include("${CMAKE_CURRENT_LIST_DIR}/scripts/cmake/vcpkg_find_acquire_program.cmake")',
            'include("${CMAKE_CURRENT_LIST_DIR}/installed/share/vcpkg-cmake/vcpkg_cmake_configure.cmake")',
            "vcpkg_cmake_configure()",
            'if(NOT host STREQUAL "Linux")',
            `    set(expected "\${CMAKE_CURRENT_LIST_DIR}/native/${ninjaName}")`,
            "else()",
            '    set(expected "${linux_ninja}")',
            "endif()",
            'if(NOT parallel_program STREQUAL expected OR (generator STREQUAL "Ninja" AND NOT make_program STREQUAL expected))',
            '    message(FATAL_ERROR "Wrong Ninja: ${make_program};${parallel_program}")',
            "endif()",
            "vcpkg_find_acquire_program(OTHER)",
            "if(NOT OTHER STREQUAL linux_ninja)",
            '    message(FATAL_ERROR "Changed unrelated program acquisition")',
            "endif()",
            "",
          ].join("\n"),
        );
        const host = targetOs
          .replace("bsd", "BSD")
          .replace(/^./, (c) => c.toUpperCase());
        for (const generator of ["Ninja", "Unix Makefiles"]) {
          for (const seed of ["unset", "normal", "cache"]) {
            execFileSync("cmake", [
              `-Dhost=${host}`,
              `-Dgenerator=${generator}`,
              `-Dseed=${seed}`,
              "-P",
              cmakeTest,
            ]);
          }
        }
        execFileSync("cmake", [
          "-Dhost=Linux",
          "-Dgenerator=Ninja",
          "-P",
          cmakeTest,
        ]);
        const missing = spawnSync(
          "cmake",
          [
            `-Dhost=${host}`,
            "-Dgenerator=Ninja",
            "-Dseed=missing",
            "-P",
            cmakeTest,
          ],
          { encoding: "utf8" },
        );
        expect(missing.status).not.toBe(0);
        expect(missing.stderr).toContain("Could not find NINJA");
        await expect(readFile(helperFile, "utf8")).resolves.toBe(helper);
      } finally {
        await rm(workspace, { recursive: true, force: true });
      }
    },
  );

  test("honors skipped Mono install when NuGet is fetched", () => {
    const plan = buildSetupPlan({
      executionModeInput: "emit-script",
      installMonoInput: "false",
      repository: "octo/repo",
      targetOsInput: "freebsd",
    });
    const script = renderSetupScript(plan);

    expect(script).toContain("Mono install skipped");
    expect(script).toContain("if ! command_exists mono; then");
    expect(script).not.toContain("pkg install -y mono");
  });

  test("honors skipped vcpkg bootstrap and NuGet fetch", () => {
    const plan = buildSetupPlan({
      bootstrapInput: "false",
      executionModeInput: "emit-script",
      installNugetInput: "false",
      repository: "octo/repo",
      targetOsInput: "freebsd",
    });
    const script = renderSetupScript(plan);

    expect(script).toContain("vcpkg bootstrap skipped");
    expect(script).toContain("NuGet fetch skipped");
    expect(script).not.toContain('"${VCPKG_ROOT}/bootstrap-vcpkg.sh"');
    expect(script).not.toContain(
      'nuget_output=$("${vcpkg_exe}" fetch nuget 2>&1)',
    );
    expect(script).not.toContain("\nensure_bsd_nuget_command\n");
    expect(script).not.toContain("\nconfigure_github_nuget_source\n");
    expect(script).not.toContain("\nrestore_bsd_vcpkg_tool_package\n");
    expect(script).not.toContain("pkg install -y mono");
  });

  test("renders a dot-sourceable binary source environment file", () => {
    const plan = buildSetupPlan({
      accessInput: "readwrite",
      executionModeInput: "emit-script",
      feedOwnerInput: "octo",
      targetOsInput: "freebsd",
    });
    const env = renderSetupEnvironment(plan);

    expect(env).toBe(
      "# vcpkg-github-cache setup environment\n" +
        "export VCPKG_BINARY_SOURCES='clear;nuget,https://nuget.pkg.github.com/octo/index.json,readwrite'\n",
    );
    expect(env).toContain("https://nuget.pkg.github.com/octo/index.json");
    expect(env).toContain("readwrite");
    expect(env).not.toContain("VCPKG_GITHUB_CACHE_TOKEN");
  });

  test("renders BSD vcpkg commit environment", () => {
    const plan = buildSetupPlan({
      accessInput: "readwrite",
      executionModeInput: "emit-script",
      feedOwnerInput: "octo",
      targetOsInput: "freebsd",
    });
    const env = renderSetupEnvironment(
      plan,
      "0123456789abcdef0123456789abcdef01234567",
    );

    expect(env).toContain(
      "export VCPKG_GITHUB_CACHE_VCPKG_COMMIT='0123456789abcdef0123456789abcdef01234567'",
    );
  });

  test("reads vcpkg commit from git", async () => {
    const commit = "ABCDEF0123456789ABCDEF0123456789ABCDEF01";
    const result = await readVcpkgCommit(
      "vcpkg",
      async (command, args, options) => {
        expect(command).toBe("git");
        expect(args).toEqual(["-C", "vcpkg", "rev-parse", "HEAD"]);
        expect(options).toBeUndefined();

        return { stderr: "", stdout: `${commit}\n` };
      },
    );

    expect(result).toBe(commit.toLowerCase());
  });

  test("ignores unavailable vcpkg commit", async () => {
    const result = await readVcpkgCommit("vcpkg", async () => {
      throw new Error("git unavailable");
    });

    expect(result).toBeUndefined();
  });

  test("renders OpenBSD libcurl compatibility environment", () => {
    const plan = buildSetupPlan({
      accessInput: "readwrite",
      executionModeInput: "emit-script",
      feedOwnerInput: "octo",
      targetOsInput: "openbsd",
    });
    const env = renderSetupEnvironment(plan);

    expect(env).toContain("export VCPKG_BINARY_SOURCES=");
    expect(env).not.toContain("VCPKG_FORCE_SYSTEM_BINARIES");
    expect(env).toContain('bsd_vcpkg_root="$(pwd -P)/${VCPKG_ROOT}"');
    expect(env).toContain(
      'bsd_libcurl_dir="${bsd_vcpkg_root}/buildtrees/vcpkg-github-cache/lib"',
    );
    expect(env).toContain("bsd_library_path='/usr/local/lib'");
    expect(env).toContain(
      'bsd_library_path="${bsd_libcurl_dir}:${bsd_library_path}"',
    );
    expect(env).toContain("export LD_LIBRARY_PATH=");
    expect(env).toContain(
      "unset bsd_libcurl_dir bsd_library_path bsd_vcpkg_root",
    );
  });

  test("renders NetBSD libcurl compatibility environment", () => {
    const plan = buildSetupPlan({
      accessInput: "readwrite",
      executionModeInput: "emit-script",
      feedOwnerInput: "octo",
      targetOsInput: "netbsd",
    });
    const env = renderSetupEnvironment(plan);

    expect(env).toContain("export VCPKG_BINARY_SOURCES=");
    expect(env).toContain('bsd_vcpkg_root="$(pwd -P)/${VCPKG_ROOT}"');
    expect(env).toContain(
      'bsd_libcurl_dir="${bsd_vcpkg_root}/buildtrees/vcpkg-github-cache/lib"',
    );
    expect(env).toContain("bsd_library_path='/usr/pkg/lib'");
    expect(env).toContain(
      'bsd_library_path="${bsd_libcurl_dir}:${bsd_library_path}"',
    );
    expect(env).toContain("export LD_LIBRARY_PATH=");
  });

  test("writes setup files and returns relative output paths", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "vc-cache-"));
    const plan = buildSetupPlan({
      executionModeInput: "emit-script",
      repository: "octo/repo",
      scriptDirectoryInput: "out/cache",
      targetOsInput: "freebsd",
      workspace,
    });

    const files = await emitSetupFiles(plan, workspace);

    expect(files.setupScriptOutput).toBe("out/cache/setup.sh");
    expect(files.setupEnvOutput).toBe("out/cache/setup.env");
    await expect(readFile(files.setupScriptPath, "utf8")).resolves.toContain(
      "Target OS: freebsd",
    );
    await expect(readFile(files.setupEnvPath, "utf8")).resolves.toContain(
      "export VCPKG_BINARY_SOURCES=",
    );
  });
});
