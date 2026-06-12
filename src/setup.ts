/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import * as core from "@actions/core";

import { buildDisabledBinarySources, buildFeedUrl } from "./shared/cache";
import {
  normalizeTokenKind,
  resolveFeedOwner,
  resolveUsername,
} from "./shared/inputs";

const DIAGNOSIS = "setup skeleton: binary caching is disabled";

function optionalInput(name: string, defaultValue = ""): string {
  return core.getInput(name).trim() || defaultValue;
}

async function writeSummary(feedUrl: string): Promise<void> {
  if (!process.env.GITHUB_STEP_SUMMARY) {
    return;
  }

  await core.summary
    .addHeading("vcpkg GitHub Packages cache setup")
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
  const binarySources = buildDisabledBinarySources();

  core.setOutput("feed-url", feedUrl);
  core.setOutput("binary-sources", binarySources);
  core.setOutput("nuget-command", "");
  core.setOutput("vcpkg-version", "");
  core.setOutput("diagnosis", DIAGNOSIS);

  core.info(DIAGNOSIS);
  core.info(`Token path: ${tokenKind === "github" ? "GITHUB_TOKEN" : "PAT"}`);
  core.info(`Feed owner: ${feedOwner}`);
  core.info(`NuGet username: ${username}`);

  await writeSummary(feedUrl);
}

void run().catch((error: unknown) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
