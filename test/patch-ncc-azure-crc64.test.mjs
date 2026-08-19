/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { describe, expect, test } from "vitest";

import { patchAzureCrc64NccText } from "../scripts/patch-ncc-azure-crc64.mjs";

const nccCrc64Shim = `
let crc64_require;
let crc64_filename;
let crc64_dirname;
if (__isNode__) {
  crc64_require = (0,external_node_module_namespaceObject.createRequire)(crc64_require("url").pathToFileURL(crc64_filename).href);
  crc64_filename = (0,external_node_url_.fileURLToPath)(crc64_require("url").pathToFileURL(crc64_filename).href);
  crc64_dirname = (0,external_node_path_.dirname)(crc64_filename);
}
`;

describe("Azure CRC64 ncc patch", () => {
  test("rewrites the broken createRequire shim", () => {
    const result = patchAzureCrc64NccText(nccCrc64Shim);

    expect(result.replacements).toBe(3);
    expect(result.text).toContain(
      "crc64_require = " +
        "(0,external_node_module_namespaceObject.createRequire)(__filename);",
    );
    expect(result.text).toContain("crc64_filename = __filename;");
    expect(result.text).toContain("crc64_dirname = __dirname;");
    expect(result.text).not.toContain('crc64_require("url")');
  });

  test("rejects partial matches", () => {
    expect(() =>
      patchAzureCrc64NccText(
        nccCrc64Shim.replace(
          "crc64_dirname = (0,external_node_path_.dirname)(crc64_filename);",
          "crc64_dirname = dirname(crc64_filename);",
        ),
      ),
    ).toThrow(/incomplete/);
  });

  test("normalizes generated text", () => {
    const checkMark = String.fromCodePoint(0x2705);

    expect(
      patchAzureCrc64NccText(
        `const ok = '${checkMark}'; \nconst x = y ||\u00A0{};\n`,
      ).text,
    ).toBe("const ok = '\\u2705';\r\nconst x = y || {};\r\n");
  });
});
