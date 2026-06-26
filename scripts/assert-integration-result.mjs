/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const HEALTHY_FAILURE_KINDS = new Set(["", "cache-miss"]);

const ALLOWED_CACHE_STATUSES = new Map([
  ["disabled", new Set(["cache-disabled"])],
  ["readonly", new Set(["cache-disabled", "partial-hit", "warm-hit"])],
  ["readwrite", new Set(["cold-seed", "partial-hit", "warm-hit"])],
]);

function trimValue(value) {
  return (value ?? "").trim();
}

function hasEnv(env, name) {
  return Object.prototype.hasOwnProperty.call(env, name);
}

export function readBuildStatus(path) {
  return trimValue(readFileSync(path, "utf8"));
}

export function optionsFromEnv(env = process.env) {
  const buildStatusFile = trimValue(env.BUILD_STATUS_FILE);

  if (!buildStatusFile) {
    throw new Error("BUILD_STATUS_FILE is required");
  }

  return {
    buildStatus: readBuildStatus(buildStatusFile),
    cacheMode: trimValue(env.CACHE_MODE).toLowerCase(),
    cacheStatus: trimValue(env.CACHE_STATUS),
    diagnosis: trimValue(env.DIAGNOSIS),
    expectedCacheStatus: hasEnv(env, "EXPECTED_CACHE_STATUS")
      ? trimValue(env.EXPECTED_CACHE_STATUS)
      : undefined,
    expectedFailureKind: hasEnv(env, "EXPECTED_FAILURE_KIND")
      ? trimValue(env.EXPECTED_FAILURE_KIND)
      : undefined,
    failureKind: trimValue(env.FAILURE_KIND),
  };
}

export function assertIntegrationResult(options) {
  const cacheMode = trimValue(options.cacheMode).toLowerCase();
  const cacheStatus = trimValue(options.cacheStatus);
  const expectedCacheStatus =
    options.expectedCacheStatus === undefined
      ? undefined
      : trimValue(options.expectedCacheStatus);
  const expectedFailureKind =
    options.expectedFailureKind === undefined
      ? undefined
      : trimValue(options.expectedFailureKind);
  const failureKind = trimValue(options.failureKind);
  const allowed = ALLOWED_CACHE_STATUSES.get(cacheMode);

  if (!allowed) {
    throw new Error(`Unsupported cache mode: ${cacheMode || "(empty)"}`);
  }

  if (trimValue(options.buildStatus) !== "0") {
    return `Cache assertion skipped after build status ${options.buildStatus}`;
  }

  if (!cacheStatus) {
    throw new Error("Analyzer did not emit cache-status");
  }

  if (expectedCacheStatus && cacheStatus !== expectedCacheStatus) {
    throw new Error(
      [
        `Expected cache status ${expectedCacheStatus}, got ${cacheStatus}`,
        `Diagnosis: ${trimValue(options.diagnosis)}`,
      ].join("\n"),
    );
  }

  if (!allowed.has(cacheStatus)) {
    throw new Error(
      [
        `Unexpected cache status for ${cacheMode}: ${cacheStatus}`,
        `Allowed: ${[...allowed].join(", ")}`,
        `Diagnosis: ${trimValue(options.diagnosis)}`,
      ].join("\n"),
    );
  }

  if (
    expectedFailureKind !== undefined &&
    failureKind !== expectedFailureKind
  ) {
    throw new Error(
      [
        `Expected failure kind ${expectedFailureKind}, got ${failureKind}`,
        `Cache status: ${cacheStatus}`,
        `Diagnosis: ${trimValue(options.diagnosis)}`,
      ].join("\n"),
    );
  }

  if (!HEALTHY_FAILURE_KINDS.has(failureKind)) {
    throw new Error(
      [
        `Unexpected failure kind for ${cacheMode}: ${failureKind}`,
        `Cache status: ${cacheStatus}`,
        `Diagnosis: ${trimValue(options.diagnosis)}`,
      ].join("\n"),
    );
  }

  return `Cache status ${cacheStatus} accepted for ${cacheMode}`;
}

function main() {
  try {
    process.stdout.write(`${assertIntegrationResult(optionsFromEnv())}\n`);
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
