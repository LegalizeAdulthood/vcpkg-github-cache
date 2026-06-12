@echo off
setlocal EnableExtensions EnableDelayedExpansion

rem gh-package-prune.cmd
rem Delete old GitHub NuGet package versions.
rem Default owner: LegalizeAdulthood
rem Default scope: user
rem Default mode: dry-run

set "OWNER=LegalizeAdulthood"
set "SCOPE=users"
set "TYPE=nuget"
set "PACKAGE="
set "ALL_REPO="
set "KEEP_COUNT=10"
set "OLDER_THAN=30"
set "DO_DELETE=0"

:parse
if "%~1"=="" goto parsed

if /I "%~1"=="/package" (
    set "PACKAGE=%~2"
    shift
    shift
    goto parse
)

if /I "%~1"=="/all" (
    set "ALL_REPO=%~2"
    shift
    shift
    goto parse
)

if /I "%~1"=="/keep-count" (
    set "KEEP_COUNT=%~2"
    shift
    shift
    goto parse
)

if /I "%~1"=="/older-than" (
    set "OLDER_THAN=%~2"
    shift
    shift
    goto parse
)

if /I "%~1"=="/delete" (
    set "DO_DELETE=1"
    shift
    goto parse
)

if /I "%~1"=="/user" (
    set "OWNER=%~2"
    set "SCOPE=users"
    shift
    shift
    goto parse
)

if /I "%~1"=="/org" (
    set "OWNER=%~2"
    set "SCOPE=orgs"
    shift
    shift
    goto parse
)

if /I "%~1"=="/?" goto usage
if /I "%~1"=="/help" goto usage

echo unknown option: %~1
echo.
goto usage

:parsed
if defined PACKAGE if defined ALL_REPO (
    echo error: use either /package or /all, not both
    echo.
    goto usage
)

if not defined PACKAGE if not defined ALL_REPO goto usage

where gh >nul 2>nul
if errorlevel 1 (
    echo error: gh is required
    exit /b 1
)

set "TMP_CSV=%TEMP%\gh-package-prune-%RANDOM%-%RANDOM%.csv"
set "PACKAGES_CSV=%TEMP%\gh-package-prune-packages-%RANDOM%-%RANDOM%.csv"

rem Status rules:
rem   KEEP    newest KEEP_COUNT versions
rem   KEEP    versions newer than OLDER_THAN days
rem   DRYRUN  deletion candidate unless /delete is supplied

set "JQ=sort_by(.created_at) | reverse | to_entries[] | . as $e | ($e.value.created_at | fromdateiso8601) as $t | (now - (%OLDER_THAN% * 86400)) as $cut | [(if $e.key < %KEEP_COUNT% then \"KEEP\" elif $t > $cut then \"KEEP\" else \"DRYRUN\" end), $e.value.id, $e.value.name, $e.value.created_at, (if $e.key < %KEEP_COUNT% then \"newest\" elif $t > $cut then \"too new\" else \"\" end)] | @csv"
set "JQ_ALL=sort_by(.created_at) | reverse | .[] | [\"DRYRUN\", .id, .name, .created_at, \"all\"] | @csv"

if defined ALL_REPO goto prune_all

call :prune_package "%PACKAGE%"
set "RESULT=%ERRORLEVEL%"
del "%TMP_CSV%" >nul 2>nul
del "%PACKAGES_CSV%" >nul 2>nul
exit /b %RESULT%

:prune_all
set /a MATCHED=0
set "FAILED=0"
set "JQ_PACKAGES=.[] | select(.repository.name == \"%ALL_REPO%\" or (.repository.full_name // \"\") == \"%ALL_REPO%\") | [.name] | @csv"

gh api ^
  -H "Accept: application/vnd.github+json" ^
  -H "X-GitHub-Api-Version: 2022-11-28" ^
  --paginate ^
  "/%SCOPE%/%OWNER%/packages?package_type=%TYPE%&per_page=100" ^
  --jq "%JQ_PACKAGES%" > "%PACKAGES_CSV%"

