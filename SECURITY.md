<!--
SPDX-License-Identifier: GPL-3.0-only

Copyright 2026 Richard Thomson
-->

# Security Policy

## Supported Versions

Security fixes target the current `v1` release line and `master`.
Older exact version tags are not changed after release.  A security fix gets
a new exact version tag and the moving `v1` tag is updated to that release.

## Reporting a Vulnerability

Report suspected vulnerabilities through GitHub private vulnerability
reporting for this repository.

Do not report security issues in public issues, pull requests, discussions,
or workflow logs.  Avoid including live tokens, credentials, or private feed
URLs in reports.

If private vulnerability reporting is unavailable, open a public issue asking
for a private reporting path, but do not include sensitive details.

## Scope

Security reports should focus on action behavior such as credential handling,
token leakage, command execution, generated configuration, cache source setup,
artifact contents, or diagnostics output.

Package permission, quota, and visibility problems are usually operational
configuration issues.  Report them as security issues only when they expose
secrets or grant unintended access.
