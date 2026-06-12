/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { readdir, readFile } from "node:fs/promises";
import * as path from "node:path";

export interface PackageConfigDiscovery {
  readonly files: readonly PackageConfigFile[];
  readonly requestedPackages: readonly PackageIdentity[];
}

export interface PackageConfigDiscoveryOptions {
  readonly ignoredDirectoryNames?: ReadonlySet<string>;
  readonly maxFiles?: number;
}

export interface PackageConfigFile {
  readonly packages: readonly PackageIdentity[];
  readonly path: string;
}

export interface PackageIdentity {
  readonly id: string;
  readonly version: string;
}

const DEFAULT_IGNORED_DIRECTORY_NAMES = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
]);

const DEFAULT_MAX_FILES = 100;

function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

function normalizeGlobPath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\/+/, "");
}

function escapeRegex(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

export function globToRegex(glob: string): RegExp {
  const normalized = normalizeGlobPath(glob.trim() || "**/packages.config");
  let pattern = "";

  for (let index = 0; index < normalized.length; ) {
    if (normalized.startsWith("**/", index)) {
      pattern += "(?:.*/)?";
      index += 3;
    } else if (normalized.startsWith("**", index)) {
      pattern += ".*";
      index += 2;
    } else if (normalized[index] === "*") {
      pattern += "[^/]*";
      index += 1;
    } else if (normalized[index] === "?") {
      pattern += "[^/]";
      index += 1;
    } else {
      pattern += escapeRegex(normalized[index]);
      index += 1;
    }
  }

  return new RegExp(`^${pattern}$`, "i");
}

export function packageIdentityKey(identity: PackageIdentity): string {
  return `${identity.id}@${identity.version}`;
}

function decodeXmlAttribute(value: string): string {
  return value.replace(
    /&(#x[0-9a-f]+|#[0-9]+|amp|apos|gt|lt|quot);/gi,
    (entity, body) => {
      const normalizedBody = body.toLowerCase();

      if (normalizedBody === "amp") {
        return "&";
      }

      if (normalizedBody === "apos") {
        return "'";
      }

      if (normalizedBody === "gt") {
        return ">";
      }

      if (normalizedBody === "lt") {
        return "<";
      }

      if (normalizedBody === "quot") {
        return '"';
      }

      if (normalizedBody.startsWith("#x")) {
        return String.fromCodePoint(
          Number.parseInt(normalizedBody.slice(2), 16),
        );
      }

      if (normalizedBody.startsWith("#")) {
        return String.fromCodePoint(
          Number.parseInt(normalizedBody.slice(1), 10),
        );
      }

      return entity;
    },
  );
}

function parseXmlAttributes(value: string): ReadonlyMap<string, string> {
  const attributes = new Map<string, string>();
  const attributePattern = /([A-Za-z_:][A-Za-z0-9_.:-]*)\s*=\s*(["'])(.*?)\2/g;
  let match: RegExpExecArray | null;

  while ((match = attributePattern.exec(value)) !== null) {
    attributes.set(match[1].toLowerCase(), decodeXmlAttribute(match[3]));
  }

  return attributes;
}

export function parsePackagesConfig(
  content: string,
): readonly PackageIdentity[] {
  const packages: PackageIdentity[] = [];
  const packagePattern = /<package\b([^>]*)\/?>/gi;
  let match: RegExpExecArray | null;

  while ((match = packagePattern.exec(content)) !== null) {
    const attributes = parseXmlAttributes(match[1]);
    const id = attributes.get("id")?.trim();
    const version = attributes.get("version")?.trim();

    if (id && version) {
      packages.push({ id, version });
    }
  }

  return packages;
}

async function discoverPackageConfigFiles(
  root: string,
  glob: string,
  options: PackageConfigDiscoveryOptions,
): Promise<readonly string[]> {
  const ignoredDirectoryNames =
    options.ignoredDirectoryNames ?? DEFAULT_IGNORED_DIRECTORY_NAMES;
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  const matcher = globToRegex(glob);
  const files: string[] = [];

  async function visit(directory: string): Promise<void> {
    if (files.length >= maxFiles) {
      return;
    }

    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => compareText(left.name, right.name));

    for (const entry of entries) {
      if (files.length >= maxFiles) {
        return;
      }

      const entryPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        if (!ignoredDirectoryNames.has(entry.name)) {
          await visit(entryPath);
        }
      } else if (entry.isFile()) {
        const relativePath = normalizeGlobPath(path.relative(root, entryPath));

        if (matcher.test(relativePath)) {
          files.push(entryPath);
        }
      }
    }
  }

  await visit(root);
  return files.sort(compareText);
}

export async function discoverPackageConfigs(
  root: string,
  glob: string,
  options: PackageConfigDiscoveryOptions = {},
): Promise<PackageConfigDiscovery> {
  const paths = await discoverPackageConfigFiles(root, glob, options);
  const files: PackageConfigFile[] = [];
  const requestedPackages = new Map<string, PackageIdentity>();

  for (const filePath of paths) {
    const packages = parsePackagesConfig(await readFile(filePath, "utf8"));
    files.push({ packages, path: filePath });

    for (const packageIdentity of packages) {
      requestedPackages.set(
        packageIdentityKey(packageIdentity),
        packageIdentity,
      );
    }
  }

  return {
    files,
    requestedPackages: [...requestedPackages.values()].sort((left, right) =>
      compareText(packageIdentityKey(left), packageIdentityKey(right)),
    ),
  };
}
