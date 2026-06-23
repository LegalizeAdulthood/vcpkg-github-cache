/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { mkdir, writeFile } from "node:fs/promises";
import * as path from "node:path";

import {
  posixLiteral,
  posixRuntimeExpression,
  PosixScript,
  quotePosixShellLiteral,
} from "./posix-script";
import { SetupPlan } from "./setup-plan";

const SETUP_SCRIPT_NAME = "setup.sh";
const SETUP_ENV_NAME = "setup.env";
const FREEBSD_NUGET_VERSION = "6.8.0";
const FREEBSD_NUGET_SHA512 =
  "337d517ae6459ebb140a0c5bedff9ed205f46fafcd9a4efb83c12b12118844ce239b35885defcac4271bb1e397385e02ef3b6f585e5af7ea0d4b8868ed32310c";
const FREEBSD_VCPKG_TOOL_SCHEMA_VERSION = "1";

interface BsdTargetSettings {
  readonly cacheToolPackage: boolean;
  readonly label: string;
  readonly nugetDirectorySuffix: string;
  readonly nugetSha512: string;
  readonly nugetVersion: string;
  readonly packageInstallCommand: string;
  readonly packageInstallerLabel: string;
  readonly releaseKey: string;
  readonly targetOs: string;
  readonly toolPackagePrefix: string;
  readonly toolSchemaVersion: string;
}

const FREEBSD_TARGET: BsdTargetSettings = {
  cacheToolPackage: true,
  label: "FreeBSD",
  nugetDirectorySuffix: "freebsd",
  nugetSha512: FREEBSD_NUGET_SHA512,
  nugetVersion: FREEBSD_NUGET_VERSION,
  packageInstallCommand: "pkg install -y",
  packageInstallerLabel: "pkg",
  releaseKey: "freebsd-release",
  targetOs: "freebsd",
  toolPackagePrefix: "vcpkg-tool_freebsd",
  toolSchemaVersion: FREEBSD_VCPKG_TOOL_SCHEMA_VERSION,
};

const OPENBSD_TARGET: BsdTargetSettings = {
  cacheToolPackage: true,
  label: "OpenBSD",
  nugetDirectorySuffix: "openbsd",
  nugetSha512: FREEBSD_NUGET_SHA512,
  nugetVersion: FREEBSD_NUGET_VERSION,
  packageInstallCommand: "pkg_add -I",
  packageInstallerLabel: "pkg_add",
  releaseKey: "openbsd-release",
  targetOs: "openbsd",
  toolPackagePrefix: "vcpkg-tool_openbsd",
  toolSchemaVersion: FREEBSD_VCPKG_TOOL_SCHEMA_VERSION,
};

export interface EmittedSetupFiles {
  readonly setupEnvOutput: string;
  readonly setupEnvPath: string;
  readonly setupScriptOutput: string;
  readonly setupScriptPath: string;
}

function outputPath(directory: string, file: string): string {
  const normalized = directory.replaceAll("\\", "/").replace(/\/+$/, "");

  if (normalized === "" || normalized === ".") {
    return file;
  }

  return `${normalized}/${file}`;
}

function resolveScriptDirectory(
  directory: string,
  workspace: string | undefined,
): string {
  if (path.isAbsolute(directory)) {
    return directory;
  }

  return path.resolve(workspace?.trim() || process.cwd(), directory);
}

function bsdTargetSettings(
  targetOs: SetupPlan["targetOs"],
): BsdTargetSettings | undefined {
  if (targetOs === "freebsd") {
    return FREEBSD_TARGET;
  }

  if (targetOs === "openbsd") {
    return OPENBSD_TARGET;
  }

  return undefined;
}

