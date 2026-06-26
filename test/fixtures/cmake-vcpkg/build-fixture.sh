#!/usr/bin/env sh
# SPDX-License-Identifier: GPL-3.0-only
#
# Copyright 2026 Richard Thomson

set -u

finish_failure() {
    status=$1
    printf '%s\n' "$status" > "$build_status"
    exit "$status"
}

run_logged() {
    label=$1
    shift
    tmp_status=$build_dir/.vcpkg-github-cache-fixture-status

    {
        printf '\n## %s\n' "$label"
        printf '> '
        printf '%s ' "$@"
        printf '\n'
    } | tee -a "$build_log"

    ( "$@"; printf '%s\n' "$?" > "$tmp_status" ) 2>&1 |
        tee -a "$build_log"

    if [ -r "$tmp_status" ]; then
        IFS= read -r status < "$tmp_status"
        rm -f "$tmp_status"
    else
        status=1
    fi

    if [ "$status" -ne 0 ]; then
        return "$status"
    fi

    return 0
}

case $0 in
    */*) script_path=$0 ;;
    *) script_path=./$0 ;;
esac

script_dir=${script_path%/*}
script_dir=$(CDPATH= cd "$script_dir" && pwd) || exit 1

vcpkg_root=${VCPKG_ROOT:-}
if [ -z "$vcpkg_root" ]; then
    printf '%s\n' "VCPKG_ROOT is required" >&2
    exit 1
fi

runner_temp=${RUNNER_TEMP:-${TMPDIR:-/tmp}}
build_dir=${BUILD_DIR:-$runner_temp/vcpkg-github-cache-fixture-build}
build_log=${BUILD_LOG:-$build_dir/build.log}
build_status=${BUILD_STATUS:-$build_dir/build.status}
build_config=${BUILD_CONFIG:-Release}
triplet=${VCPKG_TARGET_TRIPLET:-}
generator=${CMAKE_GENERATOR:-}
toolchain=${VCPKG_TOOLCHAIN_FILE:-$vcpkg_root/scripts/buildsystems/vcpkg.cmake}

build_log_dir=${build_log%/*}
if [ "$build_log_dir" = "$build_log" ]; then
    build_log_dir=.
fi

build_status_dir=${build_status%/*}
if [ "$build_status_dir" = "$build_status" ]; then
    build_status_dir=.
fi

mkdir -p "$build_dir" "$build_log_dir" "$build_status_dir" || exit 1
: > "$build_log" || exit 1

set -- -S "$script_dir" -B "$build_dir" "-DCMAKE_TOOLCHAIN_FILE=$toolchain"

if [ -n "$triplet" ]; then
    set -- "$@" "-DVCPKG_TARGET_TRIPLET=$triplet"
fi

if [ -n "$generator" ]; then
    set -- "$@" -G "$generator"
fi

run_logged "Configure fixture" cmake "$@" || finish_failure "$?"
run_logged "Build fixture" cmake --build "$build_dir" --config \
    "$build_config" || finish_failure "$?"
run_logged "Test fixture" ctest --test-dir "$build_dir" -C \
    "$build_config" --output-on-failure || finish_failure "$?"

printf '%s\n' 0 > "$build_status"
