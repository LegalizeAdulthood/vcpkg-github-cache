/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const TEXT_OPTIONS = { encoding: "utf8" };
const REPLACEMENTS = [
  [
    'crc64_require = (0,external_node_module_namespaceObject.createRequire)(crc64_require("url").pathToFileURL(crc64_filename).href);',
    "crc64_require = (0,external_node_module_namespaceObject.createRequire)(__filename);",
  ],
  [
    'crc64_filename = (0,external_node_url_.fileURLToPath)(crc64_require("url").pathToFileURL(crc64_filename).href);',
    "crc64_filename = __filename;",
  ],
  [
    "crc64_dirname = (0,external_node_path_.dirname)(crc64_filename);",
    "crc64_dirname = __dirname;",
  ],
];

function usage() {
  return "usage: node scripts/patch-ncc-azure-crc64.mjs <file>...\n";
}

function replacementText(from, to) {
  return to;
}

function replacementCount(text, from) {
  return text.split(from).length - 1;
}

function escapeNonAscii(text) {
  let output = "";

  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);

    if (code === 0xa0) {
      output += " ";
    } else if (code > 0x7f) {
      output += `\\u${code.toString(16).toUpperCase().padStart(4, "0")}`;
    } else {
      output += text[index];
    }
  }

  return output;
}

export function patchAzureCrc64NccText(text) {
  let output = text;
  let replacementTotal = 0;
  let foundPatterns = 0;

  for (const [from, to] of REPLACEMENTS) {
    const count = replacementCount(output, from);
    if (count > 0) {
      foundPatterns += 1;
      replacementTotal += count;
      output = output.replaceAll(from, replacementText(from, to));
    }
  }

  if (foundPatterns > 0 && foundPatterns !== REPLACEMENTS.length) {
    throw new Error("incomplete Azure CRC64 ncc pattern");
  }

  return {
    replacements: replacementTotal,
    text: escapeNonAscii(output)
      .replace(/[ \t]+(?=\r?\n|$)/g, "")
      .replace(/\r?\n/g, "\r\n"),
  };
}

function patchFile(file) {
  const original = readFileSync(file, TEXT_OPTIONS);
  const result = patchAzureCrc64NccText(original);

  if (result.text !== original) {
    writeFileSync(file, result.text, TEXT_OPTIONS);
  }
}

function main() {
  if (process.argv.length <= 2) {
    process.stderr.write(usage());
    process.exitCode = 2;
    return;
  }

  for (const file of process.argv.slice(2)) {
    patchFile(file);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
