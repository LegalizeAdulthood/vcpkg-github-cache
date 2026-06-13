/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { EOL } from "node:os";
import { join } from "node:path";

const REPLACEMENTS = new Map([
  ["\u00a7", "section"],
  ["\u00ab", "<<"],
  ["\u00bb", ">>"],
  ["\u00d7", "x"],
  ["\u00e4", "a"],
  ["\u2019", "'"],
  ["\u2026", "..."],
  ["\u2192", "->"],
  ["\u2212", "-"],
  ["\u221e", "infinity"],
  ["\u2265", ">="],
  ["\u2705", "Y "],
  ["\u274c", "N "],
]);

function listFiles(path) {
  const state = statSync(path);

  if (state.isFile()) {
    return [path];
  }

  return readdirSync(path).flatMap((entry) => listFiles(join(path, entry)));
}

function replaceUnicode(text) {
  let result = text;

  for (const [from, to] of REPLACEMENTS) {
    result = result.split(from).join(to);
  }

  return Array.from(result, (value) =>
    value.charCodeAt(0) > 0x7f ? "?" : value,
  ).join("");
}

function assertAscii(path, text) {
  for (let index = 0; index < text.length; index++) {
    if (text.charCodeAt(index) > 0x7f) {
      throw new Error(`Non-ASCII byte in ${path} at offset ${index}`);
    }
  }
}

for (const root of process.argv.slice(2)) {
  for (const path of listFiles(root)) {
    const text = replaceUnicode(readFileSync(path, "utf8"));
    const normalized = text.replace(/\r?\n/g, EOL);

    assertAscii(path, normalized);
    writeFileSync(path, normalized, { encoding: "utf8" });
  }
}
