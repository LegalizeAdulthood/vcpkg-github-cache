/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { CommandRunner, CommandResult, formatCommand } from "./command";

export interface TraceLogger {
  readonly commandRunner: (run: CommandRunner) => CommandRunner;
  readonly decision: (label: string, value: string) => void;
  readonly input: (label: string, value: string | undefined) => void;
  readonly path: (label: string, value: string) => void;
  readonly step: <T>(label: string, run: () => Promise<T>) => Promise<T>;
  readonly value: (label: string, value: string) => void;
}

export interface TraceLoggerOptions {
  readonly enabled: boolean;
  readonly log: (message: string) => void;
  readonly now?: () => number;
  readonly secrets?: readonly string[];
}

function redact(value: string, secrets: readonly string[]): string {
  let redacted = value;

  for (const secret of secrets) {
    if (secret) {
      redacted = redacted.split(secret).join("***");
    }
  }

  return redacted;
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorExitCode(error: unknown): string {
  const detail = errorDetail(error);
  const match = /\bexit code\s+(\d+)\b/i.exec(detail);

  return match?.[1] ?? "unknown";
}

function elapsedMilliseconds(start: number, now: () => number): number {
  return Math.max(0, Math.round(now() - start));
}

export function createTraceLogger(options: TraceLoggerOptions): TraceLogger {
  const now = options.now ?? (() => Date.now());
  const secrets = options.secrets ?? [];

  function write(message: string): void {
    if (options.enabled) {
      options.log(`Trace ${redact(message, secrets)}`);
    }
  }

  function formatValue(value: string | undefined): string {
    return value && value.length > 0 ? value : "(empty)";
  }

  return {
    commandRunner:
      (run: CommandRunner): CommandRunner =>
      async (
        command: string,
        args: readonly string[],
        commandOptions,
      ): Promise<CommandResult> => {
        const commandLine = formatCommand(command, args);
        const start = now();

        write(`command: ${commandLine}`);

        try {
          const result = await run(command, args, commandOptions);
          write(
            `command exit code: 0 (${elapsedMilliseconds(
              start,
              now,
            )} ms): ${commandLine}`,
          );
          return result;
        } catch (error) {
          write(
            `command exit code: ${errorExitCode(error)} (${elapsedMilliseconds(
              start,
              now,
            )} ms): ${commandLine}`,
          );
          throw error;
        }
      },
    decision: (label: string, value: string): void => {
      write(`decision ${label}: ${value}`);
    },
    input: (label: string, value: string | undefined): void => {
      write(`input ${label}: ${formatValue(value)}`);
    },
    path: (label: string, value: string): void => {
      write(`path ${label}: ${formatValue(value)}`);
    },
    step: async <T>(label: string, run: () => Promise<T>): Promise<T> => {
      const start = now();

      write(`step ${label}: start`);

      try {
        const result = await run();
        write(`step ${label}: ok (${elapsedMilliseconds(start, now)} ms)`);
        return result;
      } catch (error) {
        write(
          `step ${label}: failed (${elapsedMilliseconds(
            start,
            now,
          )} ms): ${errorDetail(error)}`,
        );
        throw error;
      }
    },
    value: (label: string, value: string): void => {
      write(`${label}: ${formatValue(value)}`);
    },
  };
}
