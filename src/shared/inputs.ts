/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

export type TokenKind = "github" | "pat";
export type SetupExecutionMode = "run" | "emit-script";
export type SetupTargetOs = "current" | "freebsd";

const TRUE_VALUES = new Set(["1", "on", "true", "yes"]);

export function parseBoolean(value: string | undefined): boolean {
  return TRUE_VALUES.has((value ?? "").trim().toLowerCase());
}

export function normalizeTokenKind(value: string | undefined): TokenKind {
  const normalized = (value ?? "github").trim().toLowerCase();

  if (normalized === "" || normalized === "github") {
    return "github";
  }

  if (normalized === "pat") {
    return "pat";
  }

  throw new Error(`Unsupported token-kind: ${value}`);
}

export function normalizeSetupExecutionMode(
  value: string | undefined,
): SetupExecutionMode {
  const normalized = (value ?? "run").trim().toLowerCase();

  if (normalized === "" || normalized === "run") {
    return "run";
  }

  if (normalized === "emit-script") {
    return "emit-script";
  }

  throw new Error(`Unsupported execution-mode: ${value}`);
}

export function normalizeSetupTargetOs(
  value: string | undefined,
): SetupTargetOs {
  const normalized = (value ?? "current").trim().toLowerCase();

  if (normalized === "" || normalized === "current") {
    return "current";
  }

  if (normalized === "freebsd") {
    return "freebsd";
  }

  throw new Error(`Unsupported target-os: ${value}`);
}

export function ownerFromRepository(
  repository: string | undefined,
): string | undefined {
  const [owner, name] = (repository ?? "").split("/");

  if (!owner || !name) {
    return undefined;
  }

  return owner;
}

export function resolveFeedOwner(
  input: string | undefined,
  repository: string | undefined,
): string {
  const trimmed = input?.trim();

  if (trimmed) {
    return trimmed;
  }

  const owner = ownerFromRepository(repository);

  if (!owner) {
    throw new Error(
      "feed-owner is required when GITHUB_REPOSITORY is unavailable",
    );
  }

  return owner;
}

export function resolveUsername(
  input: string | undefined,
  tokenKind: TokenKind,
  feedOwner: string,
  actor: string | undefined,
): string {
  const trimmed = input?.trim();

  if (trimmed) {
    return trimmed;
  }

  if (tokenKind === "github") {
    return feedOwner;
  }

  return actor?.trim() || feedOwner;
}
