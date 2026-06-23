/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

export interface PosixShellWord {
  readonly text: string;
  readonly type: "literal" | "runtime";
}

export function quotePosixShellLiteral(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

export function posixLiteral(value: string): PosixShellWord {
  return {
    text: value,
    type: "literal",
  };
}

export function posixRuntimeExpression(value: string): PosixShellWord {
  return {
    text: value,
    type: "runtime",
  };
}

export function renderPosixShellWord(word: PosixShellWord): string {
  if (word.type === "runtime") {
    return word.text;
  }

  return quotePosixShellLiteral(word.text);
}

export function renderPosixShellWords(
  words: readonly PosixShellWord[],
): string {
  return words.map(renderPosixShellWord).join(" ");
}

export function renderPosixCommand(
  command: string,
  args: readonly PosixShellWord[],
): string {
  return [command, renderPosixShellWords(args)].filter(Boolean).join(" ");
}

export class PosixScript {
  private readonly lines: string[] = [];

  blank(): void {
    this.lines.push("");
  }

  command(command: string, args: readonly PosixShellWord[] = []): void {
    this.line(renderPosixCommand(command, args));
  }

  line(value: string): void {
    this.lines.push(value);
  }

  render(): string {
    return `${this.lines.join("\n")}\n`;
  }
}
