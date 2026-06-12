/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import * as core from "@actions/core";

import { buildFeedUrl } from "./shared/cache";
import {
  normalizeTokenKind,
  resolveFeedOwner,
  resolveUsername,
} from "./shared/inputs";

const CACHE_STATUS = "unknown";
const DIAGNOSIS = "analyzer skeleton: no cache probes were run";

function optionalInput(name: string, defaultValue = ""): string {
  return core.getInput(name).trim() || defaultValue;
}

async function writeSummary(feedUrl: string): Promise<void> {
  if (!process.env.GITHUB_STEP_SUMMARY) {
    return;
  }

  await core.summary
    .addHeading("vcpkg GitHub Packages cache analysis")
    .addRaw(DIAGNOSIS)
    .addEOL()
    .addRaw(`Feed: ${feedUrl}`)
    .addEOL()
    .write();
}

export async function run(): Promise<void> {
  const token = core.getInput("token", { required: true });
  core.setSecret(token);

  const tokenKind = normalizeTokenKind(optionalInput("token-kind", "github"));
  const feedOwner = resolveFeedOwner(
    core.getInput("feed-owner"),
    process.env.GITHUB_REPOSITORY,
  );
  const username = resolveUsername(
    core.getInput("username"),
    tokenKind,
    feedOwner,
    process.env.GITHUB_ACTOR,
  );
  const feedUrl = buildFeedUrl(feedOwner);

  core.setOutput("cache-status", CACHE_STATUS);
  core.setOutput("diagnosis", DIAGNOSIS);
  core.setOutput("requested-count", "");
  core.setOutput("restored-count", "");
  core.setOutput("built-count", "");
  core.setOutput("uploaded-count", "");
  core.setOutput("failure-kind", "");
  core.setOutput("diagnostics-artifact", "");

  core.info(DIAGNOSIS);
  core.info(`Token path: ${tokenKind === "github" ? "GITHUB_TOKEN" : "PAT"}`);
  core.info(`Feed owner: ${feedOwner}`);
  core.info(`NuGet username: ${username}`);

  await writeSummary(feedUrl);
}

void run().catch((error: unknown) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
