<!--
SPDX-License-Identifier: GPL-3.0-only

Copyright 2026 Richard Thomson
-->

# vcpkg GitHub Packages Cache

This repository contains GitHub Actions for vcpkg binary caching backed by
GitHub Packages NuGet feeds.  The action makes the normal `GITHUB_TOKEN`
path easy for public repositories while still supporting explicit PAT mode
for cross-repository or organization feed use.

The action has two entry points:

- `setup` configures vcpkg's NuGet binary cache source, provisions the
  vcpkg-selected NuGet tool, handles platform prerequisites such as Mono,
  and emits the `VCPKG_BINARY_SOURCES` value for the caller's build.
- `analyze` probes the feed, inspects vcpkg and NuGet state, parses
  optional build logs, and classifies cache health as a warm hit, partial
  hit, cold seed, auth failure, quota failure, upload failure, or unknown.

The action deliberately does not wrap the caller's build.  Callers keep
their own checkout, build, test, and artifact steps; the action centralizes
vcpkg bootstrap, cache setup, and diagnostics.

## Repository Expectations

### Public Repositories

The default path is the workflow `GITHUB_TOKEN`.  The workflow should grant
`contents: read` and `packages: write`, then pass `${{ github.token }}` to
both actions.

Public GitHub Packages NuGet packages can still require authentication for
restore.  Public visibility means the package avoids private storage quota;
it does not guarantee anonymous NuGet access.

Uploads can fail when a package record already exists but is not linked to
the calling repository with write access.  In that case, the analyzer reports
the denied packages and links to package settings where GitHub exposes them.

### Private Repositories

Private packages use GitHub Packages storage and transfer quota.  A package
published by a PAT, or any package whose visibility is private or unknown,
is treated as quota risk until GitHub package metadata proves otherwise.

Linking a package to a repository grants repository access permissions.  It
does not necessarily make the package public, and it does not move quota
usage out of private package billing.

The analyzer probes package metadata when package names are available.  It
reports package visibility, repository association, version count, and quota
risk so cache administration can be prioritized.

### Forked Pull Requests

Treat forked pull requests as read-only for package caching.  GitHub can
withhold repository secrets and limit `GITHUB_TOKEN` permissions for fork
events.  Cache restore may still work, but cache writes should not be used
as the success condition for a forked pull request.

The analyzer should make these runs diagnosable without turning expected
write restrictions into noisy build failures.  Do not rely on forked pull
requests to seed new binary cache packages.
