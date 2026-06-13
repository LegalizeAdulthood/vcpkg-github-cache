<!--
SPDX-License-Identifier: GPL-3.0-only

Copyright 2026 Richard Thomson
-->

# vcpkg GitHub Packages Cache

This repository contains GitHub Actions for vcpkg binary caching backed by
GitHub Packages NuGet feeds.  The action makes the normal `GITHUB_TOKEN`
path easy for public repositories while still supporting explicit PAT mode
for cross-repository or organization feed use.

The root Marketplace action runs setup.  The repository also has two
explicit sub-actions:

- `setup` configures vcpkg's NuGet binary cache source, provisions the
  vcpkg-selected NuGet tool, handles platform prerequisites such as Mono,
  and emits the `VCPKG_BINARY_SOURCES` value for the caller's build.
- `analyze` probes the feed, inspects vcpkg and NuGet state, parses
  optional build logs, and classifies cache health as a warm hit, partial
  hit, cold seed, auth failure, quota failure, upload failure, or unknown.

Use `LegalizeAdulthood/vcpkg-github-cache@v1` for the Marketplace setup
entry point.  `LegalizeAdulthood/vcpkg-github-cache/setup@v1` is an
equivalent setup spelling for callers who prefer explicit sub-action names.

The action deliberately does not wrap the caller's build.  Callers keep
their own checkout, build, test, and artifact steps; the action centralizes
vcpkg bootstrap, cache setup, and diagnostics.

## Required Permissions

The default `GITHUB_TOKEN` path needs package write access:

```yaml
permissions:
  contents: read
  packages: write
```

## Examples

The setup action exports `VCPKG_BINARY_SOURCES` for later workflow steps, so
the caller build can stay unchanged.

### Minimal Setup

Use setup before the vcpkg-backed build:

```yaml
permissions:
  contents: read
  packages: write

steps:
  - uses: actions/checkout@v6
    with:
      submodules: true

  - uses: LegalizeAdulthood/vcpkg-github-cache@v1
    with:
      token: ${{ github.token }}

  - run: cmake --workflow --preset ci
```

### Setup Plus Analyze

Capture the build log, then run analyze even when the build fails:

```yaml
steps:
  - uses: actions/checkout@v6
    with:
      submodules: true

  - uses: LegalizeAdulthood/vcpkg-github-cache@v1
    with:
      token: ${{ github.token }}

  - name: Build
    shell: pwsh
    run: |
      cmake --workflow --preset ci 2>&1 |
        Tee-Object -FilePath build.log
      if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
      }

  - name: Analyze vcpkg package cache
    if: always()
    uses: LegalizeAdulthood/vcpkg-github-cache/analyze@v1
    with:
      token: ${{ github.token }}
      build-log: build.log
      fail-on: "never"
```

### Build Log Capture

The analyzer works without a build log, but a build log lets it separate
warm hits, partial hits, cold seeds, and upload failures.

For `bash`:

```yaml
- name: Build
  shell: bash
  run: |
    set -o pipefail
    cmake --workflow --preset ci 2>&1 | tee build.log
```

For `pwsh`:

```yaml
- name: Build
  shell: pwsh
  run: |
    cmake --workflow --preset ci 2>&1 |
      Tee-Object -FilePath build.log
    if ($LASTEXITCODE -ne 0) {
      exit $LASTEXITCODE
    }
```

### Troubleshooting

Enable `debug` while tuning package permissions.  This keeps the analyzer
summary concise and uploads a diagnostics artifact with probe details:

```yaml
- name: Analyze vcpkg package cache
  if: always()
  uses: LegalizeAdulthood/vcpkg-github-cache/analyze@v1
  with:
    token: ${{ github.token }}
    build-log: build.log
    fail-on: "never"
    debug: "true"
```

Enable `trace` when setup or analysis makes an unexpected decision, such as
choosing the wrong vcpkg root, skipping a tool install, or resolving a
different GitHub Packages feed than expected:

```yaml
- uses: LegalizeAdulthood/vcpkg-github-cache@v1
  with:
    token: ${{ github.token }}
    trace: "true"

- name: Analyze vcpkg package cache
  if: always()
  uses: LegalizeAdulthood/vcpkg-github-cache/analyze@v1
  with:
    token: ${{ github.token }}
    build-log: build.log
    fail-on: "never"
    trace: "true"
```

## Action Reference

GitHub action inputs are strings.  Quote boolean values such as `"true"`
and `"false"` in workflow YAML.

### `setup` Inputs

- `token`: required.  GitHub token or PAT used for GitHub Packages.
- `token-kind`: default `"github"`.  Token kind: `github` or `pat`.
- `username`: optional.  NuGet username.  Defaults depend on token kind.
- `feed-owner`: optional.  GitHub owner that hosts the NuGet feed.
- `vcpkg-root`: default `"vcpkg"`.  Path to the vcpkg checkout.
- `bootstrap`: default `"true"`.  Bootstrap vcpkg before configuring the
  cache.
- `install-nuget`: default `"true"`.  Fetch NuGet with vcpkg when needed.
- `install-mono`: default `"true"`.  Install Mono when `nuget.exe` needs it
  on Unix.
