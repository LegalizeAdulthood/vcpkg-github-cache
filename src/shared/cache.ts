/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

export function buildFeedUrl(owner: string): string {
  return `https://nuget.pkg.github.com/${owner}/index.json`;
}

export function buildBinarySources(feedUrl: string, access: string): string {
  const resolvedAccess = access.trim() || "readwrite";
  return `clear;nuget,${feedUrl},${resolvedAccess}`;
}