if errorlevel 1 (
    del "%TMP_CSV%" >nul 2>nul
    del "%PACKAGES_CSV%" >nul 2>nul
    exit /b 1
)

for /f "usebackq tokens=1 delims=," %%P in ("%PACKAGES_CSV%") do (
    set /a MATCHED+=1
    echo.
    echo package %%~P
    call :prune_package "%%~P" all
    if errorlevel 1 set "FAILED=1"
)

del "%TMP_CSV%" >nul 2>nul
del "%PACKAGES_CSV%" >nul 2>nul

if "%MATCHED%"=="0" (
    echo no packages found for repository %ALL_REPO%
    exit /b 1
)

exit /b %FAILED%

:prune_package
set "PACKAGE=%~1"
set "MODE=%~2"
set "BASE=/%SCOPE%/%OWNER%/packages/%TYPE%/%PACKAGE%/versions"
set "JQ_CURRENT=%JQ%"
if /I "%MODE%"=="all" set "JQ_CURRENT=%JQ_ALL%"

echo listing package versions:
echo   %BASE%
echo.

gh api ^
  -H "Accept: application/vnd.github+json" ^
  -H "X-GitHub-Api-Version: 2022-11-28" ^
  --paginate ^
  "%BASE%?per_page=100" ^
  --jq "%JQ_CURRENT%" > "%TMP_CSV%"

if errorlevel 1 (
    del "%TMP_CSV%" >nul 2>nul
    exit /b 1
)

for /f "usebackq tokens=1,2,3,4,5 delims=," %%A in ("%TMP_CSV%") do (
    set "STATUS=%%~A"
    set "VERSION_ID=%%~B"
    set "VERSION_NAME=%%~C"
    set "CREATED_AT=%%~D"
    set "REASON=%%~E"

    if "!STATUS!"=="KEEP" (
        echo KEEP   id=!VERSION_ID! created=!CREATED_AT! version=!VERSION_NAME! reason=!REASON!
    ) else (
        if "%DO_DELETE%"=="1" (
            echo DELETE id=!VERSION_ID! created=!CREATED_AT! version=!VERSION_NAME!
            gh api ^
              --method DELETE ^
              -H "Accept: application/vnd.github+json" ^
              -H "X-GitHub-Api-Version: 2022-11-28" ^
              "%BASE%/!VERSION_ID!" >nul

            if errorlevel 1 (
                echo error: failed to delete version id !VERSION_ID!
            )
        ) else (
            echo DRYRUN id=!VERSION_ID! created=!CREATED_AT! version=!VERSION_NAME!
        )
    )
)

del "%TMP_CSV%" >nul 2>nul

echo.
if "%DO_DELETE%"=="1" (
    echo done
) else (
    echo dry-run only. Add /delete to delete the DRYRUN versions.
)

exit /b 0

:usage
echo usage:
echo   gh-package-prune.cmd /package PACKAGE_NAME [options]
echo   gh-package-prune.cmd /all REPOSITORY [options]
echo.
echo options:
echo   /all REPOSITORY     delete every version of every package attached to this repository
echo   /keep-count N       with /package, keep newest N versions, default 10
echo   /older-than DAYS    with /package, only delete versions older than DAYS, default 30
echo   /delete             actually delete; otherwise dry-run
echo   /user USER          use a user owner, default LegalizeAdulthood
echo   /org ORG            use an organization owner
echo.
echo examples:
echo   gh-package-prune.cmd /package My.Package
echo   gh-package-prune.cmd /package My.Package /keep-count 20 /older-than 30
echo   gh-package-prune.cmd /package My.Package /keep-count 20 /older-than 30 /delete
echo   gh-package-prune.cmd /all My.Repository
echo   gh-package-prune.cmd /all My.Repository /delete
exit /b 2
