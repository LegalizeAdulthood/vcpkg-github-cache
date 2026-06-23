<!--
SPDX-License-Identifier: GPL-3.0-only

Copyright 2026 Richard Thomson
-->

# FreeBSD VM Cache Setup Plan

## Goal

Support vcpkg GitHub Packages binary caching for builds that run inside a
FreeBSD VM on a GitHub-hosted Ubuntu runner.

GitHub JavaScript actions run on the host runner, not inside the VM.  The
setup action must therefore emit a target-side POSIX `/bin/sh` script that
the VM workflow runs inside FreeBSD.

The analyzer should stay as the normal JavaScript action on the Ubuntu host.
The VM workflow copies the build log back to the host, and the analyzer reads
that copied log.

## Boundaries

The cache action owns:

- generating a FreeBSD setup script;
- generating a setup environment file;
- configuring NuGet credentials for GitHub Packages;
- configuring `VCPKG_BINARY_SOURCES`;
- bootstrapping vcpkg when requested;
- installing cache-specific prerequisites when requested.

The caller workflow owns:

- selecting the VM provider and FreeBSD release;
- installing project build prerequisites;
- running the project build workflow;
- copying files back from the VM;
- running host-side cache analysis.

The first implementation does not emit an analyzer script.  Rewriting the
analyzer in POSIX shell would duplicate the Node analyzer and make the first
FreeBSD slice much larger.

## Workflow Shape

The setup action emits scripts on the Ubuntu host:

```yaml
- name: Generate vcpkg cache setup script
  id: vc_setup
  uses: LegalizeAdulthood/vcpkg-github-cache@v1
  with:
    token: ${{ github.token }}
    execution-mode: emit-script
    target-os: freebsd
    bootstrap: "true"
    install-nuget: "true"
    install-mono: "true"
```

The VM action syncs the workspace into FreeBSD, runs the emitted setup
script, runs the project workflow, and copies the log back:

```yaml
- name: Build on FreeBSD
  uses: vmactions/freebsd-vm@v1
  env:
    VCPKG_GITHUB_CACHE_TOKEN: ${{ github.token }}
    VCPKG_ROOT: vcpkg
  with:
    release: "14.3"
    usesh: true
    sync: rsync
    copyback: true
    envs: VCPKG_GITHUB_CACHE_TOKEN VCPKG_ROOT
    prepare: |
      pkg update
      pkg install -y cmake ninja git pkgconf
    run: |
      set -eu

      sh "${{ steps.vc_setup.outputs.setup-script }}"
      . "${{ steps.vc_setup.outputs.setup-env }}"

      {
        cmake --workflow --preset release 2>&1
        echo $? > build.status
      } | tee build.log

      exit "$(cat build.status)"
```

The host analyzer runs after the VM step:

```yaml
- name: Analyze vcpkg cache
  if: always()
  uses: LegalizeAdulthood/vcpkg-github-cache/analyze@v1
  with:
    token: ${{ github.token }}
    build-log: build.log
    artifact-name: vcpkg-cache-diagnostics-freebsd-${{ github.run_attempt }}
    fail-on: "never"
```

The VM command uses the project CMake workflow preset instead of spelling out
configure, build, and test steps separately.  This keeps the FreeBSD job tied
to the project workflow contract.

## Setup Inputs

Add these setup inputs to the root action and the `setup` synonym action:

```yaml
execution-mode:
  description: Setup execution mode: run or emit-script.
  default: run

target-os:
  description: Target OS for emitted setup script.
  default: current

script-directory:
  description: Directory where generated setup files are written.
  default: .vcpkg-github-cache
```

Allowed values:

```text
execution-mode: run, emit-script
target-os: current, freebsd
```

`execution-mode=run` preserves existing behavior.  `target-os=current` is
valid only for run mode in the first implementation.

## Setup Outputs

Add these setup outputs to the root action and the `setup` synonym action:

```yaml
setup-script:
  description: Path to generated setup script in emit-script mode.

setup-env:
  description: Path to generated setup environment file in emit-script mode.
```

Keep existing outputs.  In emit mode:

- `feed-url` and `binary-sources` are still known and should be set;
- `diagnosis` should say that a target-side setup script was emitted;
- target-only values such as `nuget-command` and `vcpkg-version` may be
  empty until a later feature reports target-side setup results.

## Generated Files

The setup script path is:

```text
.vcpkg-github-cache/setup.sh
```

The setup environment path is:

```text
.vcpkg-github-cache/setup.env
```

The setup script must:

- use `#!/bin/sh`;
- use `set -eu`;
- use POSIX shell only;
- never embed token values;
- require `VCPKG_GITHUB_CACHE_TOKEN` at runtime;
- use `vcpkg fetch nuget` as the source of truth for NuGet;
- configure the GitHub Packages NuGet source;
- configure the NuGet API key for the feed;
- bootstrap vcpkg when requested;
- install Mono when requested and needed;
- print concise non-secret diagnostics.

The setup environment file should export values that must survive after
`setup.sh` exits:

