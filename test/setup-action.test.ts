/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import * as core from "@actions/core";
import { readFile } from "node:fs/promises";

import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { emitSetupFiles } from "../src/shared/setup-script";

vi.mock("@actions/core", () => ({
  getInput: vi.fn(),
  info: vi.fn(),
  setOutput: vi.fn(),
  setSecret: vi.fn(),
  setFailed: vi.fn(),
  summary: {
    addHeading: vi.fn().mockReturnThis(),
    addList: vi.fn().mockReturnThis(),
    write: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../src/shared/setup-script", () => ({ emitSetupFiles: vi.fn() }));

let inputs: Record<string, string>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("VCPKG_GITHUB_CACHE_IMPORT_SMOKE", "1");
  vi.stubEnv("GITHUB_REPOSITORY", "octo/repo");
  vi.stubEnv("GITHUB_WORKSPACE", "/work/repo");
  vi.stubEnv("GITHUB_STEP_SUMMARY", "/work/summary.md");
  inputs = {
    token: "test-token",
    "execution-mode": "emit-script",
    "target-os": "netbsd",
    "package-manager": "pkgin",
  };
  vi.mocked(core.getInput).mockImplementation((name) => inputs[name] ?? "");
  vi.mocked(emitSetupFiles).mockResolvedValue({
    setupEnvOutput: "setup.env",
    setupEnvPath: "/work/repo/setup.env",
    setupScriptOutput: "setup.sh",
    setupScriptPath: "/work/repo/setup.sh",
  });
});

afterEach(() => vi.unstubAllEnvs());

test.each(["false", "true"])(
  "reports the selected manager with debug=%s",
  async (debug) => {
    inputs.debug = debug;
    const { run } = await import("../src/setup");
    await run();
    expect(emitSetupFiles).toHaveBeenCalledWith(
      expect.objectContaining({ packageManager: "pkgin", targetOs: "netbsd" }),
      "/work/repo",
    );
    expect(core.summary.addList).toHaveBeenCalledWith(
      expect.arrayContaining(["Package manager: pkgin"]),
    );
    if (debug === "false")
      expect(core.summary.addList).toHaveBeenCalledWith([
        "Package manager: pkgin",
      ]);
    expect(core.summary.write).toHaveBeenCalledOnce();
  },
);

test("rejects an unsupported manager before emitting files", async () => {
  inputs["target-os"] = "freebsd";
  const { run } = await import("../src/setup");
  await expect(run()).rejects.toThrow(
    "Unsupported package-manager 'pkgin' for target-os=freebsd",
  );
  expect(emitSetupFiles).not.toHaveBeenCalled();
  expect(core.summary.write).not.toHaveBeenCalled();
});

test.each(["../action.yml", "../setup/action.yml"])(
  "exposes package-manager in %s",
  async (file) => {
    const metadata = await readFile(new URL(file, import.meta.url), "utf8");
    expect(metadata).toMatch(/^ {2}package-manager:\r?\n {4}description:/m);
  },
);
