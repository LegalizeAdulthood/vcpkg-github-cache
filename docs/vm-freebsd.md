<!--
SPDX-License-Identifier: GPL-3.0-only

Copyright 2026 Richard Thomson
-->

# BSD VM Follow-up Plan

## Goal

Extend the VM build path from FreeBSD to OpenBSD while preserving the
working FreeBSD integration.

FreeBSD emitted setup, VM execution, host-side analysis, warm-hit reporting,
missing system dependency reporting, selective copyback, and cached vcpkg
tool packages have been verified.  The next work is adding OpenBSD support
with the same host-action/guest-script split.

## Boundaries

The cache action owns:

- restoring or publishing cached BSD vcpkg tool packages;
- configuring vcpkg binary caching inside the VM;
- documenting the minimal files needed by the host analyzer.

The caller workflow owns:

- selecting the VM provider and BSD release;
- installing project build prerequisites;
- running the project build workflow;
- deciding which project artifacts should be copied back.

CPack packages are project artifacts, not cache-action artifacts.  The cache
action only needs `build.log` and `build.status` copied back for analysis and
status propagation.  If a workflow wants to upload CPack output from the
Ubuntu host, it should copy those package files back explicitly as part of
the caller workflow.

## Implementation Slices

1. Parse OpenBSD tool package logs

   Teach the build log parser and analyzer reports to recognize OpenBSD
   vcpkg tool restore hits, source rebuilds, publish successes, publish
   failures, and skipped publishes.  Report source-built OpenBSD tool
   packages in the same "Packages built from source" table as FreeBSD.

2. Add OpenBSD missing dependency diagnostics

   Extend missing system dependency detection for OpenBSD bootstrap, vcpkg
   ports, and project configure failures.  Keep each recognized log pattern
   covered by a focused parser test and report missing packages in the job
   summary.

3. Add trn OpenBSD integration workflow

   Add an OpenBSD VM job to `trn` using `vmactions/openbsd-vm@v1`,
   `target-os=openbsd`, the emitted setup script, dot-sourced setup
   environment, captured `build.log`, captured `build.status`, and the same
   staged copyback pattern used by the FreeBSD job.  Start with the minimal
   OpenBSD project prerequisites discovered during testing.

4. Document OpenBSD usage

   Update the main ReadMe with an OpenBSD VM example.  Show
   `vmactions/openbsd-vm@v1`, `target-os=openbsd`, OpenBSD package setup,
   the emitted setup script, setup environment dot-sourcing, build log and
   status staging, host-side analyze, and the copyback staging explanation.

## Acceptance Criteria

- Existing setup action usage works unchanged.
- Existing analyze action usage works unchanged.
- The FreeBSD workflow remains green.
- The OpenBSD workflow reaches the project build.
- FreeBSD and OpenBSD workflows avoid copying the full build tree by
  default.
- Host-side analysis still reads copied `build.log` files.
- Host-side status propagation still reads copied `build.status` files.
- CPack artifact copyback remains an explicit caller workflow choice.

## Non-goals

- Native BSD GitHub-hosted runner support.
- Running JavaScript actions inside BSD VMs.
- Owning VM release selection, CPU, memory, or sync strategy.
- Installing project build prerequisites from the cache action.
- Replacing project workflow commands with cache-action wrappers.
- Uploading project CPack artifacts from the cache action.