```sh
export VCPKG_BINARY_SOURCES='clear;nuget,FEED_URL,readwrite'
```

Callers should dot-source `setup.env` inside the VM before running the build:

```sh
. "${{ steps.vc_setup.outputs.setup-env }}"
```

## POSIX Shell Rules

Generated scripts must not use Bash features:

```text
No arrays.
No [[ ... ]].
No function keyword.
No source; use dot instead.
No process substitution.
No here-strings.
No read -a.
No mapfile.
No ${var//old/new}.
No pipefail.
```

Use portable helpers:

```sh
command_exists() {
    command -v "$1" >/dev/null 2>&1
}
```

`$(...)` command substitution is POSIX and may be used.

## Security

Generated files must not contain:

- GitHub token values;
- PAT values;
- NuGet API keys;
- authenticated URLs;
- authorization headers.

The script reads secrets from environment variables passed into the VM:

```sh
: "${VCPKG_GITHUB_CACHE_TOKEN:?VCPKG_GITHUB_CACHE_TOKEN is required}"
```

Debug and trace output must continue to redact secrets.

## Implementation Slices

1. Extract a setup plan

   Refactor the existing setup path into a small data model containing feed
   URL, source name, username, access mode, vcpkg root, bootstrap choice,
   NuGet choice, Mono choice, and binary sources.  Existing run behavior must
   stay unchanged.

2. Add POSIX script rendering helpers

   Add deterministic line-oriented rendering and shell single-quoting helpers.
   Test literal quoting, empty strings, embedded single quotes, and variable
   references that must expand at runtime.

3. Emit minimal setup files

   In `execution-mode=emit-script`, create `script-directory`, write
   `setup.sh` and `setup.env`, set `setup-script` and `setup-env` outputs,
   and skip host-side setup.  The first emitted script may only validate its
   environment and print non-secret diagnostics.

4. Emit binary source environment

   Write `VCPKG_BINARY_SOURCES` to `setup.env` using the same value that run
   mode would export.  Add tests proving the token is absent and the feed URL
   and access mode are correct.

5. Emit vcpkg bootstrap and NuGet fetch

   Render POSIX commands that bootstrap vcpkg when requested and call
   `vcpkg fetch nuget` when NuGet installation is requested.  The script
   should derive the target-side NuGet command from the target-side vcpkg
   output, not from the Ubuntu host.

6. Emit FreeBSD Mono setup

   For `target-os=freebsd`, render cache-owned Mono setup when
   `install-mono=true` and Mono is missing.  Use FreeBSD package management
   only for cache prerequisites.  Do not install project tools here.

7. Emit NuGet source configuration

   Render commands to add or update the GitHub Packages NuGet source and set
   the API key for the feed.  Use runtime environment variables for secrets.
   Keep source name, feed owner, username, and feed URL non-secret.

8. Add setup summaries and diagnostics

   Emit a compact step summary in script-emission mode.  Include the script
   path, environment path, target OS, feed URL, and binary source mode.  Do
   not claim target-side vcpkg or NuGet versions from the host action.

9. Document FreeBSD VM use

   Update `ReadMe.md` with a FreeBSD VM example.  Show `sync: rsync`,
   `copyback: true`, `usesh: true`, setup script execution, `setup.env`
   dot-sourcing, `cmake --workflow --preset`, and host-side analyze.

10. Verify with a FreeBSD workflow

    Add or update a consuming workflow to run a FreeBSD VM build, copy back
    `build.log`, and run the normal analyzer on the Ubuntu host.  Verify that
    vcpkg restores from and uploads to GitHub Packages from inside FreeBSD.

## Acceptance Criteria

- Existing setup action usage works unchanged.
- Existing analyze action usage works unchanged.
- Setup emit mode writes POSIX `/bin/sh` setup files.
- Generated files do not contain token literals.
- The setup environment can be dot-sourced by the VM workflow.
- FreeBSD setup uses vcpkg's target-side NuGet path.
- The VM workflow runs the project CMake workflow preset.
- The VM workflow copies `build.log` back to the Ubuntu host.
- The normal analyzer reports cache health from the copied FreeBSD log.
- The cache action does not control the VM provider.

## Non-goals

- Native FreeBSD GitHub-hosted runner support.
- Running JavaScript actions inside the FreeBSD VM.
- Emitting an analyzer shell script in the first implementation.
- Owning VM release selection, CPU, memory, or sync strategy.
- Installing project build prerequisites from the cache action.
- Replacing project workflow commands with cache-action wrappers.

## Open Questions

- Does `vmactions/freebsd-vm` copy files back when the VM run exits
  nonzero, or does the workflow need a wrapper that records status and exits
  after copyback?
- Should `target-os=posix` be added after FreeBSD works, or should FreeBSD
  remain the only emitted target until another consumer exists?
- Should target-side setup write a target-side diagnostics file that the host
  analyzer can include in debug artifacts?
- Should emit mode leave `nuget-command` and `vcpkg-version` empty, or should
  the setup script write a target-side report for later host-side parsing?
