/*
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright 2026 Richard Thomson
 */

import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: ["analyze/dist/**", "coverage/**", "setup/dist/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      globals: {
        process: "readonly",
      },
      sourceType: "module",
    },
    rules: {
      "no-console": "error",
    },
  },
];
