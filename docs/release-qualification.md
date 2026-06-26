<!--
SPDX-License-Identifier: GPL-3.0-only

Copyright 2026 Richard Thomson
-->

# Release Qualification

Use this checklist before publishing a new action release.  The goal is to
prove both the local working tree and the external consumer path.

## Candidate SHA

Choose the candidate commit from `develop` after all intended changes have
landed and the bundled `setup/dist` and `analyze/dist` files have been
rebuilt.

Use the full commit SHA for candidate validation.  Do not use the floating
`v1` tag for candidate validation.

## In-Repository Checks

Run the normal repository checks first:

```text
npm run check
```

Then push `develop` and wait for the repository workflows to pass:

- `CI`;
- `Integration` on the `develop` push;
- `Dependabot Updates`, when dependency changes are included.

The `develop` Integration run is intentionally bounded.  It should exercise
all supported platform families against a small vcpkg ref set.

## Full Matrix

Run the `Integration` workflow manually with the full release matrix:

```text
branch: develop
matrix-mode: full-release
explicit-refs: empty, or comma-separated extra refs
latest-tags: ignored in full-release mode
platforms: ignored in full-release mode
cache-mode: readwrite
artifact-retention-days: 7
missing-dependency-probe: none
```

The expected matrix is:

```text
5 platforms * 12 vcpkg release tags = 60 jobs
```

Each extra explicit ref adds one job per platform.

GitHub only shows the manual run button when the workflow on the default
branch has `workflow_dispatch`.  If the button is missing, use `gh` with
`--ref develop`, or merge a workflow-dispatch-capable version to the default
branch before running from the website.

## Canary

Run the external canary repository against the same candidate SHA:

1. Update both action refs in the canary workflow to the full candidate SHA.
2. Push the canary branch.
3. Wait for the canary workflow to finish.
4. Inspect the build summary, analyzer summary, and uploaded artifacts.

The canary should prove:

- action resolution by full SHA;
- caller repository `GITHUB_TOKEN` package permissions;
- package restore and upload through the caller repository;
- analyzer summaries and artifacts as a consumer sees them.

After publishing the version tag, run the canary again with that release tag.
After moving the floating major tag, run the canary again with the floating
tag.

## Artifacts And Summaries

For the full matrix and canary runs, inspect failed jobs first, then sample
successful jobs across all platform families.

Check the action summaries for:

- setup status and cache status headings;
- warm hit, partial hit, cold seed, or expected failure classification;
- packages built from source, including upload status;
- packages denied write access, including package and repository links;
- missing system dependency tables for negative probes;
- BSD vcpkg-tool restore or publish behavior on BSD VM jobs.

Check uploaded artifacts when summaries are not enough:

- setup logs;
- build logs;
- build status files;
- analyzer diagnostics artifacts;
- BSD warm-tool logs.

## Release Gate

Before merging to `master`, require:

- normal repository checks are green on `develop`;
- the bounded `develop` Integration run is green;
- the external canary is green against the candidate SHA;
- any expected package permission issues are understood and documented.

Before tagging, require:

- `develop` has been merged to `master`;
- normal repository checks are green on `master`;
- the full release matrix is green, or every failure is explained and judged
  unrelated to the release;
- the external canary is green against `master` HEAD or the exact release
  candidate SHA.

After tagging, require:

- the draft release workflow created the expected draft release;
- the external canary is green against the version tag;
- the external canary is green against the floating major tag after it moves.

