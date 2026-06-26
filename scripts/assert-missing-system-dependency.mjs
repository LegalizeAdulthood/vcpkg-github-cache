/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

function trimValue(value) {
  return (value ?? "").trim();
}

function readText(path) {
  return readFileSync(path, "utf8");
}

function readStatus(path) {
  return trimValue(readText(path));
}

function missingSystemDependency(line, neededBy) {
  const trimmed = line.trim();
  const bison = /Could NOT find BISON \(missing: BISON_EXECUTABLE\)/i.exec(
    trimmed,
  );

  if (bison) {
    return {
      evidence: trimmed,
      neededBy,
      suggestedPackage: "bison",
      tool: "bison",
    };
  }

  return undefined;
}

export function parseMissingSystemDependencies(content) {
  const dependencies = [];
  let currentBuildPackage;

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    const built = /^Building\s+(.+?)(?:\.\.\.)?$/.exec(trimmed);

    if (built) {
      currentBuildPackage = built[1];
    }

    const dependency = missingSystemDependency(
      line,
      currentBuildPackage ?? "project configure",
    );

    if (dependency) {
      dependencies.push(dependency);
    }

    if (/^-- Running vcpkg install - done\b/i.test(trimmed)) {
      currentBuildPackage = undefined;
    }
  }

  return dependencies;
}

export function optionsFromEnv(env = process.env) {
  return {
    buildLog: readText(trimValue(env.BUILD_LOG_FILE)),
    buildStatus: readStatus(trimValue(env.BUILD_STATUS_FILE)),
    expectedNeededBy: trimValue(env.EXPECTED_NEEDED_BY),
    expectedTool: trimValue(env.EXPECTED_TOOL).toLowerCase(),
  };
}

export function assertMissingSystemDependency(options) {
  const buildStatus = trimValue(options.buildStatus);
  const expectedNeededBy = trimValue(options.expectedNeededBy);
  const expectedTool = trimValue(options.expectedTool).toLowerCase();

  if (!expectedTool) {
    throw new Error("EXPECTED_TOOL is required");
  }

  if (buildStatus === "0") {
    throw new Error("Missing dependency probe unexpectedly succeeded");
  }

  const dependencies = parseMissingSystemDependencies(options.buildLog);
  const match = dependencies.find(
    (value) =>
      value.tool.toLowerCase() === expectedTool &&
      (!expectedNeededBy || value.neededBy === expectedNeededBy),
  );

  if (!match) {
    throw new Error(
      [
        `Missing dependency ${expectedTool} was not reported`,
        `Expected needed by: ${expectedNeededBy || "any"}`,
        `Reported: ${JSON.stringify(dependencies)}`,
      ].join("\n"),
    );
  }

  return `Missing dependency ${match.tool} accepted for ${match.neededBy}`;
}

function main() {
  try {
    process.stdout.write(
      `${assertMissingSystemDependency(optionsFromEnv())}\n`,
    );
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
