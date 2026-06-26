/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const TARGETS = new Map([
  ["freebsd", { label: "FreeBSD", packagePrefix: "vcpkg-tool_freebsd-" }],
  ["netbsd", { label: "NetBSD", packagePrefix: "vcpkg-tool_netbsd-" }],
  ["openbsd", { label: "OpenBSD", packagePrefix: "vcpkg-tool_openbsd-" }],
]);

function trimValue(value) {
  return (value ?? "").trim();
}

function readText(path) {
  return readFileSync(path, "utf8");
}

function readStatus(path) {
  return trimValue(readText(path));
}

function requireText(text, pattern, message) {
  if (!pattern.test(text)) {
    throw new Error(message);
  }
}

function rejectText(text, pattern, message) {
  if (pattern.test(text)) {
    throw new Error(message);
  }
}

export function optionsFromEnv(env = process.env) {
  return {
    buildStatus: readStatus(trimValue(env.BUILD_STATUS_FILE)),
    targetOs: trimValue(env.TARGET_OS).toLowerCase(),
    toolLog: readText(trimValue(env.TOOL_LOG_FILE)),
    warmStatus: readStatus(trimValue(env.TOOL_WARM_STATUS_FILE)),
    warmToolLog: readText(trimValue(env.TOOL_WARM_LOG_FILE)),
  };
}

export function assertBsdToolCache(options) {
  const target = TARGETS.get(trimValue(options.targetOs).toLowerCase());

  if (!target) {
    throw new Error(`Unsupported BSD target: ${options.targetOs || "(empty)"}`);
  }

  if (trimValue(options.buildStatus) !== "0") {
    return `BSD tool cache assertion skipped after build status ${options.buildStatus}`;
  }

  if (trimValue(options.warmStatus) !== "0") {
    throw new Error(
      `BSD tool warm setup failed with status ${options.warmStatus}`,
    );
  }

  const toolPackage = new RegExp(`${target.packagePrefix}\\S+`);
  const coldBuilt = new RegExp(
    `Published ${target.label} vcpkg tool package`,
  ).test(options.toolLog);
  const coldRestored = new RegExp(
    `Restored cached ${target.label} vcpkg tool`,
  ).test(options.toolLog);

  requireText(
    options.toolLog,
    toolPackage,
    `${target.label} setup log did not mention the vcpkg tool package`,
  );

  if (!coldBuilt && !coldRestored) {
    throw new Error(
      `${target.label} setup log did not publish or restore the vcpkg tool`,
    );
  }

  requireText(
    options.warmToolLog,
    toolPackage,
    `${target.label} warm setup log did not mention the vcpkg tool package`,
  );
  requireText(
    options.warmToolLog,
    new RegExp(`Restored cached ${target.label} vcpkg tool`),
    `${target.label} warm setup did not restore the cached vcpkg tool`,
  );
  requireText(
    options.warmToolLog,
    /vcpkg bootstrap skipped: cached tool restored/,
    `${target.label} warm setup did not skip vcpkg bootstrap`,
  );
  rejectText(
    options.warmToolLog,
    /^Bootstrapping vcpkg$/m,
    `${target.label} warm setup rebuilt vcpkg from source`,
  );

  return `${target.label} vcpkg tool cache accepted`;
}

function main() {
  try {
    process.stdout.write(`${assertBsdToolCache(optionsFromEnv())}\n`);
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
