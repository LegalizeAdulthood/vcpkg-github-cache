@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "OWNER=LegalizeAdulthood"
set "SCOPE=users"
set "TYPE=nuget"
set "DO_DELETE="

if /I "%~1"=="/delete" set "DO_DELETE=/delete"

for /f "usebackq tokens=1 delims=," %%A in (`
    gh api --paginate "/%SCOPE%/%OWNER%/packages?package_type=%TYPE%&per_page=100" --jq ".[] | [.name] | @csv"
`) do (
    set "PACKAGE=%%~A"

    echo.
    echo package !PACKAGE!
    call gh-package-prune.bat /package "!PACKAGE!" /keep-count 1 /older-than 0 %DO_DELETE%
)

exit /b 0
