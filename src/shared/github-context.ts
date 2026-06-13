/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

type EnvKey =
  | "GITHUB_EVENT_NAME"
  | "GITHUB_REPOSITORY"
  | "GITHUB_REPOSITORY_OWNER"
  | "GITHUB_REF"
  | "GITHUB_SHA"
  | "ImageOS"
  | "ImageVersion"
  | "RUNNER_ARCH"
  | "RUNNER_OS";

const SAFE_CONTEXT_FIELDS: readonly (readonly [string, EnvKey])[] = [
  ["event name", "GITHUB_EVENT_NAME"],
  ["repository", "GITHUB_REPOSITORY"],
  ["repository owner", "GITHUB_REPOSITORY_OWNER"],
  ["ref", "GITHUB_REF"],
  ["sha", "GITHUB_SHA"],
  ["runner os", "RUNNER_OS"],
  ["runner arch", "RUNNER_ARCH"],
  ["image os", "ImageOS"],
  ["image version", "ImageVersion"],
];

function optional(value: string | undefined): string {
  return value && value.length > 0 ? value : "unknown";
}

export function safeGithubContext(env: NodeJS.ProcessEnv): string {
  return `${SAFE_CONTEXT_FIELDS.map(([label, key]) => {
    return `${label}: ${optional(env[key])}`;
  }).join("\n")}\n`;
}
