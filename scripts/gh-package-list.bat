@echo off
setlocal EnableExtensions EnableDelayedExpansion

rem gh-package-list.cmd
rem List NuGet packages for GitHub user LegalizeAdulthood.

set "OWNER=LegalizeAdulthood"
set "SCOPE=users"
set "TYPE=nuget"

if /I "%~1"=="/org" (
    set "OWNER=%~2"
    set "SCOPE=orgs"
    shift
    shift
)

if /I "%~1"=="/user" (
    set "OWNER=%~2"
    set "SCOPE=users"
    shift
    shift
)

where gh >nul 2>nul
if errorlevel 1 (
    echo error: gh is required
    exit /b 1
)

printf "%%-28.28s %%-44.44s %%4s %%6s %%10s %%10s %%10s\n" "Repository" "Package" "Vis" "Count" "Oldest" "Newest" "Updated"
printf "%%-28.28s %%-44.44s %%4s %%6s %%10s %%10s %%10s\n" "----------" "-------" "---" "-----" "------" "------" "-------"

for /f "usebackq tokens=1,2,3,4 delims=," %%A in (`
    gh api --paginate "/%SCOPE%/%OWNER%/packages?package_type=%TYPE%&per_page=100" --jq ".[] | [.name, .updated_at, .repository.name, .visibility] | @csv"
`) do (
    set "PACKAGE=%%~A"
    set "UPDATED=%%~B"
    set "REPOSITORY=%%~C"
    set "VISIBILITY=%%~D"
    set "VIS=Priv"
    if /I "!VISIBILITY!"=="public" set "VIS=Pub"

    for /f "usebackq tokens=1,2,3 delims=," %%V in (`
        gh api --paginate "/%SCOPE%/%OWNER%/packages/%TYPE%/!PACKAGE!/versions?per_page=100" --jq "[.[].created_at] | sort | [length, .[0], .[-1]] | @csv"
    `) do (
        set "COUNT=%%~V"
        set "OLDEST=%%~W"
        set "NEWEST=%%~X"

        if not "!OLDEST!"=="" set "OLDEST=!OLDEST:~0,10!"
        if not "!NEWEST!"=="" set "NEWEST=!NEWEST:~0,10!"
        if not "!UPDATED!"=="" set "UPDATED=!UPDATED:~0,10!"

        printf "%%-28.28s %%-44.44s %%4s %%6s %%10s %%10s %%10s\n" "!REPOSITORY!" "!PACKAGE!" "!VIS!" "!COUNT!" "!OLDEST!" "!NEWEST!" "!UPDATED!"
    )
)

exit /b 0