- `source-name`: default `"GitHubPackages"`.  NuGet source name.
- `access`: default `"readwrite"`.  vcpkg binary source access mode.
- `debug`: default `"false"`.  Emit additional diagnostics.
- `trace`: default `"false"`.  Trace action decisions.

### `setup` Outputs

- `feed-url`: GitHub Packages NuGet feed URL.
- `binary-sources`: value for `VCPKG_BINARY_SOURCES`.
- `nuget-command`: NuGet command selected by setup.
- `vcpkg-version`: bootstrapped vcpkg tool version.
- `diagnosis`: short setup diagnosis.

### `analyze` Inputs

- `token`: required.  GitHub token or PAT used for GitHub Packages.
- `token-kind`: default `"github"`.  Token kind: `github` or `pat`.
- `username`: optional.  NuGet username.  Defaults depend on token kind.
- `feed-owner`: optional.  GitHub owner that hosts the NuGet feed.
- `vcpkg-root`: default `"vcpkg"`.  Path to the vcpkg checkout.
- `build-log`: optional path to a captured build log.
- `artifact-name`: optional diagnostics artifact name.  Defaults to a
  generated name.
- `package-config-glob`: default `"**/packages.config"`.  Glob used to find
  `packages.config` files.
- `fail-on`: default `"never"`.  Failure policy.  One of `auth`,
  `cache-miss`, `never`, `private-package`, `quota`, `restore-failure`, or
  `upload-failure`.
- `debug`: default `"false"`.  Emit additional diagnostics.
- `trace`: default `"false"`.  Trace action decisions.

### `analyze` Outputs

- `cache-status`: high-level cache result.  One of `auth-failure`,
  `cache-disabled`, `cold-seed`, `partial-hit`, `quota-failure`,
  `restore-healthy`, `restore-miss`, `tooling-failure`, `unknown`,
  `upload-failure`, or `warm-hit`.
- `diagnosis`: short human-readable diagnosis.
- `requested-count`: package count from `packages.config`, if known.
- `restored-count`: restored package count, if known.
- `built-count`: vcpkg package build count, if known.
- `uploaded-count`: successful binary cache upload count, if known.
- `failure-kind`: normalized failure kind.  Empty for no failure; otherwise
  one of `auth`, `cache-miss`, `private-package`, `quota`,
  `restore-failure`, `tooling-failure`, or `upload-failure`.
- `diagnostics-artifact`: diagnostics artifact name, when `debug` is
  enabled.

## Repository Expectations

### Public Repositories

The default path is the workflow `GITHUB_TOKEN`.  The workflow should grant
`contents: read` and `packages: write`, then pass `${{ github.token }}` to
both actions.

GitHub's NuGet feed can require authentication even when a package is
public.  Public visibility means the package avoids private storage quota;
it does not guarantee anonymous NuGet access.

Uploads can fail when a package already exists but is not linked to the
calling repository with write access.  In that case, the analyzer reports
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

## Gotchas

- Public NuGet packages still usually require authentication.  Public means
  no private package storage quota, not anonymous restore.
- `permissions: packages: write` only affects `GITHUB_TOKEN`.  PAT mode
  depends on the PAT scopes and the user's package permissions.
- Package access is package-level, not version-level.  If the workflow
  repository cannot write an existing package, it cannot upload a new
  version of that package.
- Repository linking grants package access permissions.  It does not
  necessarily make a package public or move it out of private package
  billing.
- Package visibility is sticky.  Switching token kinds does not make an
  existing private package public.
- PAT-created NuGet packages may be private even when the workflow runs in a
  public repository.  Treat private or unknown visibility as quota risk.
- GitHub package quota failures can block downloads as well as uploads.
- Package metadata and NuGet list/search behavior are helpful hints, not
  proof that vcpkg can restore the exact package it needs.
- `vcpkg fetch nuget` is the source of truth for the NuGet tool vcpkg will
  use.
- vcpkg package identity includes ABI details, toolchain, triplet, port
  files, and helper ports.  Pinning vcpkg and CMake reduces drift, but
  runner image and compiler changes can still change package identities.

## Reference Documentation

- [Use `GITHUB_TOKEN` for authentication in workflows][github-token]
- [Workflow syntax: `permissions`][workflow-permissions]
- [Working with the NuGet registry][nuget-registry]
- [About permissions for GitHub Packages][package-permissions]
- [Configuring package access control and visibility][package-access]
- [GitHub Packages billing][package-billing]
- [Events that trigger workflows][workflow-events]

[github-token]: https://docs.github.com/actions/security-guides/automatic-token-authentication
[workflow-permissions]: https://docs.github.com/actions/using-workflows/workflow-syntax-for-github-actions
[nuget-registry]: https://docs.github.com/packages/working-with-a-github-packages-registry/working-with-the-nuget-registry
[package-permissions]: https://docs.github.com/packages/learn-github-packages/about-permissions-for-github-packages
[package-access]: https://docs.github.com/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility
[package-billing]: https://docs.github.com/billing/concepts/product-billing/github-packages
[workflow-events]: https://docs.github.com/actions/using-workflows/events-that-trigger-workflows
