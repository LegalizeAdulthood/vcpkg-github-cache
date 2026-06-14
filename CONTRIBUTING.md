<!--
SPDX-License-Identifier: GPL-3.0-only

Copyright 2026 Richard Thomson
-->

# Contributing

Thanks for helping improve vcpkg GitHub Packages Cache.

## Development Setup

Use Node.js 24 or newer.  Install dependencies from the repository root:

```sh
npm ci
```

Run the full local check before sending changes:

```sh
npm run check
```

The check runs linting, formatting, type checking, tests, and action bundle
verification.

## Action Bundles

The committed action entry points live under `setup/dist` and
`analyze/dist`.  Do not edit generated bundle files by hand.  Change source
files under `src`, then run:

```sh
npm run build
```

Commit the source changes and regenerated bundles together.

## Tests

Add or update unit tests for behavior that can be tested locally.  Use your
own GitHub Actions workflow as the integration test client for behavior that
depends on GitHub Actions, GitHub Packages, or real vcpkg cache traffic.

## Pull Requests

Keep pull requests focused and reviewable.  Include the problem being solved,
the behavioral change, and how the change was tested.

When changing public action behavior, update the ReadMe and the implementation
plan in `docs/vcpkg-cache-action.md`.
