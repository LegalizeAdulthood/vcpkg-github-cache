/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { appendFileSync } from "node:fs";
import https from "node:https";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_OWNER = "microsoft";
const DEFAULT_REPO = "vcpkg";
const DEFAULT_LATEST = 12;
const DEFAULT_MAX_PAGES = 5;
const RELEASE_TAG_PATTERN = /^(\d{4})[.-](\d{1,2})[.-](\d{1,2})(?:$|[.-])/;

function usage() {
  return [
    "usage: node scripts/resolve-vcpkg-refs.mjs [options]",
    "",
    "options:",
    "  --refs LIST          comma-separated explicit refs; skips discovery",
    "  --latest N           latest release tag count; default 12",
    "  --extra-ref REF      append an explicit ref to discovered tags",
    "  --extra-refs LIST    append comma-separated refs to discovered tags",
    "  --owner OWNER        GitHub owner to query; default microsoft",
    "  --repo REPO          GitHub repository to query; default vcpkg",
    "  --github-output PATH write matrix and refs outputs to PATH",
    "  --no-github-output   do not write GITHUB_OUTPUT",
    "  --help               show this help",
  ].join("\n");
}

function requireValue(args, index, option) {
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

function parsePositiveInteger(value, option) {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${option} must be a non-negative integer`);
  }

  return Number.parseInt(value, 10);
}

function parseRefList(value, option) {
  const refs = value
    .split(",")
    .map((ref) => ref.trim())
    .filter((ref) => ref.length > 0);

  if (refs.length === 0) {
    throw new Error(`${option} must name at least one ref`);
  }

  for (const ref of refs) {
    if (/\s/.test(ref)) {
      throw new Error(`${option} contains whitespace in ref ${ref}`);
    }
  }

  return uniqueRefs(refs);
}

function uniqueRefs(refs) {
  const seen = new Set();
  const unique = [];

  for (const ref of refs) {
    if (!seen.has(ref)) {
      seen.add(ref);
      unique.push(ref);
    }
  }

  return unique;
}

function parseArgs(args, env = process.env) {
  const options = {
    owner: DEFAULT_OWNER,
    repo: DEFAULT_REPO,
    latest: DEFAULT_LATEST,
    maxPages: DEFAULT_MAX_PAGES,
    explicitRefs: undefined,
    extraRefs: [],
    githubOutput: env.GITHUB_OUTPUT,
    token: env.GITHUB_TOKEN,
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case "--refs":
        options.explicitRefs = parseRefList(
          requireValue(args, index, arg),
          arg,
        );
        index += 1;
        break;
      case "--latest":
        options.latest = parsePositiveInteger(
          requireValue(args, index, arg),
          arg,
        );
        index += 1;
        break;
      case "--extra-ref":
        options.extraRefs = uniqueRefs([
          ...options.extraRefs,
          requireValue(args, index, arg).trim(),
        ]);
        index += 1;
        break;
      case "--extra-refs":
        options.extraRefs = uniqueRefs([
          ...options.extraRefs,
          ...parseRefList(requireValue(args, index, arg), arg),
        ]);
        index += 1;
        break;
      case "--owner":
        options.owner = requireValue(args, index, arg);
        index += 1;
        break;
      case "--repo":
        options.repo = requireValue(args, index, arg);
        index += 1;
        break;
      case "--github-output":
        options.githubOutput = requireValue(args, index, arg);
        index += 1;
        break;
      case "--no-github-output":
        options.githubOutput = undefined;
        break;
      case "--help":
        options.help = true;
        break;
      default:
        throw new Error(`unknown option: ${arg}`);
    }
  }

  if (options.latest === 0 && options.extraRefs.length === 0) {
    throw new Error("--latest 0 requires --extra-ref or --extra-refs");
  }

  return options;
}

function releaseTagKey(tag) {
  const match = RELEASE_TAG_PATTERN.exec(tag);
  if (!match) {
    return undefined;
  }

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return undefined;
  }

  return year * 10000 + month * 100 + day;
}

function selectLatestReleaseTags(tags, count) {
  return tags
    .map((tag) => ({ tag, key: releaseTagKey(tag) }))
    .filter((entry) => entry.key !== undefined)
    .sort((left, right) => {
      if (left.key !== right.key) {
        return right.key - left.key;
      }
      return right.tag.localeCompare(left.tag);
    })
    .slice(0, count)
    .map((entry) => entry.tag);
}

function matrixFromRefs(refs, kind) {
  return {
    include: refs.map((ref) => ({
      vcpkg_ref: ref,
      vcpkg_ref_kind: kind,
    })),
  };
}

function appendGithubOutput(path, name, value) {
  const delimiter = `vcpkg_refs_${process.pid}_${name}`;
  appendFileSync(path, `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
}

function requestJson(url, token, redirects = 0) {
  return new Promise((resolve, reject) => {
    const headers = {
      Accept: "application/vnd.github+json",
      "User-Agent": "vcpkg-github-cache-ref-resolver",
      "X-GitHub-Api-Version": "2022-11-28",
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const request = https.get(url, { headers }, (response) => {
      const status = response.statusCode ?? 0;
      const location = response.headers.location;
      let body = "";

      if (
        status >= 300 &&
        status < 400 &&
        location !== undefined &&
        redirects < 3
      ) {
        response.resume();
        resolve(requestJson(location, token, redirects + 1));
        return;
      }

      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        if (status < 200 || status >= 300) {
          reject(new Error(`GitHub API request failed with HTTP ${status}`));
          return;
        }

        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });

    request.on("error", reject);
  });
}

async function discoverReleaseTags(options) {
  const tags = [];

  for (let page = 1; page <= options.maxPages; page += 1) {
    const url =
      `https://api.github.com/repos/${options.owner}/${options.repo}/tags` +
      `?per_page=100&page=${page}`;
    const getJson = options.requestJson ?? requestJson;
    const pageTags = await getJson(url, options.token);

    if (!Array.isArray(pageTags)) {
      throw new Error("GitHub tag response was not an array");
    }

    for (const tag of pageTags) {
      if (typeof tag.name === "string") {
        tags.push(tag.name);
      }
    }

    if (pageTags.length < 100) {
      break;
    }
  }

  const selected = selectLatestReleaseTags(tags, options.latest);
  if (selected.length < options.latest) {
    throw new Error(
      `found ${selected.length} release tags, expected ${options.latest}`,
    );
  }

  return selected;
}

async function resolveRefs(options) {
  if (options.explicitRefs !== undefined) {
    return matrixFromRefs(options.explicitRefs, "explicit");
  }

  const releaseTags = await discoverReleaseTags(options);
  const refs = uniqueRefs([...releaseTags, ...options.extraRefs]);
  return {
    include: refs.map((ref) => ({
      vcpkg_ref: ref,
      vcpkg_ref_kind: releaseTags.includes(ref) ? "release-tag" : "explicit",
    })),
  };
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));

    if (options.help) {
      process.stdout.write(`${usage()}\n`);
      return;
    }

    const matrix = await resolveRefs(options);
    const matrixJson = JSON.stringify(matrix);
    const refsJson = JSON.stringify(
      matrix.include.map((entry) => entry.vcpkg_ref),
    );

    process.stdout.write(`${matrixJson}\n`);

    if (options.githubOutput !== undefined) {
      appendGithubOutput(options.githubOutput, "matrix", matrixJson);
      appendGithubOutput(options.githubOutput, "refs", refsJson);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] !== undefined) {
  const invokedPath = fileURLToPath(pathToFileURL(process.argv[1]));
  if (invokedPath === scriptPath) {
    await main();
  }
}

export {
  matrixFromRefs,
  parseArgs,
  parseRefList,
  releaseTagKey,
  resolveRefs,
  selectLatestReleaseTags,
  uniqueRefs,
};