export function renderSetupScript(plan: SetupPlan): string {
  const script = new PosixScript();
  const targetSettings = bsdTargetSettings(plan.targetOs);
  const bsdTarget = targetSettings ?? FREEBSD_TARGET;
  const unzipPackageName =
    bsdTarget.targetOs === "openbsd" ? "unzip--" : "unzip";
  const openBsdTarget = bsdTarget.targetOs === "openbsd";

  script.line("#!/bin/sh");
  script.line("set -eu");
  script.blank();
  script.line("command_exists() {");
  script.line('  command -v "$1" >/dev/null 2>&1');
  script.line("}");
  script.blank();
  script.line("ensure_bsd_bootstrap_packages() {");
  script.line('  missing_packages=""');
  if (openBsdTarget) {
    script.line(
      "  if ! command_exists curl || ! ls /usr/local/lib/libcurl.so.* >/dev/null 2>&1; then",
    );
  } else {
    script.line("  if ! command_exists curl; then");
  }
  script.line('    missing_packages="${missing_packages} curl"');
  script.line("  fi");
  script.line("  if ! command_exists zip; then");
  script.line('    missing_packages="${missing_packages} zip"');
  script.line("  fi");
  script.line("  if ! command_exists unzip; then");
  script.line(
    `    missing_packages="\${missing_packages} ${unzipPackageName}"`,
  );
  script.line("  fi");
  script.line('  if [ -n "${missing_packages}" ]; then');
  script.command("    printf", [
    posixLiteral("%s%s\\n"),
    posixLiteral(`Installing ${bsdTarget.label} vcpkg bootstrap packages:`),
    posixRuntimeExpression('"${missing_packages}"'),
  ]);
  script.line(`    ${bsdTarget.packageInstallCommand} \${missing_packages}`);
  script.line("  fi");
  script.line("}");
  script.blank();
  script.line("ensure_openbsd_libcurl_compat() {");
  if (openBsdTarget) {
    script.line(
      "  libcurl_file=$(ls /usr/local/lib/libcurl.so.* 2>/dev/null | sed -n '1p')",
    );
    script.line('  if [ -z "${libcurl_file}" ]; then');
    script.command("    printf", [
      posixLiteral("%s\\n"),
      posixLiteral("OpenBSD libcurl library not found; install curl"),
    ]);
    script.line("    return");
    script.line("  fi");
    script.line('  case "${VCPKG_ROOT}" in');
    script.line('    /*) compat_root="${VCPKG_ROOT}" ;;');
    script.line('    *) compat_root="$(pwd -P)/${VCPKG_ROOT}" ;;');
    script.line("  esac");
    script.line(
      '  compat_dir="${compat_root}/buildtrees/vcpkg-github-cache/lib"',
    );
    script.line('  mkdir -p "${compat_dir}"');
    script.line('  ln -sf "${libcurl_file}" "${compat_dir}/libcurl.so.4"');
    script.line('  if [ -z "${LD_LIBRARY_PATH:-}" ]; then');
    script.line('    LD_LIBRARY_PATH="${compat_dir}"');
    script.line("  else");
    script.line('    LD_LIBRARY_PATH="${compat_dir}:${LD_LIBRARY_PATH}"');
    script.line("  fi");
    script.line("  export LD_LIBRARY_PATH");
    script.command("  printf", [
      posixLiteral("%s%s\\n"),
      posixLiteral("OpenBSD libcurl compatibility path: "),
      posixRuntimeExpression('"${compat_dir}"'),
    ]);
    script.line("  unset compat_root");
  } else {
    script.line("  :");
  }
  script.line("}");
  script.blank();
  script.line("patch_openbsd_vcpkg_cmake_ninja() {");
  if (openBsdTarget) {
    script.line(
      '  cmake_file="${VCPKG_ROOT}/scripts/cmake/vcpkg_configure_cmake.cmake"',
    );
    script.line('  if [ ! -f "${cmake_file}" ]; then');
    script.command("    printf", [
      posixLiteral("%s\\n"),
      posixLiteral("OpenBSD vcpkg Ninja patch skipped: CMake helper missing"),
    ]);
    script.line("    return");
    script.line("  fi");
    script.line(
      '  if grep -q "AND NOT VCPKG_HOST_IS_OPENBSD" "${cmake_file}"; then',
    );
    script.command("    printf", [
      posixLiteral("%s\\n"),
      posixLiteral("OpenBSD vcpkg Ninja patch already applied"),
    ]);
    script.line("    return");
    script.line("  fi");
    script.line('  tmp_cmake_file="${cmake_file}.vcpkg-github-cache.tmp"');
    script.line("  if ! awk '");
    script.line(
      '    /if\\("\\$\\{generator\\}" STREQUAL "Ninja" AND NOT DEFINED ENV\\{VCPKG_FORCE_SYSTEM_BINARIES\\}\\)/ {',
    );
    script.line('      sub(/\\)$/, " AND NOT VCPKG_HOST_IS_OPENBSD)")');
    script.line("      patched = 1");
    script.line("    }");
    script.line("    { print }");
    script.line("    END { if (!patched) exit 1 }");
    script.line('  \' "${cmake_file}" > "${tmp_cmake_file}"; then');
    script.line('    rm -f "${tmp_cmake_file}"');
    script.command("    printf", [
      posixLiteral("%s\\n"),
      posixLiteral("Unable to patch OpenBSD vcpkg Ninja handling"),
    ]);
    script.line("    exit 1");
    script.line("  fi");
    script.line('  mv "${tmp_cmake_file}" "${cmake_file}"');
    script.command("  printf", [
      posixLiteral("%s\\n"),
      posixLiteral("Patched OpenBSD vcpkg Ninja handling"),
    ]);
  } else {
    script.line("  :");
  }
  script.line("}");
  script.blank();
  script.line("sha512_file() {");
  script.line("  if command_exists sha512; then");
  script.line('    sha512 -q "$1"');
  script.line("    return");
  script.line("  fi");
  script.line("  if command_exists openssl; then");
  script.line("    openssl dgst -sha512 -r \"$1\" | awk '{ print $1 }'");
  script.line("    return");
  script.line("  fi");
  script.command("  printf", [
    posixLiteral("%s\\n"),
    posixLiteral("sha512 or openssl is required"),
  ]);
  script.line("  exit 1");
  script.line("}");
  script.blank();
  script.line("bsd_target_arch() {");
  script.line("  case $(uname -m) in");
  script.line("    amd64|x86_64)");
  script.line("      printf '%s\\n' x64");
  script.line("      ;;");
  script.line("    aarch64|arm64)");
  script.line("      printf '%s\\n' arm64");
  script.line("      ;;");
  script.line("    *)");
  script.line("      uname -m | sed 's/[^A-Za-z0-9.-]/-/g'");
  script.line("      ;;");
  script.line("  esac");
  script.line("}");
  script.blank();
  script.line("set_bsd_vcpkg_tool_identity() {");
  script.line("  tool_arch=$(bsd_target_arch)");
  script.line(
    '  vcpkg_commit=$(git -C "${VCPKG_ROOT}" rev-parse HEAD 2>/dev/null || printf unknown)',
  );
  script.line("  bsd_release=$(uname -r 2>/dev/null || printf unknown)");
  script.line('  compiler_id=$(${CC:-cc} --version 2>/dev/null | sed -n "1p")');
  script.line('  if [ -z "${compiler_id}" ]; then');
  script.line("    compiler_id=unknown");
  script.line("  fi");
  script.line('  identity_dir="${VCPKG_ROOT}/buildtrees/vcpkg-github-cache"');
  script.line('  mkdir -p "${identity_dir}"');
  script.line('  identity_file="${identity_dir}/vcpkg-tool.identity"');
  script.line("  {");
  script.command("    printf", [
    posixLiteral("%s=%s\\n"),
    posixLiteral("schema"),
    posixLiteral(bsdTarget.toolSchemaVersion),
  ]);
  script.line('    printf "%s=%s\\n" vcpkg-commit "${vcpkg_commit}"');
  script.line(`    printf "%s=%s\\n" target-os ${bsdTarget.targetOs}`);
  script.line('    printf "%s=%s\\n" target-arch "${tool_arch}"');
  script.line(
    `    printf "%s=%s\\n" ${bsdTarget.releaseKey} "\${bsd_release}"`,
  );
  script.line('    printf "%s=%s\\n" compiler "${compiler_id}"');
  script.line('  } > "${identity_file}"');
  script.line(
    '  identity_hash=$(sha512_file "${identity_file}" | cut -c 1-16)',
  );
  script.line(
    `  VCPKG_TOOL_PACKAGE_ID="${bsdTarget.toolPackagePrefix}-\${tool_arch}"`,
  );
  script.line('  VCPKG_TOOL_PACKAGE_VERSION="1.0.0-vcpkgtool${identity_hash}"');
  script.line("  export VCPKG_TOOL_PACKAGE_ID");
  script.line("  export VCPKG_TOOL_PACKAGE_VERSION");
  script.line("}");
  script.blank();
  script.line("ensure_bsd_nuget_command() {");
  script.line(
    `  nuget_dir="\${VCPKG_ROOT}/downloads/tools/nuget-${bsdTarget.nugetVersion}-${bsdTarget.nugetDirectorySuffix}"`,
  );
  script.line('  nuget_exe="${nuget_dir}/nuget.exe"');
  script.line('  if [ ! -f "${nuget_exe}" ]; then');
  script.line('    mkdir -p "${nuget_dir}"');
  script.command("    printf", [
    posixLiteral("%s\\n"),
    posixLiteral(`Downloading NuGet for ${bsdTarget.label} setup`),
  ]);
  script.line(
    `    curl -L -o "\${nuget_exe}.tmp" "https://dist.nuget.org/win-x86-commandline/v${bsdTarget.nugetVersion}/nuget.exe"`,
  );
  script.line('    actual_hash=$(sha512_file "${nuget_exe}.tmp")');
  script.line(`    expected_hash="${bsdTarget.nugetSha512}"`);
  script.line('    if [ "${actual_hash}" != "${expected_hash}" ]; then');
  script.command("      printf", [
    posixLiteral("%s\\n"),
    posixLiteral("NuGet download hash mismatch"),
  ]);
  script.line('      rm -f "${nuget_exe}.tmp"');
  script.line("      exit 1");
  script.line("    fi");
  script.line('    mv "${nuget_exe}.tmp" "${nuget_exe}"');
  script.line("  fi");
  script.line('  VCPKG_GITHUB_CACHE_NUGET_EXE="${nuget_exe}"');
  script.line('  VCPKG_GITHUB_CACHE_NUGET_COMMAND="mono ${nuget_exe}"');
  script.line("  export VCPKG_GITHUB_CACHE_NUGET_EXE");
  script.line("  export VCPKG_GITHUB_CACHE_NUGET_COMMAND");
  script.command("  printf", [
    posixLiteral("%s%s\\n"),
    posixLiteral("NuGet executable: "),
    posixRuntimeExpression('"${VCPKG_GITHUB_CACHE_NUGET_EXE}"'),
  ]);
  script.command("  printf", [
    posixLiteral("%s%s\\n"),
    posixLiteral("NuGet command: "),
    posixRuntimeExpression('"${VCPKG_GITHUB_CACHE_NUGET_COMMAND}"'),
  ]);
  script.line("}");
  script.blank();
  script.line("run_nuget() {");
  script.line('  mono "${VCPKG_GITHUB_CACHE_NUGET_EXE}" "$@"');
  script.line("}");
  script.blank();
  script.line("configure_github_nuget_source() {");
  script.command("  printf", [
    posixLiteral("%s\\n"),
    posixLiteral("Configuring GitHub Packages NuGet source"),
  ]);
  script.line(
    `  run_nuget sources Remove -Name ${quotePosixShellLiteral(
      plan.sourceName,
    )} -NonInteractive >/dev/null 2>&1 || true`,
  );
  script.command("  run_nuget", [
    posixLiteral("sources"),
    posixLiteral("Add"),
    posixLiteral("-Source"),
    posixLiteral(plan.feedUrl),
    posixLiteral("-StorePasswordInClearText"),
    posixLiteral("-Name"),
    posixLiteral(plan.sourceName),
    posixLiteral("-UserName"),
    posixLiteral(plan.username),
    posixLiteral("-Password"),
    posixRuntimeExpression('"${VCPKG_GITHUB_CACHE_TOKEN}"'),
    posixLiteral("-ValidAuthenticationTypes"),
    posixLiteral("basic"),
    posixLiteral("-NonInteractive"),
    posixLiteral("-Verbosity"),
    posixLiteral("detailed"),
  ]);
  script.command("  run_nuget", [
    posixLiteral("setapikey"),
    posixRuntimeExpression('"${VCPKG_GITHUB_CACHE_TOKEN}"'),
    posixLiteral("-Source"),
    posixLiteral(plan.feedUrl),
    posixLiteral("-NonInteractive"),
    posixLiteral("-Verbosity"),
    posixLiteral("detailed"),
  ]);
  script.command("  printf", [
    posixLiteral("%s%s\\n"),
    posixLiteral("NuGet source configured: "),
    posixLiteral(plan.sourceName),
  ]);
  script.line("}");
  script.blank();
  script.line("has_bsd_nuget_tool() {");
  script.line("  awk '");
  script.line('    /"name": "nuget"/ { in_nuget = 1 }');
  script.line(`    in_nuget && /"os": "${bsdTarget.targetOs}"/ { found = 1 }`);
  script.line("    in_nuget && /^[[:space:]]*}/ { in_nuget = 0 }");
  script.line("    END { exit found ? 0 : 1 }");
  script.line('  \' "${VCPKG_ROOT}/scripts/vcpkg-tools.json"');
  script.line("}");
  script.blank();
  script.line("enable_bsd_nuget_tool() {");
  script.line('  tools_json="${VCPKG_ROOT}/scripts/vcpkg-tools.json"');
  script.line("  if has_bsd_nuget_tool; then");
  script.command("    printf", [
    posixLiteral("%s\\n"),
    posixLiteral(`${bsdTarget.label} NuGet tool metadata already available`),
  ]);
  script.line("    return");
  script.line("  fi");
  script.line('  tmp_tools_json="${tools_json}.tmp"');
  script.line("  if ! awk '");
  script.line('    BEGIN { in_block = 0; block = ""; patched = 0 }');
  script.line("    in_block {");
  script.line('      block = block $0 "\\n"');
  script.line("      if ($0 ~ /^[[:space:]]*}[,]?[[:space:]]*$/) {");
  script.line("        in_block = 0");
  script.line("        if (!patched &&");
  script.line(
    '            block ~ /"name"[[:space:]]*:[[:space:]]*"nuget"/ &&',
  );
  script.line('            block ~ /"os"[[:space:]]*:[[:space:]]*"linux"/) {');
  script.line('          printf "%s", block');
  script.line("          bsd_block = block");
  script.line('          sub(/"os"[[:space:]]*:[[:space:]]*"linux"/,');
  script.line(
    `              "\\"os\\": \\"${bsdTarget.targetOs}\\"", bsd_block)`,
  );
  script.line('          sub(/"version"[[:space:]]*:[[:space:]]*"[^"]+"/,');
  script.line(
    `              "\\"version\\": \\"${bsdTarget.nugetVersion}\\"", bsd_block)`,
  );
  script.line("          sub(/\\/v[0-9.]+\\/nuget[.]exe/,");
  script.line(
    `              "/v${bsdTarget.nugetVersion}/nuget.exe", bsd_block)`,
  );
  script.line('          sub(/"sha512"[[:space:]]*:[[:space:]]*"[^"]+"/,');
  script.line(`              "\\"sha512\\": \\"${bsdTarget.nugetSha512}\\"",`);
  script.line("              bsd_block)");
  script.line('          printf "%s", bsd_block');
  script.line("          patched = 1");
  script.line("          next");
  script.line("        }");
  script.line('        printf "%s", block');
  script.line("        next");
  script.line("      }");
  script.line("      next");
  script.line("    }");
  script.line("    !patched && $0 ~ /^[[:space:]]*{[[:space:]]*$/ {");
  script.line("      in_block = 1");
  script.line('      block = $0 "\\n"');
  script.line("      next");
  script.line("    }");
  script.line("    { print }");
  script.line("    END { if (!patched) exit 1 }");
  script.line('  \' "${tools_json}" > "${tmp_tools_json}"; then');
  script.line('    rm -f "${tmp_tools_json}"');
  script.command("    printf", [
    posixLiteral("%s\\n"),
    posixLiteral(
      `Unable to add ${bsdTarget.label} NuGet tool metadata to vcpkg`,
    ),
  ]);
  script.line("    exit 1");
  script.line("  fi");
  script.line('  mv "${tmp_tools_json}" "${tools_json}"');
  script.command("  printf", [
    posixLiteral("%s\\n"),
    posixLiteral(`Added ${bsdTarget.label} NuGet tool metadata to vcpkg`),
  ]);
  script.line("}");
  script.blank();
  script.line("restore_bsd_vcpkg_tool_package() {");
  script.line("  set_bsd_vcpkg_tool_identity");
  script.line(
    '  tool_cache_dir="${VCPKG_ROOT}/downloads/tools/vcpkg-tool-package"',
  );
  script.line('  rm -rf "${tool_cache_dir}"');
  script.line('  mkdir -p "${tool_cache_dir}"');
  script.command("  printf", [
    posixLiteral("%s%s%s%s\\n"),
    posixLiteral(`Restoring ${bsdTarget.label} vcpkg tool package: `),
    posixRuntimeExpression('"${VCPKG_TOOL_PACKAGE_ID}"'),
    posixLiteral(" "),
    posixRuntimeExpression('"${VCPKG_TOOL_PACKAGE_VERSION}"'),
  ]);
  script.line("  if run_nuget install \\");
  script.line('      "${VCPKG_TOOL_PACKAGE_ID}" \\');
  script.line('      -Version "${VCPKG_TOOL_PACKAGE_VERSION}" \\');
  script.line(`      -Source ${quotePosixShellLiteral(plan.feedUrl)} \\`);
  script.line('      -OutputDirectory "${tool_cache_dir}" \\');
  script.line("      -NonInteractive \\");
  script.line("      -Verbosity detailed; then");
  script.line(
    '    restored_vcpkg=$(find "${tool_cache_dir}" -type f -path "*/tools/vcpkg" | sed -n "1p")',
  );
  script.line('    if [ -n "${restored_vcpkg}" ]; then');
  script.line('      mkdir -p "${VCPKG_ROOT}"');
  script.line('      cp "${restored_vcpkg}" "${vcpkg_exe}"');
  script.line('      chmod +x "${vcpkg_exe}"');
  script.line("      vcpkg_tool_restored=1");
  script.command("      printf", [
    posixLiteral("%s\\n"),
    posixLiteral(`Restored cached ${bsdTarget.label} vcpkg tool`),
  ]);
  script.line("      return");
  script.line("    fi");
  script.command("    printf", [
    posixLiteral("%s\\n"),
    posixLiteral(
      `${bsdTarget.label} vcpkg tool package did not contain tools/vcpkg`,
    ),
  ]);
  script.line("  else");
  script.command("    printf", [
    posixLiteral("%s\\n"),
    posixLiteral(`${bsdTarget.label} vcpkg tool package not restored`),
  ]);
  script.line("  fi");
  script.line("  vcpkg_tool_restored=0");
  script.line("}");
  script.blank();
  script.line("publish_bsd_vcpkg_tool_package() {");
  script.line('  if [ ! -x "${vcpkg_exe}" ]; then');
  script.command("    printf", [
    posixLiteral("%s\\n"),
    posixLiteral(
      `${bsdTarget.label} vcpkg tool package skipped: vcpkg is missing`,
    ),
  ]);
  script.line("    return");
  script.line("  fi");
  script.line("  set_bsd_vcpkg_tool_identity");
  script.line(
    '  package_dir="${VCPKG_ROOT}/buildtrees/vcpkg-github-cache/tool"',
  );
  script.line('  package_out="${package_dir}/out"');
  script.line(
    '  package_nuspec="${package_dir}/${VCPKG_TOOL_PACKAGE_ID}.nuspec"',
  );
  script.line('  rm -rf "${package_dir}"');
  script.line('  mkdir -p "${package_dir}/tools" "${package_out}"');
  script.line('  cp "${vcpkg_exe}" "${package_dir}/tools/vcpkg"');
  script.line("  {");
  script.line(
    "    printf '%s\\n' '<?xml version=\"1.0\" encoding=\"utf-8\"?>'",
  );
  script.line("    printf '%s\\n' '<package>'");
  script.line("    printf '%s\\n' '  <metadata>'");
  script.line(
    "    printf '%s%s%s\\n' '    <id>' \"${VCPKG_TOOL_PACKAGE_ID}\" '</id>'",
  );
  script.line(
    "    printf '%s%s%s\\n' '    <version>' \"${VCPKG_TOOL_PACKAGE_VERSION}\" '</version>'",
  );
  script.line("    printf '%s\\n' '    <authors>vcpkg-github-cache</authors>'");
  script.line(
    `    printf '%s\\n' '    <description>${bsdTarget.label} vcpkg tool binary</description>'`,
  );
  script.line("    printf '%s\\n' '  </metadata>'");
  script.line("    printf '%s\\n' '  <files>'");
  script.line(
    "    printf '%s\\n' '    <file src=\"tools/vcpkg\" target=\"tools/vcpkg\" />'",
  );
  script.line("    printf '%s\\n' '  </files>'");
  script.line("    printf '%s\\n' '</package>'");
  script.line('  } > "${package_nuspec}"');
  script.line("  if ! run_nuget pack \\");
  script.line('      "${package_nuspec}" \\');
  script.line('      -BasePath "${package_dir}" \\');
  script.line('      -OutputDirectory "${package_out}" \\');
  script.line("      -NoPackageAnalysis \\");
  script.line("      -NonInteractive \\");
  script.line("      -Verbosity detailed; then");
  script.command("    printf", [
    posixLiteral("%s\\n"),
    posixLiteral(`${bsdTarget.label} vcpkg tool package creation failed`),
  ]);
  script.line("    return");
  script.line("  fi");
  script.line(
    '  package_file=$(find "${package_out}" -name "${VCPKG_TOOL_PACKAGE_ID}.${VCPKG_TOOL_PACKAGE_VERSION}.nupkg" | sed -n "1p")',
  );
  script.line('  if [ -z "${package_file}" ]; then');
  script.command("    printf", [
    posixLiteral("%s\\n"),
    posixLiteral(`${bsdTarget.label} vcpkg tool package file was not found`),
  ]);
  script.line("    return");
  script.line("  fi");
  script.line("  if run_nuget push \\");
  script.line('      "${package_file}" \\');
  script.line(`      -Source ${quotePosixShellLiteral(plan.feedUrl)} \\`);
  script.line('      -ApiKey "${VCPKG_GITHUB_CACHE_TOKEN}" \\');
  script.line("      -SkipDuplicate \\");
  script.line("      -NonInteractive \\");
  script.line("      -Verbosity detailed; then");
  script.command("    printf", [
    posixLiteral("%s\\n"),
    posixLiteral(`Published ${bsdTarget.label} vcpkg tool package`),
  ]);
  script.line("  else");
  script.command("    printf", [
    posixLiteral("%s\\n"),
    posixLiteral(`${bsdTarget.label} vcpkg tool package publish failed`),
  ]);
  script.line("  fi");
  script.line("}");
  script.blank();
  script.line(
    ': "${VCPKG_GITHUB_CACHE_TOKEN:?VCPKG_GITHUB_CACHE_TOKEN is required}"',
  );
  script.line('if [ -z "${VCPKG_ROOT:-}" ]; then');
  script.line(`  VCPKG_ROOT=${quotePosixShellLiteral(plan.vcpkgRootInput)}`);
  script.line("fi");
  script.line("export VCPKG_ROOT");
  script.blank();
  script.command("printf", [
    posixLiteral("%s\\n"),
    posixLiteral("vcpkg GitHub Packages cache setup script"),
  ]);
  script.command("printf", [
    posixLiteral("%s\\n"),
    posixLiteral(`Target OS: ${plan.targetOs}`),
  ]);
  script.command("printf", [
    posixLiteral("%s\\n"),
    posixLiteral(`Feed: ${plan.feedUrl}`),
  ]);
  script.command("printf", [
    posixLiteral("%s\\n"),
    posixLiteral(`Source: ${plan.sourceName}`),
  ]);
  script.command("printf", [
    posixLiteral("%s%s\\n"),
    posixLiteral("vcpkg root: "),
    posixRuntimeExpression("${VCPKG_ROOT}"),
  ]);
  script.line('vcpkg_exe="${VCPKG_ROOT}/vcpkg"');
  script.line("vcpkg_tool_restored=0");
  script.blank();

  if (plan.installNuget && targetSettings) {
    script.line("ensure_bsd_bootstrap_packages");
    script.line("ensure_openbsd_libcurl_compat");
    script.line("patch_openbsd_vcpkg_cmake_ninja");
    if (plan.installMono) {
      script.command("printf", [
        posixLiteral("%s\\n"),
        posixLiteral("Ensuring Mono is available"),
      ]);
      script.line("if command_exists mono; then");
      script.command("  printf", [
        posixLiteral("%s\\n"),
        posixLiteral("Mono already available"),
      ]);
      script.line("else");
      script.command("  printf", [
        posixLiteral("%s\\n"),
        posixLiteral(`Installing Mono with ${bsdTarget.packageInstallerLabel}`),
      ]);
      script.line(`  ${bsdTarget.packageInstallCommand} mono`);
      script.line("fi");
    } else {
      script.command("printf", [
        posixLiteral("%s\\n"),
        posixLiteral("Mono install skipped"),
      ]);
    }

    script.line("if ! command_exists mono; then");
    script.command("  printf", [
      posixLiteral("%s\\n"),
      posixLiteral(
        "Mono is required to run nuget.exe; install Mono or set install-mono true",
      ),
    ]);
    script.line("  exit 1");
    script.line("fi");
    script.line("ensure_bsd_nuget_command");
    script.line("configure_github_nuget_source");
    script.line("enable_bsd_nuget_tool");
    if (plan.bootstrap && bsdTarget.cacheToolPackage) {
      script.line("restore_bsd_vcpkg_tool_package");
    }
    script.blank();
  }

  if (plan.bootstrap) {
    if (targetSettings && !plan.installNuget) {
      script.line("ensure_bsd_bootstrap_packages");
      script.line("ensure_openbsd_libcurl_compat");
      script.line("patch_openbsd_vcpkg_cmake_ninja");
    }
    if (targetSettings && plan.installNuget && bsdTarget.cacheToolPackage) {
      script.line('if [ "${vcpkg_tool_restored}" -eq 1 ]; then');
      script.command("  printf", [
        posixLiteral("%s\\n"),
        posixLiteral("vcpkg bootstrap skipped: cached tool restored"),
      ]);
      script.line("else");
      script.command("  printf", [
        posixLiteral("%s\\n"),
        posixLiteral("Bootstrapping vcpkg"),
      ]);
      script.line('  "${VCPKG_ROOT}/bootstrap-vcpkg.sh"');
      script.line("  publish_bsd_vcpkg_tool_package");
      script.line("fi");
    } else {
      script.command("printf", [
        posixLiteral("%s\\n"),
        posixLiteral("Bootstrapping vcpkg"),
      ]);
      script.line('"${VCPKG_ROOT}/bootstrap-vcpkg.sh"');
    }
  } else {
    script.command("printf", [
      posixLiteral("%s\\n"),
      posixLiteral("vcpkg bootstrap skipped"),
    ]);
  }

  script.blank();

  if (plan.installNuget && !targetSettings) {
    if (plan.installMono) {
      script.command("printf", [
        posixLiteral("%s\\n"),
        posixLiteral("Ensuring Mono is available"),
      ]);
      script.line("if command_exists mono; then");
      script.command("  printf", [
        posixLiteral("%s\\n"),
        posixLiteral("Mono already available"),
      ]);
      script.line("else");
      script.command("  printf", [
        posixLiteral("%s\\n"),
        posixLiteral(`Installing Mono with ${bsdTarget.packageInstallerLabel}`),
      ]);
      script.line(`  ${bsdTarget.packageInstallCommand} mono`);
      script.line("fi");
    } else {
      script.command("printf", [
        posixLiteral("%s\\n"),
        posixLiteral("Mono install skipped"),
      ]);
    }

    script.line("if ! command_exists mono; then");
    script.command("  printf", [
      posixLiteral("%s\\n"),
      posixLiteral(
        "Mono is required to run nuget.exe; install Mono or set install-mono true",
      ),
    ]);
    script.line("  exit 1");
    script.line("fi");
    script.blank();
    script.command("printf", [
      posixLiteral("%s\\n"),
      posixLiteral("Fetching NuGet with vcpkg"),
    ]);
    if (targetSettings) {
      script.line("enable_bsd_nuget_tool");
    }
    script.line('if ! nuget_output=$("${vcpkg_exe}" fetch nuget 2>&1); then');
    script.command("  printf", [
      posixLiteral("%s\\n"),
      posixRuntimeExpression('"${nuget_output}"'),
    ]);
    script.command("  printf", [
      posixLiteral("%s\\n"),
      posixLiteral("vcpkg fetch nuget failed"),
    ]);
    script.line("  exit 1");
    script.line("fi");
    script.command("printf", [
      posixLiteral("%s\\n"),
      posixRuntimeExpression('"${nuget_output}"'),
    ]);
    script.line("nuget_exe=$(");
    script.line("  printf '%s\\n' \"${nuget_output}\" | awk '");
    script.line("    {");
    script.line("      candidate = $0");
    script.line('      gsub(/^"|"$/, "", candidate)');
    script.line(
      "      if (candidate ~ /\\/[Nn][Uu][Gg][Ee][Tt]\\.[Ee][Xx][Ee]$/ &&",
    );
    script.line("          $0 !~ /^Downloading/ && $0 !~ / -> /) {");
    script.line("        print candidate");
    script.line("        exit");
    script.line("      }");
    script.line("    }");
    script.line("  '");
    script.line(")");
    script.line('if [ -z "${nuget_exe}" ]; then');
    script.command("printf", [
      posixLiteral("%s\\n"),
      posixLiteral("vcpkg fetch nuget did not report a nuget.exe path"),
    ]);
    script.line("  exit 1");
    script.line("fi");
    script.line('VCPKG_GITHUB_CACHE_NUGET_EXE="${nuget_exe}"');
    script.line('VCPKG_GITHUB_CACHE_NUGET_COMMAND="mono ${nuget_exe}"');
    script.line("export VCPKG_GITHUB_CACHE_NUGET_EXE");
    script.line("export VCPKG_GITHUB_CACHE_NUGET_COMMAND");
    script.command("printf", [
      posixLiteral("%s%s\\n"),
      posixLiteral("NuGet executable: "),
      posixRuntimeExpression('"${VCPKG_GITHUB_CACHE_NUGET_EXE}"'),
    ]);
    script.command("printf", [
      posixLiteral("%s%s\\n"),
      posixLiteral("NuGet command: "),
      posixRuntimeExpression('"${VCPKG_GITHUB_CACHE_NUGET_COMMAND}"'),
    ]);
    script.blank();
    script.line("run_nuget() {");
    script.line('  mono "${VCPKG_GITHUB_CACHE_NUGET_EXE}" "$@"');
    script.line("}");
    script.blank();
    script.command("printf", [
      posixLiteral("%s\\n"),
      posixLiteral("Configuring GitHub Packages NuGet source"),
    ]);
    script.line(
      `run_nuget sources Remove -Name ${quotePosixShellLiteral(
        plan.sourceName,
      )} -NonInteractive >/dev/null 2>&1 || true`,
    );
    script.command("run_nuget", [
      posixLiteral("sources"),
      posixLiteral("Add"),
      posixLiteral("-Source"),
      posixLiteral(plan.feedUrl),
      posixLiteral("-StorePasswordInClearText"),
      posixLiteral("-Name"),
      posixLiteral(plan.sourceName),
      posixLiteral("-UserName"),
      posixLiteral(plan.username),
      posixLiteral("-Password"),
      posixRuntimeExpression('"${VCPKG_GITHUB_CACHE_TOKEN}"'),
      posixLiteral("-ValidAuthenticationTypes"),
      posixLiteral("basic"),
      posixLiteral("-NonInteractive"),
      posixLiteral("-Verbosity"),
      posixLiteral("detailed"),
    ]);
    script.command("run_nuget", [
      posixLiteral("setapikey"),
      posixRuntimeExpression('"${VCPKG_GITHUB_CACHE_TOKEN}"'),
      posixLiteral("-Source"),
      posixLiteral(plan.feedUrl),
      posixLiteral("-NonInteractive"),
      posixLiteral("-Verbosity"),
      posixLiteral("detailed"),
    ]);
    script.command("printf", [
      posixLiteral("%s%s\\n"),
      posixLiteral("NuGet source configured: "),
      posixLiteral(plan.sourceName),
    ]);
  } else if (!plan.installNuget) {
    script.command("printf", [
      posixLiteral("%s\\n"),
      posixLiteral("NuGet fetch skipped"),
    ]);
  }

  return script.render();
}

