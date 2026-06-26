<!--
SPDX-License-Identifier: GPL-3.0-only

Copyright 2026 Richard Thomson
-->

# vcpkg Version Testing Plan

## Goal

Test the action against a rolling year of `VCPKG_ROOT` tags so behavior is
not accidentally tied to one vcpkg checkout.  vcpkg generally adds about
one tag per month, so the default matrix should cover roughly the latest
twelve release tags plus an optional moving ref.

The version axis applies to all action behavior, not just BSD VM support.
Different vcpkg revisions can change bootstrap scripts, vcpkg-tool source,
NuGet tool metadata, binary package naming, log output, required system
tools, and analyzer-visible cache behavior.

## Principles

- Discover tags dynamically instead of hardcoding a stale list.
- Allow an explicit ref list for debugging and release qualification.
- Keep default push CI cheap.
- Put the full platform/ref matrix behind `workflow_dispatch`.
- Run a smaller scheduled matrix if the cost is acceptable.
- Make source patches pattern-driven and no-op when upstream is fixed.
- Make dependency reporting log-driven instead of version-driven.
- Keep cache identities tied to the concrete vcpkg commit, not the tag name.
- Preserve full logs and summaries as artifacts for failed matrix cells.

## Coverage Shape

The matrix should be able to cover these platform families:

- Ubuntu host action path.
- Windows host action path.
- FreeBSD VM emitted-script path.
- OpenBSD VM emitted-script path.
- NetBSD VM emitted-script path.

The matrix should be able to cover these vcpkg refs:

- latest twelve release tags discovered from `microsoft/vcpkg`;
- one explicit current project ref, when supplied;
- optional `master` or `HEAD` for early warning;
- one or more explicit refs when reproducing a failure.

The matrix should be able to cover these behavior paths:

- setup action configures NuGet and `VCPKG_BINARY_SOURCES`;
- bootstrap from source works when no cached tool exists;
- cached vcpkg-tool restore skips source bootstrap on BSD targets;
- package restore and upload behave correctly for a tiny fixture;
- analyzer reports warm hit, partial hit, cold seed, auth failure, and tool
  failure from logs produced by the selected vcpkg ref;
- missing system dependency reports name the missing command and the
  closest useful "needed by" context.

## Cost Control

The full cross product is expensive:

```text
5 platforms * 12 tags = 60 jobs before scenario variation
```

Default CI should not run that full matrix.  Use these tiers:

- push CI: Node tests, formatting, typecheck, bundle smoke tests;
- manual matrix: all platforms and selected vcpkg refs;
- scheduled matrix: latest tag plus a rotating older tag set;
- release qualification: full platform/ref matrix before tagging.

## Cache Hygiene

The matrix will create real GitHub Packages entries when `access` is
`readwrite`.  Avoid making every run publish every dependency version:

- use a tiny fixture dependency set;
- prefer package restore probes before full package builds;
- use a dedicated test repository or feed owner when possible;
- keep package names and artifact names clearly tied to the test workflow;
- document cleanup expectations for old test packages.

Tool package cache identity should continue to include the resolved vcpkg
commit, target OS, target release, architecture, compiler identity, and
schema version.  Bump the schema when another input is found to affect the
binary or runtime compatibility.

## Slices

1. Add a vcpkg tag resolver

   Add a small script or action helper that can list vcpkg release tags and
   select the latest twelve by release date or version ordering.  Support an
   explicit comma-separated ref override for reproducing failures.

2. Add a minimal fixture project

   Add a small test project that uses vcpkg in a realistic but cheap way.
   The fixture should build fast, produce predictable package activity, and
   capture a build log suitable for analyzer verification.

3. Add host matrix workflow

   Add a manual workflow that runs Ubuntu and Windows against selected
   vcpkg refs.  It should checkout vcpkg at each ref, run setup, build the
   fixture, run analyze, and upload logs and summaries.

4. Add BSD VM matrix workflow

   Extend the manual workflow to FreeBSD, OpenBSD, and NetBSD using the
   emitted-script path.  Copy back only the build log, status file, and
   diagnostic artifacts needed by the host analyzer.

5. Add cache state scenarios

   Add controls to run cold-seed and warm-hit passes for the same ref.  The
   first pass should allow writes; the second pass should verify that the
   cache is actually used.

6. Add analyzer assertions

   Parse job summaries or diagnostic artifacts from the matrix run and fail
   the job when the reported status does not match the intended scenario.
   Keep assertions tolerant of expected vcpkg log wording differences.

7. Add missing-dependency probes

   Add opt-in negative tests that remove one known prerequisite at a time
   for each VM target.  Verify that the summary identifies the missing tool
   and useful "needed by" context.

8. Add scheduled coverage

   Add a scheduled workflow that runs a smaller rotating matrix, such as
   latest tag plus two older tags.  Keep full twelve-tag coverage manual
   unless runtime and quota are acceptable.

9. Document release qualification

   Document how to launch the full matrix, which artifacts to inspect, and
   what results are required before publishing a new action release.
