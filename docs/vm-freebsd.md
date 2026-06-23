<!--
SPDX-License-Identifier: GPL-3.0-only

Copyright 2026 Richard Thomson
-->

# FreeBSD VM Follow-up Plan

## Goal

Reduce FreeBSD VM cache overhead after the first working integration.

The emitted setup script, VM execution, copied build log, host-side analyzer,
warm-hit reporting, and missing system dependency reporting have been
verified.  The remaining work is about speed and copyback size.

## Boundaries

The cache action owns:

- restoring or publishing a cached FreeBSD vcpkg tool package;
- configuring vcpkg binary caching inside the VM;
- documenting the minimal files needed by the host analyzer.

The caller workflow owns:

- selecting the VM provider and FreeBSD release;
- installing project build prerequisites;
- running the project build workflow;
- deciding which project artifacts should be copied back.

CPack packages are project artifacts, not cache-action artifacts.  The cache
action only needs `build.log` and `build.status` copied back for analysis and
status propagation.  If a workflow wants to upload CPack output from the
Ubuntu host, it should copy those package files back explicitly as part of
the caller workflow.

## Implementation Slices

1. Streamline FreeBSD copyback

   Change the documented FreeBSD workflow shape to copy back only the files
   needed by the host-side analyzer and status check:

   - `build.log`;
   - `build.status`.

   Avoid copying the full VM workspace or build tree by default.  If a caller
   needs CPack outputs, document a small caller-owned staging directory where
   the workflow can place `build.log`, `build.status`, and selected package
   artifacts before copyback.

2. Document FreeBSD usage

   Update the main documentation with a FreeBSD VM example that shows
   `execution-mode=emit-script`, `target-os=freebsd`, running the emitted
   setup script inside the VM, dot-sourcing the setup environment, staging
   `build.log` and `build.status`, and running the analyzer on the host.

## Acceptance Criteria

- Existing setup action usage works unchanged.
- Existing analyze action usage works unchanged.
- The FreeBSD workflow no longer copies the full build tree by default.
- Host-side analysis still reads the copied `build.log`.
- Host-side status propagation still reads the copied `build.status`.
- CPack artifact copyback remains an explicit caller workflow choice.

## Non-goals

- Native FreeBSD GitHub-hosted runner support.
- Running JavaScript actions inside the FreeBSD VM.
- Owning VM release selection, CPU, memory, or sync strategy.
- Installing project build prerequisites from the cache action.
- Replacing project workflow commands with cache-action wrappers.
- Uploading project CPack artifacts from the cache action.