export function renderSetupEnvironment(plan: SetupPlan): string {
  const script = new PosixScript();

  script.line("# vcpkg-github-cache setup environment");
  script.line(
    `export VCPKG_BINARY_SOURCES=${quotePosixShellLiteral(plan.binarySources)}`,
  );
  if (plan.targetOs === "openbsd") {
    script.line('if [ -z "${VCPKG_ROOT:-}" ]; then');
    script.line(`  VCPKG_ROOT=${quotePosixShellLiteral(plan.vcpkgRootInput)}`);
    script.line("fi");
    script.line('case "${VCPKG_ROOT}" in');
    script.line('  /*) openbsd_vcpkg_root="${VCPKG_ROOT}" ;;');
    script.line('  *) openbsd_vcpkg_root="$(pwd -P)/${VCPKG_ROOT}" ;;');
    script.line("esac");
    script.line(
      'openbsd_libcurl_dir="${openbsd_vcpkg_root}/buildtrees/vcpkg-github-cache/lib"',
    );
    script.line('if [ -d "${openbsd_libcurl_dir}" ]; then');
    script.line('  if [ -z "${LD_LIBRARY_PATH:-}" ]; then');
    script.line('    export LD_LIBRARY_PATH="${openbsd_libcurl_dir}"');
    script.line("  else");
    script.line(
      '    export LD_LIBRARY_PATH="${openbsd_libcurl_dir}:${LD_LIBRARY_PATH}"',
    );
    script.line("  fi");
    script.line("fi");
    script.line("unset openbsd_libcurl_dir openbsd_vcpkg_root");
  }

  return script.render();
}

export async function emitSetupFiles(
  plan: SetupPlan,
  workspace: string | undefined,
): Promise<EmittedSetupFiles> {
  const directory = resolveScriptDirectory(plan.scriptDirectory, workspace);
  const setupScriptPath = path.join(directory, SETUP_SCRIPT_NAME);
  const setupEnvPath = path.join(directory, SETUP_ENV_NAME);

  await mkdir(directory, { recursive: true });
  await writeFile(setupScriptPath, renderSetupScript(plan), "utf8");
  await writeFile(setupEnvPath, renderSetupEnvironment(plan), "utf8");

  return {
    setupEnvOutput: outputPath(plan.scriptDirectory, SETUP_ENV_NAME),
    setupEnvPath,
    setupScriptOutput: outputPath(plan.scriptDirectory, SETUP_SCRIPT_NAME),
    setupScriptPath,
  };
}
