/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { describe, expect, test } from "vitest";

import { safeGithubContext } from "../src/shared/github-context";

describe("GitHub context diagnostics", () => {
  test("emits selected safe context fields", () => {
    expect(
      safeGithubContext({
        GITHUB_EVENT_NAME: "push",
        GITHUB_REF: "refs/heads/develop",
        GITHUB_REPOSITORY: "octo/repo",
        GITHUB_REPOSITORY_OWNER: "octo",
        GITHUB_SHA: "0123456789abcdef",
        ImageOS: "ubuntu24",
        ImageVersion: "20260607.184.1",
        RUNNER_ARCH: "X64",
        RUNNER_OS: "Linux",
      }),
    ).toBe(
      [
        "event name: push",
        "repository: octo/repo",
        "repository owner: octo",
        "ref: refs/heads/develop",
        "sha: 0123456789abcdef",
        "runner os: Linux",
        "runner arch: X64",
        "image os: ubuntu24",
        "image version: 20260607.184.1",
        "",
      ].join("\n"),
    );
  });

  test("omits event payload paths and secret-bearing context fields", () => {
    const context = safeGithubContext({
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: "oidc-token",
      GITHUB_ACTOR: "octocat",
      GITHUB_EVENT_NAME: "pull_request",
      GITHUB_EVENT_PATH: "/home/runner/work/_temp/event.json",
      GITHUB_JOB: "build",
      GITHUB_REF: "refs/pull/1/merge",
      GITHUB_REPOSITORY: "octo/repo",
      GITHUB_REPOSITORY_OWNER: "octo",
      GITHUB_RUN_ID: "1234",
      GITHUB_SHA: "fedcba9876543210",
      GITHUB_TOKEN: "secret-token",
      RUNNER_ARCH: "X64",
      RUNNER_OS: "Linux",
    });

    expect(context).not.toContain("oidc-token");
    expect(context).not.toContain("secret-token");
    expect(context).not.toContain("event.json");
    expect(context).not.toContain("octocat");
    expect(context).not.toContain("1234");
    expect(context).not.toContain("build");
  });
});
