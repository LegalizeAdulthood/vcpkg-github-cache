/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import { buildFeedUrl } from "./cache";
import {
  normalizeSetupExecutionMode,
  normalizeSetupTargetOs,
  normalizeTokenKind,
  parseBoolean,
  resolveFeedOwner,
  resolveUsername,
  SetupExecutionMode,
  SetupTargetOs,
  TokenKind,
} from "./inputs";
import { setupOutput } from "./setup-output";
import { resolveVcpkgPaths, VcpkgPaths } from "./vcpkg";

export interface SetupPlanInputs {
  readonly accessInput?: string;
  readonly actor?: string;
  readonly bootstrapInput?: string;
  readonly debugInput?: string;
  readonly executionModeInput?: string;
  readonly feedOwnerInput?: string;
  readonly installMonoInput?: string;
  readonly installNugetInput?: string;
  readonly repository?: string;
  readonly scriptDirectoryInput?: string;
  readonly sourceNameInput?: string;
  readonly targetOsInput?: string;
  readonly tokenKindInput?: string;
  readonly traceInput?: string;
  readonly usernameInput?: string;
  readonly vcpkgRootInput?: string;
  readonly workspace?: string;
}

export interface SetupPlan {
  readonly access: string;
  readonly binarySources: string;
  readonly bootstrap: boolean;
  readonly debug: boolean;
  readonly executionMode: SetupExecutionMode;
  readonly feedOwner: string;
  readonly feedUrl: string;
  readonly installMono: boolean;
  readonly installNuget: boolean;
  readonly scriptDirectory: string;
  readonly sourceName: string;
  readonly targetOs: SetupTargetOs;
  readonly tokenKind: TokenKind;
  readonly trace: boolean;
  readonly username: string;
  readonly vcpkg: VcpkgPaths;
  readonly vcpkgRootInput: string;
}

function defaultInput(value: string | undefined, defaultValue: string): string {
  return value?.trim() || defaultValue;
}

export function buildSetupPlan(inputs: SetupPlanInputs): SetupPlan {
  const tokenKind = normalizeTokenKind(
    defaultInput(inputs.tokenKindInput, "github"),
  );
  const feedOwner = resolveFeedOwner(inputs.feedOwnerInput, inputs.repository);
  const username = resolveUsername(
    inputs.usernameInput,
    tokenKind,
    feedOwner,
    inputs.actor,
  );
  const feedUrl = buildFeedUrl(feedOwner);
  const bootstrap = parseBoolean(defaultInput(inputs.bootstrapInput, "true"));
  const debug = parseBoolean(defaultInput(inputs.debugInput, "false"));
  const installMono = parseBoolean(
    defaultInput(inputs.installMonoInput, "true"),
  );
  const installNuget = parseBoolean(
    defaultInput(inputs.installNugetInput, "true"),
  );
  const sourceName = defaultInput(inputs.sourceNameInput, "GitHubPackages");
  const trace = parseBoolean(defaultInput(inputs.traceInput, "false"));
  const access = defaultInput(inputs.accessInput, "readwrite");
  const executionMode = normalizeSetupExecutionMode(
    defaultInput(inputs.executionModeInput, "run"),
  );
  const targetOs = normalizeSetupTargetOs(
    defaultInput(inputs.targetOsInput, "current"),
  );
  const scriptDirectory = defaultInput(
    inputs.scriptDirectoryInput,
    ".vcpkg-github-cache",
  );
  const vcpkgRootInput = defaultInput(inputs.vcpkgRootInput, "vcpkg");
  const vcpkg = resolveVcpkgPaths(vcpkgRootInput, inputs.workspace);
  const { binarySources } = setupOutput(feedUrl, access, installNuget);

  return {
    access,
    binarySources,
    bootstrap,
    debug,
    executionMode,
    feedOwner,
    feedUrl,
    installMono,
    installNuget,
    scriptDirectory,
    sourceName,
    targetOs,
    tokenKind,
    trace,
    username,
    vcpkg,
    vcpkgRootInput,
  };
}
