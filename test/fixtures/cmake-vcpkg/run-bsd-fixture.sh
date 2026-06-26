#!/usr/bin/env sh
# SPDX-License-Identifier: GPL-3.0-only
#
# Copyright 2026 Richard Thomson

set +e
set -u

copyback=${BSD_COPYBACK_DIR:?BSD_COPYBACK_DIR is required}
triplet=${BSD_TRIPLET:?BSD_TRIPLET is required}
setup_env=${VCPKG_GITHUB_CACHE_SETUP_ENV:?setup env is required}
setup_script=${VCPKG_GITHUB_CACHE_SETUP_SCRIPT:?setup script is required}

mkdir -p "${copyback}"
: > setup.log
: > build.log
: > tool-warm.log
printf '%s\n' 1 > tool-warm.status

run_logged_to() {
    log_file=$1
    label=$2
    shift 2
    tmp_status="${copyback}/command.status"

    {
        printf '\n## %s\n' "${label}"
        printf '> '
        printf '%s ' "$@"
        printf '\n'
    } | tee -a "${log_file}"

    ( "$@"; printf '%s\n' "$?" > "${tmp_status}" ) 2>&1 |
        tee -a "${log_file}"

    if [ -r "${tmp_status}" ]; then
        IFS= read -r command_status < "${tmp_status}"
        rm -f "${tmp_status}"
    else
        command_status=1
    fi

    return "${command_status}"
}

run_logged() {
    run_logged_to build.log "$@"
}

build_fixture() {
    build_dir=$1
    build_log=$2
    build_status=$3

    BUILD_DIR="${build_dir}" \
        BUILD_LOG="${build_log}" \
        BUILD_STATUS="${build_status}" \
        CMAKE_GENERATOR=Ninja \
        FIXTURE_REQUIRE_BISON="${FIXTURE_REQUIRE_BISON:-}" \
        VCPKG_HOST_TRIPLET="${triplet}" \
        VCPKG_OVERLAY_TRIPLETS="${overlay_triplets}" \
        VCPKG_TARGET_TRIPLET="${triplet}" \
        sh test/fixtures/cmake-vcpkg/build-fixture.sh
}

if run_logged_to setup.log "Setup vcpkg cache" sh "${setup_script}"; then
    . "${setup_env}"
    overlay_triplets=$(pwd -P)/test/fixtures/cmake-vcpkg/triplets
    build_fixture /tmp/vcpkg-github-cache-fixture build.log build.status
    build_status=$?
else
    build_status=$?
    printf '%s\n' "${build_status}" > build.status
fi

if [ "${build_status}" -eq 0 ] && [ "${CACHE_MODE:-}" = readwrite ]; then
    if run_logged_to tool-warm.log "Setup vcpkg cache warm pass" \
            sh "${setup_script}"; then
        tool_warm_status=0
        . "${setup_env}"
        build_fixture /tmp/vcpkg-github-cache-fixture-warm \
            build-warm.log build-warm.status
    else
        tool_warm_status=$?
        : > build-warm.log
        printf '%s\n' "${tool_warm_status}" > build-warm.status
    fi

    printf '%s\n' "${tool_warm_status}" > tool-warm.status
else
    : > build-warm.log
    printf '%s\n' 1 > build-warm.status
fi

cp setup.log build.log build.status build-warm.log build-warm.status \
    tool-warm.log tool-warm.status "${copyback}/"
find . -mindepth 1 -maxdepth 1 ! -name .git \
    ! -name "${copyback}" -exec rm -rf {} +
mv "${copyback}"/* .
rmdir "${copyback}"
