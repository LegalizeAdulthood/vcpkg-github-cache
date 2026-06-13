<!--
SPDX-License-Identifier: GPL-3.0-only

Copyright 2026 Richard Thomson
-->

# GitHub Package Scripts

These Windows batch helpers inspect and maintain GitHub Packages NuGet
caches used by the action and its integration tests.  They require an
explicit package owner with `/user USER` or `/org ORG`.

The scripts expect the GitHub CLI (`gh`) to be installed and authenticated.
Some reports also require `curl` and `printf` to be available on `PATH`.

## Scripts

- `gh-package-list.bat`: lists NuGet packages, their linked repository,
  visibility, version count, oldest version date, newest version date, and
  latest package update date.
- `gh-package-usage.bat`: estimates GitHub Packages storage usage by
  enumerating package versions and fetching NuGet package content lengths.
  It reports per-package bytes and a total against the configured quota.
- `gh-package-prune.bat`: deletes old package versions.  By default it is a
  dry run.  Use `/package PACKAGE_NAME` to prune one package, or
  `/all REPOSITORY` to prune every package linked to a repository.  Add
  `/delete` only after reviewing the dry-run output.
- `gh-package-prune-all.bat`: applies `gh-package-prune.bat` to every NuGet
  package for the selected owner.  It keeps only the newest version of each
  package and is also a dry run unless `/delete` is supplied.

## Owner Scope

Pass exactly one owner scope to each script:

```cmd
gh-package-list.bat /user USER
gh-package-list.bat /org ORG
```

The GitHub Packages NuGet feed URL is derived from that owner.

## Pruning Defaults

`gh-package-prune.bat /package PACKAGE_NAME` keeps the newest 10 versions
and also keeps versions newer than 30 days.  Override those defaults with
`/keep-count N` and `/older-than DAYS`.

`gh-package-prune.bat /all REPOSITORY` marks every version of every package
linked to that repository as a deletion candidate.  This mode is intended
for cleaning up packages that were associated with the wrong repository.

## Safety Notes

Package deletion is permanent for the deleted version.  Run without
`/delete` first, review the `DRYRUN` rows, then rerun with `/delete` only
for the package or repository scope you intend to modify.
