@echo off
setlocal EnableExtensions EnableDelayedExpansion

rem SPDX-License-Identifier: GPL-3.0-only
rem
rem Copyright 2026 Richard Thomson

if not defined VCPKG_ROOT (
    echo VCPKG_ROOT is required 1>&2
    exit /b 1
)

for %%I in ("%VCPKG_ROOT%") do set "VCPKG_ROOT=%%~fI"

if not defined BUILD_CONFIG set "BUILD_CONFIG=Release"
if not defined RUNNER_TEMP set "RUNNER_TEMP=%TEMP%"
if not defined BUILD_DIR (
    set "BUILD_DIR=%RUNNER_TEMP%\vcpkg-github-cache-fixture-build"
)
if not defined VCPKG_TOOLCHAIN_FILE (
    set "VCPKG_TOOLCHAIN_FILE=%VCPKG_ROOT%\scripts\buildsystems\vcpkg.cmake"
)
for %%I in ("%VCPKG_TOOLCHAIN_FILE%") do set "VCPKG_TOOLCHAIN_FILE=%%~fI"
if not defined BUILD_LOG set "BUILD_LOG=%BUILD_DIR%\build.log"
if not defined BUILD_STATUS set "BUILD_STATUS=%BUILD_DIR%\build.status"

for %%I in ("%~dp0.") do set "SCRIPT_DIR=%%~fI"
for %%I in ("%BUILD_DIR%") do set "BUILD_DIR=%%~fI"
for %%I in ("%BUILD_LOG%") do set "BUILD_LOG_DIR=%%~dpI"
for %%I in ("%BUILD_STATUS%") do set "BUILD_STATUS_DIR=%%~dpI"

if not exist "%BUILD_DIR%" mkdir "%BUILD_DIR%"
if errorlevel 1 exit /b 1
if not exist "%BUILD_LOG_DIR%" mkdir "%BUILD_LOG_DIR%"
if errorlevel 1 exit /b 1
if not exist "%BUILD_STATUS_DIR%" mkdir "%BUILD_STATUS_DIR%"
if errorlevel 1 exit /b 1

type nul > "%BUILD_LOG%"

set "CONFIGURE_ARGS=-S "%SCRIPT_DIR%" -B "%BUILD_DIR%""
set "CONFIGURE_ARGS=!CONFIGURE_ARGS! "-DCMAKE_TOOLCHAIN_FILE=%VCPKG_TOOLCHAIN_FILE%""

if defined VCPKG_TARGET_TRIPLET (
    set "CONFIGURE_ARGS=!CONFIGURE_ARGS! "-DVCPKG_TARGET_TRIPLET=%VCPKG_TARGET_TRIPLET%""
)

if defined VCPKG_HOST_TRIPLET (
    set "CONFIGURE_ARGS=!CONFIGURE_ARGS! "-DVCPKG_HOST_TRIPLET=%VCPKG_HOST_TRIPLET%""
)

if defined VCPKG_OVERLAY_TRIPLETS (
    set "CONFIGURE_ARGS=!CONFIGURE_ARGS! "-DVCPKG_OVERLAY_TRIPLETS=%VCPKG_OVERLAY_TRIPLETS%""
)

if defined CMAKE_GENERATOR (
    set "CONFIGURE_ARGS=!CONFIGURE_ARGS! -G "%CMAKE_GENERATOR%""
)

set "EXIT_STATUS=0"

set "TEMP_LOG=%BUILD_DIR%\fixture-%RANDOM%-%RANDOM%.log"
echo.
echo ## Configure fixture
echo ^> cmake !CONFIGURE_ARGS!
>> "%BUILD_LOG%" echo.
>> "%BUILD_LOG%" echo ## Configure fixture
>> "%BUILD_LOG%" echo ^> cmake !CONFIGURE_ARGS!
cmake !CONFIGURE_ARGS! > "%TEMP_LOG%" 2>&1
call :finish_step !ERRORLEVEL!
if errorlevel 1 (
    set "EXIT_STATUS=!ERRORLEVEL!"
    goto done
)

set "TEMP_LOG=%BUILD_DIR%\fixture-%RANDOM%-%RANDOM%.log"
echo.
echo ## Build fixture
echo ^> cmake --build "%BUILD_DIR%" --config "%BUILD_CONFIG%"
>> "%BUILD_LOG%" echo.
>> "%BUILD_LOG%" echo ## Build fixture
>> "%BUILD_LOG%" echo ^> cmake --build "%BUILD_DIR%" --config "%BUILD_CONFIG%"
cmake --build "%BUILD_DIR%" --config "%BUILD_CONFIG%" > "%TEMP_LOG%" 2>&1
call :finish_step !ERRORLEVEL!
if errorlevel 1 (
    set "EXIT_STATUS=!ERRORLEVEL!"
    goto done
)

set "TEMP_LOG=%BUILD_DIR%\fixture-%RANDOM%-%RANDOM%.log"
echo.
echo ## Test fixture
echo ^> ctest --test-dir "%BUILD_DIR%" -C "%BUILD_CONFIG%" --output-on-failure
>> "%BUILD_LOG%" echo.
>> "%BUILD_LOG%" echo ## Test fixture
>> "%BUILD_LOG%" echo ^> ctest --test-dir "%BUILD_DIR%" -C "%BUILD_CONFIG%" --output-on-failure
ctest --test-dir "%BUILD_DIR%" -C "%BUILD_CONFIG%" --output-on-failure > "%TEMP_LOG%" 2>&1
call :finish_step !ERRORLEVEL!
if errorlevel 1 (
    set "EXIT_STATUS=!ERRORLEVEL!"
    goto done
)

:done
> "%BUILD_STATUS%" echo %EXIT_STATUS%
exit /b %EXIT_STATUS%

:finish_step
set "COMMAND_STATUS=%~1"
type "%TEMP_LOG%"
type "%TEMP_LOG%" >> "%BUILD_LOG%"
del "%TEMP_LOG%" >nul 2>nul

exit /b %COMMAND_STATUS%
