/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { describe, expect, test } from "vitest";

import {
  posixLiteral,
  posixRuntimeExpression,
  PosixScript,
  quotePosixShellLiteral,
  renderPosixShellWord,
  renderPosixShellWords,
} from "../src/shared/posix-script";

describe("POSIX script rendering", () => {
  test("single-quotes literal shell values", () => {
    expect(quotePosixShellLiteral("abc")).toBe("'abc'");
    expect(quotePosixShellLiteral("a b")).toBe("'a b'");
  });

  test("quotes empty literal shell values", () => {
    expect(quotePosixShellLiteral("")).toBe("''");
  });

  test("quotes embedded single quotes in literal shell values", () => {
    expect(quotePosixShellLiteral("can't")).toBe(`'can'"'"'t'`);
  });

  test("leaves runtime expressions unquoted", () => {
    expect(renderPosixShellWord(posixRuntimeExpression("${VCPKG_ROOT}"))).toBe(
      "${VCPKG_ROOT}",
    );
  });

  test("renders mixed literal and runtime words", () => {
    expect(
      renderPosixShellWords([
        posixLiteral("prefix"),
        posixRuntimeExpression("${VCPKG_ROOT}"),
        posixLiteral("can't"),
      ]),
    ).toBe(`'prefix' \${VCPKG_ROOT} 'can'"'"'t'`);
  });

  test("renders deterministic line-oriented scripts", () => {
    const script = new PosixScript();

    script.line("#!/bin/sh");
    script.line("set -eu");
    script.blank();
    script.command("printf", [
      posixLiteral("%s\\n"),
      posixRuntimeExpression("${VCPKG_ROOT}"),
    ]);

    expect(script.render()).toBe(
      "#!/bin/sh\n" + "set -eu\n" + "\n" + "printf '%s\\n' ${VCPKG_ROOT}\n",
    );
  });
});
