<!--
SPDX-License-Identifier: GPL-3.0-only

Copyright 2026 Richard Thomson
-->

# vcpkg GitHub Packages Cache

This repository contains a GitHub Action design for vcpkg binary caching
backed by GitHub Packages NuGet feeds.  The action is intended to make the
normal `GITHUB_TOKEN` path easy for public repositories while still
supporting explicit PAT mode for cross-repository or organization feed use.

The planned action has two entry points:

- `setup` configures vcpkg's NuGet binary cache source, provisions the
  vcpkg-selected NuGet tool, handles platform prerequisites such as Mono,
  and emits the `VCPKG_BINARY_SOURCES` value for the caller's build.
- `analyze` probes the feed, inspects vcpkg and NuGet state, parses
  optional build logs, and classifies cache health as a warm hit, partial
  hit, cold seed, auth failure, quota failure, upload failure, or unknown.

The action deliberately does not wrap the caller's build.  Callers keep
their own checkout, build, test, and artifact steps; the action centralizes
vcpkg bootstrap, cache setup, and diagnostics.

Current scope is implementation planning.  User-facing setup examples and
troubleshooting docs will be added after the action skeleton exists.
