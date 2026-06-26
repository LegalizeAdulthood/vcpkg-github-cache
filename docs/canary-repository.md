<!--
SPDX-License-Identifier: GPL-3.0-only

Copyright 2026 Richard Thomson
-->

# Canary Repository

Use a canary repository to test this action as an external consumer.  The
in-repository integration workflow uses `uses: ./`, so it proves the working
tree but does not prove marketplace-style action resolution, caller-token
permissions, or package ownership as seen by another repository.

The canary should be small, public, and disposable.  It should contain just
enough source to force a real vcpkg restore/build/upload cycle, plus workflow
jobs that pin this action by SHA or release tag.

## Repository Shape

Keep the canary repository narrow:

- a tiny CMake project;
- a `vcpkg.json` manifest with one small compiled dependency;
- a dedicated vcpkg triplet name, so packages are easy to identify;
- one normal host job, initially Ubuntu;
- optional Windows and BSD VM jobs once the host path is stable;
- no project-specific assumptions from any other repository.

Use a dependency that really builds binary packages.  Header-only packages do
not exercise the upload path.  The fixture in this repository uses `fmt`,
which is a reasonable default for a canary too.

## Workflow Shape

The canary workflow should look like a normal consumer workflow:

- checkout the canary project;
- checkout or otherwise provision `VCPKG_ROOT`;
- run `LegalizeAdulthood/vcpkg-github-cache@<ref>`;
- run the project build while capturing `build.log`;
- run `LegalizeAdulthood/vcpkg-github-cache/analyze@<ref>` with
  `if: always()`;
- upload build logs and analyzer artifacts.

Use `docs/canary-workflow.yml` as the starting point for
`.github/workflows/canary.yml` in the canary repository.

Pin by full commit SHA when validating a candidate release.  Pin by the
version tag, such as `v1.3.0`, when validating the exact release users will
consume.  Pin by the floating major tag, such as `v1`, only after the release
tag has been published and the floating tag has been moved.

## Permissions

The workflow should grant the default token package write permission:

```yaml
permissions:
  contents: read
  packages: write
```

Use the workflow `GITHUB_TOKEN` path first.  A PAT changes package ownership
and quota behavior, so it is a separate scenario rather than the default
canary.

The first canary run will create package entries owned by the package
namespace selected by the action inputs.  If a package already exists and was
created by another repository, GitHub Packages may allow restore but deny
upload.  Use the analyzer summary links to grant the canary repository
read/write access to those package entries.

## Branch Policy

Keep the canary branch policy simple:

- `master` or `main` should run only a cheap published-action check;
- release candidates should run from a branch named for the candidate;
- full matrix experiments should be manually dispatched;
- failed runs should keep logs long enough to inspect package and permission
  behavior.

The canary repository does not replace this repository's in-repository
integration workflow.  It adds the external behavior that `uses: ./` cannot
prove.

