/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { describe, expect, test } from "vitest";

import { CommandResult } from "../src/shared/command";
import { createTraceLogger } from "../src/shared/trace";

function result(): CommandResult {
  return { stderr: "", stdout: "" };
}

describe("trace logger", () => {
  test("logs redacted inputs and decisions", () => {
    const logs: string[] = [];
    const trace = createTraceLogger({
      enabled: true,
      log: (message) => logs.push(message),
      secrets: ["secret"],
    });

    trace.input("token", "secret");
    trace.input("feed-owner", "octo");
    trace.decision("bootstrap", "enabled");

    expect(logs).toEqual([
      "Trace input token: ***",
      "Trace input feed-owner: octo",
      "Trace decision bootstrap: enabled",
    ]);
  });

  test("wraps commands with command line, exit code, and elapsed time", async () => {
    const logs: string[] = [];
    let time = 0;
    const trace = createTraceLogger({
      enabled: true,
      log: (message) => logs.push(message),
      now: () => {
        time += 5;
        return time;
      },
      secrets: ["secret"],
    });
    const run = trace.commandRunner(async () => result());

    await run("nuget", ["setapikey", "secret"]);

    expect(logs).toEqual([
      "Trace command: nuget setapikey ***",
      "Trace command exit code: 0 (5 ms): nuget setapikey ***",
    ]);
  });

  test("logs failed command exit codes when available", async () => {
    const logs: string[] = [];
    const trace = createTraceLogger({
      enabled: true,
      log: (message) => logs.push(message),
      now: () => 1,
    });
    const run = trace.commandRunner(async () => {
      throw new Error("tool failed with exit code 7");
    });

    await expect(run("tool", [])).rejects.toThrow("exit code 7");
    expect(logs).toEqual([
      "Trace command: tool",
      "Trace command exit code: 7 (0 ms): tool",
    ]);
  });

  test("wraps steps with elapsed time", async () => {
    const logs: string[] = [];
    let time = 10;
    const trace = createTraceLogger({
      enabled: true,
      log: (message) => logs.push(message),
      now: () => {
        time += 3;
        return time;
      },
    });

    const value = await trace.step("probe", async () => "ok");

    expect(value).toBe("ok");
    expect(logs).toEqual([
      "Trace step probe: start",
      "Trace step probe: ok (3 ms)",
    ]);
  });
});
