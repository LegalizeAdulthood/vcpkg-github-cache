<!--
SPDX-License-Identifier: GPL-3.0-only

Copyright 2026 Richard Thomson
-->

# vcpkg Version Testing Plan

## Goal

Test the action against a rolling year of `VCPKG_ROOT` tags so behavior is
not accidentally tied to one vcpkg checkout.  vcpkg generally adds about
one tag per month, so release qualification should cover roughly the latest
twelve release tags plus optional moving or explicit refs.

The version axis applies to all action behavior, not just BSD VM support.
Different vcpkg revisions can change bootstrap scripts, vcpkg-tool source,
NuGet tool metadata, binary package naming, log output, required system
tools, and analyzer-visible cache behavior.

The testing shape has two layers:

- in-repo integration tests that run the current working tree with
  `uses: ./`;
- an external canary repository that uses the published action the same way
  a consumer does.

## Principles

- Discover tags dynamically instead of hardcoding a stale list.
- Allow an explicit ref list for debugging and release qualification.
- Keep `master` push CI cheap.
- Run a bounded in-repo integration matrix on `develop`.
- Put the full platform/ref matrix behind `workflow_dispatch`.
- Use a separate canary repository for external consumer behavior.
- Run a smaller scheduled matrix if the cost is acceptable.
- Make source patches pattern-driven and no-op when upstream is fixed.
- Make dependency reporting log-driven instead of version-driven.
- Keep cache identities tied to the concrete vcpkg commit, not the tag name.
- Preserve full logs and summaries as artifacts for failed matrix cells.

## Coverage Shape

The in-repo matrix should cover these platform families:

- Ubuntu host action path.
- Windows host action path.
- FreeBSD VM emitted-script path.
- OpenBSD VM emitted-script path.
- NetBSD VM emitted-script path.

The ref selector should cover these vcpkg refs:

- latest twelve release tags discovered from `microsoft/vcpkg`;
- one explicit current project ref, when supplied;
- optional `master` or `HEAD` for early warning;
- one or more explicit refs when reproducing a failure.

The fixture should exercise these behavior paths:

- setup action configures NuGet and `VCPKG_BINARY_SOURCES`;
- bootstrap from source works when no cached tool exists;
- cached vcpkg-tool restore skips source bootstrap on BSD targets;
- package restore and upload behave correctly for a tiny fixture;
- analyzer reports warm hit, partial hit, cold seed, auth failure, and tool
  failure from logs produced by the selected vcpkg ref;
- missing system dependency reports name the missing command and the
  closest useful "needed by" context.

The canary repository should exercise external behavior that `uses: ./`
cannot fully prove:

- action resolution by SHA or tag;
- caller repository `GITHUB_TOKEN` permissions;
- caller-owned GitHub Packages feed access;
- summaries, annotations, and artifacts as seen by a real consumer;
- release tags such as `v1.3.0` and the floating `v1` tag.

## Cost Control

The full cross product is expensive:

```text
5 platforms * 12 tags = 60 jobs before scenario variation
```

Use these tiers:

- `master` push CI: Node tests, formatting, typecheck, bundle smoke tests;
- `develop` push CI: bounded integration against selected vcpkg refs;
- manual matrix: all platforms and selected or explicit vcpkg refs;
- scheduled matrix: latest tag plus a rotating older tag set;
- release qualification: full platform/ref matrix before tagging;
- canary repo: minimal consumer check against a published SHA or tag.

## Cache Hygiene

The matrix will create real GitHub Packages entries when `access` is
`readwrite`.  Avoid making every run publish every dependency version:

- use a tiny fixture dependency set;
- prefer package restore probes before full package builds;
- use a dedicated canary repository or feed owner when possible;
- keep package names and artifact names clearly tied to the test workflow;
- document cleanup expectations for old test packages.

Tool package cache identity should continue to include the resolved vcpkg
commit, target OS, target release, architecture, compiler identity, and
schema version.  Bump the schema when another input is found to affect the
binary or runtime compatibility.

## Slices

1. Add bounded `develop` coverage

   Trigger the integration workflow on pushes to `develop` with a small
   default matrix, such as latest tag plus one older tag on Ubuntu and
   Windows.

2. Add analyzer result assertions

   Parse analyzer output or diagnostics artifacts and fail the integration
   job when the reported cache status does not match the expected scenario.
   Keep matching tolerant of vcpkg wording changes.

3. Add cold-seed and warm-hit passes

   Add a two-pass mode for the same ref.  The first pass allows writes; the
   second pass verifies the fixture restores from cache.

4. Add FreeBSD VM integration

   Add the FreeBSD emitted-script path.  Copy back only the build log,
   status file, and diagnostic artifacts needed by the host analyzer.

5. Add OpenBSD VM integration

   Add the OpenBSD emitted-script path with the same fixture contract and
   copyback shape as FreeBSD.

6. Add NetBSD VM integration

   Add the NetBSD emitted-script path with the same fixture contract and
   copyback shape as the other BSD targets.

7. Assert BSD vcpkg-tool cache behavior

   Add checks that a cold BSD run reports the vcpkg-tool package as built
   and a warm BSD run skips rebuilding the tool from source.

8. Add missing-dependency probes

   Add opt-in negative tests that omit one known prerequisite at a time for
   each VM target.  Verify the summary identifies the missing tool and a
   useful "needed by" context.

9. Add the full release matrix

   Add a `workflow_dispatch` mode that runs all five platforms against the
   latest twelve vcpkg release tags, plus any explicit refs supplied by the
   caller.

10. Add scheduled rotating coverage

    Add a scheduled workflow path that runs the latest vcpkg tag plus a
    rotating subset of older tags.  Keep full twelve-tag coverage manual
    unless runtime and quota are acceptable.

11. Add canary repository instructions

    Document the separate canary repository shape: tiny fixture, minimal
    workflows, package permissions, branch policy, and how to pin the action
    by SHA or release tag.

12. Add canary workflow template

    Add a workflow template or documented snippet for the canary repository.
    It should use the published action, not `uses: ./`, and should cover the
    same external behavior trn previously proved.

13. Document release qualification

    Document how to launch the full matrix and canary run, which artifacts
    to inspect, and what results are required before publishing a new action
    release.
