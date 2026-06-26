// SPDX-License-Identifier: GPL-3.0-only
//
// Copyright 2026 Richard Thomson

#include <fmt/format.h>

#include <string>

int main()
{
    const std::string text = fmt::format("vcpkg {}", "fixture");
    return text == "vcpkg fixture" ? 0 : 1;
}
