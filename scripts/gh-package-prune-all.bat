@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "OWNER="
set "SCOPE="
set "TYPE=nuget"
set "DO_DELETE="

:parse
if "%~1"=="" goto parsed

if /I "%~1"=="/delete" (
    set "DO_DELETE=/delete"
    shift
    goto parse
)

if /I "%~1"=="/org" (
    if "%~2"=="" goto usage
    set "OWNER=%~2"
    set "SCOPE=orgs"
    shift
    shift
    goto parse
)

if /I "%~1"=="/user" (
    if "%~2"=="" goto usage
    set "OWNER=%~2"
    set "SCOPE=users"
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
if not defined OWNER (
    echo error: use /user USER or /org ORG
    echo.
    goto usage
)

where gh >nul 2>nul
if errorlevel 1 (
    echo error: gh is required
    exit /b 1
)

for /f "usebackq tokens=1 delims=," %%A in (`
    gh api --paginate "/%SCOPE%/%OWNER%/packages?package_type=%TYPE%&per_page=100" --jq ".[] | [.name] | @csv"
`) do (
    set "PACKAGE=%%~A"

    echo.
    echo package !PACKAGE!
    if /I "%SCOPE%"=="users" (
        call gh-package-prune.bat /user "%OWNER%" /package "!PACKAGE!" /keep-count 1 /older-than 0 %DO_DELETE%
    ) else (
        call gh-package-prune.bat /org "%OWNER%" /package "!PACKAGE!" /keep-count 1 /older-than 0 %DO_DELETE%
    )
)

exit /b 0

:usage
echo usage:
echo   gh-package-prune-all.bat /user USER [/delete]
echo   gh-package-prune-all.bat /org ORG [/delete]
exit /b 2
