@echo off
setlocal EnableExtensions EnableDelayedExpansion


rem gh-package-usage.bat

rem Report current GitHub NuGet package storage for LegalizeAdulthood.
rem Requires gh and curl.

set "OWNER=LegalizeAdulthood"
set "TYPE=nuget"
set "QUOTA_MIB=500"
set "DOWNLOAD_BASE=https://nuget.pkg.github.com/%OWNER%/download"


where gh >nul 2>nul

if errorlevel 1 (

    echo error: gh is required

    exit /b 1
)

where curl >nul 2>nul
if errorlevel 1 (
    echo error: curl is required
    exit /b 1
)

set "TOKEN_FILE=%TEMP%\gh-package-usage-token-%RANDOM%-%RANDOM%.txt"
set "VERSIONS_FILE=%TEMP%\gh-package-usage-versions-%RANDOM%-%RANDOM%.txt"
set "HEAD_FILE=%TEMP%\gh-package-usage-head-%RANDOM%-%RANDOM%.txt"

gh auth token > "%TOKEN_FILE%"
if errorlevel 1 (
    del "%TOKEN_FILE%" >nul 2>nul
    exit /b 1
)

set "GH_TOKEN="
for /f "usebackq delims=" %%T in ("%TOKEN_FILE%") do set "GH_TOKEN=%%T"

if not defined GH_TOKEN (
    del "%TOKEN_FILE%" >nul 2>nul
    echo error: gh auth token returned no token
    exit /b 1
)

set /a TOTAL_BYTES=0
set /a TOTAL_VERSIONS=0


printf "%%-48s %%-32s %%8s %%14s %%10s\n" "Package" "Repository" "Versions" "Bytes" "KiB"
printf "%%-48s %%-32s %%8s %%14s %%10s\n" "-------" "----------" "--------" "-----" "---"

for /f "usebackq tokens=1,2 delims=," %%A in (`
    gh api --paginate "/users/%OWNER%/packages?package_type=%TYPE%&per_page=100" --jq ".[] | [.name, .repository.name] | @csv"
`) do (
    call :package_usage "%%~A" "%%~B"
    if errorlevel 1 goto failed
)

del "%TOKEN_FILE%" >nul 2>nul
del "%VERSIONS_FILE%" >nul 2>nul
del "%HEAD_FILE%" >nul 2>nul

set /a TOTAL_MIB=TOTAL_BYTES / 1048576
set /a PERCENT=TOTAL_MIB * 100 / QUOTA_MIB

printf "\n"
printf "%%-16s %%14d\n" "Total versions" %TOTAL_VERSIONS%
printf "%%-16s %%14d\n" "Total bytes" %TOTAL_BYTES%
printf "%%-16s %%14d\n" "Total MiB" %TOTAL_MIB%
printf "%%-16s %%14d\n" "Quota MiB" %QUOTA_MIB%
printf "%%-16s %%13d%%%%\n" "Quota used" %PERCENT%

exit /b 0

:failed
del "%TOKEN_FILE%" >nul 2>nul
del "%VERSIONS_FILE%" >nul 2>nul
del "%HEAD_FILE%" >nul 2>nul
exit /b 1

:package_usage
set "PACKAGE=%~1"
set "REPO=%~2"
set /a PACKAGE_BYTES=0
set /a PACKAGE_VERSIONS=0

gh api --paginate "/users/%OWNER%/packages/%TYPE%/!PACKAGE!/versions?per_page=100" --jq ".[].name" > "%VERSIONS_FILE%"
if errorlevel 1 exit /b 1

for /f "usebackq delims=" %%V in ("%VERSIONS_FILE%") do (
    call :version_usage "!PACKAGE!" "%%~V"
    if errorlevel 1 exit /b 1
)

set /a PACKAGE_KIB=PACKAGE_BYTES / 1024
printf "%%-48s %%-32s %%8d %%14d %%10d\n" "!PACKAGE!" "!REPO!" !PACKAGE_VERSIONS! !PACKAGE_BYTES! !PACKAGE_KIB!
exit /b 0

:version_usage
set "PACKAGE=%~1"
set "VERSION=%~2"
set "DOWNLOAD_URL=%DOWNLOAD_BASE%/%PACKAGE%/%VERSION%/%PACKAGE%.%VERSION%.nupkg"

call :content_length "!DOWNLOAD_URL!"
if errorlevel 1 exit /b 1

set /a PACKAGE_VERSIONS+=1
set /a TOTAL_VERSIONS+=1
set /a PACKAGE_BYTES+=CONTENT_LENGTH
set /a TOTAL_BYTES+=CONTENT_LENGTH
exit /b 0

:content_length
set "URL=%~1"
set "HTTP_STATUS="
set "CONTENT_LENGTH="
set "CONTENT_RANGE="

curl -L -s -r 0-0 -D "%HEAD_FILE%" -o NUL -H "Authorization: Bearer %GH_TOKEN%" "!URL!"
if errorlevel 1 (
    echo error: failed to request !URL!
    exit /b 1
)

for /f "usebackq tokens=2" %%S in (`findstr /B /C:"HTTP/" "%HEAD_FILE%"`) do set "HTTP_STATUS=%%S"
for /f "usebackq tokens=1,* delims=:" %%H in (`findstr /I /B /C:"Content-Range:" "%HEAD_FILE%"`) do set "CONTENT_RANGE=%%I"
for /f "usebackq tokens=1,* delims=:" %%H in (`findstr /I /B /C:"Content-Length:" "%HEAD_FILE%"`) do set "CONTENT_LENGTH=%%I"
for /f "tokens=* delims= " %%R in ("!CONTENT_RANGE!") do set "CONTENT_RANGE=%%R"
for /f "tokens=* delims= " %%L in ("!CONTENT_LENGTH!") do set "CONTENT_LENGTH=%%L"
if defined CONTENT_RANGE (
    for /f "tokens=2 delims=/" %%L in ("!CONTENT_RANGE!") do set "CONTENT_LENGTH=%%L"
)

if "!HTTP_STATUS!"=="403" (
    echo warning: HTTP !HTTP_STATUS! for !URL!, counting 0 bytes 1>&2
    set "CONTENT_LENGTH=0"
    exit /b 0
)

if "!HTTP_STATUS!"=="404" (
    echo warning: HTTP !HTTP_STATUS! for !URL!, counting 0 bytes 1>&2
    set "CONTENT_LENGTH=0"
    exit /b 0
)

if not "!HTTP_STATUS!"=="206" if not "!HTTP_STATUS!"=="200" (
    echo error: HTTP !HTTP_STATUS! for !URL!
    exit /b 1
)

if not defined CONTENT_LENGTH (
    echo error: no Content-Length for !URL!
    exit /b 1
)

exit /b 0
