# SPDX-License-Identifier: GPL-3.0-only
#
# Copyright 2026 Richard Thomson

cmake_minimum_required(VERSION 3.21)

project(vcpkg_github_cache_fixture LANGUAGES CXX)

if(FIXTURE_REQUIRE_BISON)
  find_package(BISON REQUIRED)
endif()

find_package(fmt CONFIG REQUIRED)

if(NOT fmt_DIR MATCHES "(/|\\\\)(vcpkg_installed|installed)(/|\\\\)")
  message(FATAL_ERROR "fmt was not found from a vcpkg install: ${fmt_DIR}")
endif()

add_executable(vcpkg_github_cache_fixture main.cpp)
target_compile_features(vcpkg_github_cache_fixture PRIVATE cxx_std_17)
target_link_libraries(vcpkg_github_cache_fixture PRIVATE fmt::fmt)

include(CTest)

add_test(NAME vcpkg_github_cache_fixture
         COMMAND vcpkg_github_cache_fixture)
