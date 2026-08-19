/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { readFileSync, writeFileSync } from "node:fs";

const ASCII_TEXT_OPTIONS = { encoding: "utf8" };
const REPLACEMENTS = new Map([
  ["\u00A7", "section"],
  ["\u00AB", "<<"],
  ["\u00BB", ">>"],
  ["\u00D7", "x"],
  ["\u00E4", "a"],
  ["\u2705", "OK"],
  ["\u274C", "NO"],
  ["\u2026", "..."],
  ["\u2019", "'"],
  ["\u2192", "->"],
  ["\u2212", "-"],
  ["\u221E", "infinity"],
  ["\u2265", ">="],
]);

function usage() {
  return "usage: node scripts/ascii-dist.mjs <file>...\n";
}

function toAscii(text) {
  let output = text;
  for (const [from, to] of REPLACEMENTS) {
    output = output.replaceAll(from, to);
  }
  return output.replace(/\r?\n/g, "\r\n");
}

function codePointAt(text, index) {
  return text.codePointAt(index)?.toString(16).toUpperCase().padStart(4, "0");
}

function firstNonAsciiIndex(text) {
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) > 0x7f) {
      return index;
    }
  }
  return -1;
}

function sanitizeFile(file) {
  const original = readFileSync(file, ASCII_TEXT_OPTIONS);
  const text = toAscii(original);
  const nonAsciiIndex = firstNonAsciiIndex(text);
  if (nonAsciiIndex >= 0) {
    process.stderr.write(
      `${file}: non-ASCII U+${codePointAt(text, nonAsciiIndex)}\n`,
    );
    process.exitCode = 1;
    return;
  }
  if (text !== original) {
    writeFileSync(file, text, ASCII_TEXT_OPTIONS);
  }
}

if (process.argv.length <= 2) {
  process.stderr.write(usage());
  process.exitCode = 2;
} else {
  for (const file of process.argv.slice(2)) {
    sanitizeFile(file);
  }
}
