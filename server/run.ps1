<#
.SYNOPSIS
    Run the AEGIS data core API (server.api.app:app) locally with uvicorn.

.DESCRIPTION
    Changes to the repo root (the parent of this script's folder), sets the environment
    the API reads, and starts uvicorn with a single worker (the store is in-process).
    Works in Windows PowerShell 5.1 and PowerShell 7.

.PARAMETER Port
    TCP port to listen on. Default 8000.

.PARAMETER BindHost
    Interface to bind. Default 127.0.0.1. Use 0.0.0.0 to expose it on the network.

.PARAMETER Db
    Optional SQLite path for the store (sets AEGIS_DB). Without it the store is in memory
    and check-ins are lost on restart.

.PARAMETER NoRefresh
    Turn off the background refresh of live adapters (sets AEGIS_REFRESH=0).

.PARAMETER Install
    Run "python -m pip install -r server/requirements.txt" before starting.

.PARAMETER Reload
    Dev mode: restart uvicorn when files under server/ change.

.EXAMPLE
    .\server\run.ps1
    Start on http://127.0.0.1:8000 with an in-memory store.

.EXAMPLE
    .\server\run.ps1 -Install -Db server\data\aegis.db
    Install requirements, then start with the store kept on disk.

.EXAMPLE
    .\server\run.ps1 -Port 8765 -NoRefresh -Reload
    Offline dev run on port 8765 with auto-reload.

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File server\run.ps1 -BindHost 0.0.0.0
    Start from any shell, reachable from other machines.
#>
# No [CmdletBinding()]: it adds -Debug, whose alias "db" would clash with -Db.
param(
    [int]$Port = 8000,
    [string]$BindHost = "127.0.0.1",
    [string]$Db,
    [switch]$NoRefresh,
    [switch]$Install,
    [switch]$Reload
)

$ErrorActionPreference = "Stop"

$python = Get-Command python -ErrorAction SilentlyContinue
if ($null -eq $python) {
    Write-Error "python was not found on PATH. Install Python 3.12 (https://www.python.org/downloads/) or activate your virtual environment, then run this script again."
    exit 1
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$exitCode = 1

$savedDb = $env:AEGIS_DB
$savedRefresh = $env:AEGIS_REFRESH

Push-Location $repoRoot
try {
    $env:PYTHONIOENCODING = "utf-8"
    # Start clean so a flag from an earlier run in this session does not stick.
    Remove-Item Env:AEGIS_DB, Env:AEGIS_REFRESH -ErrorAction SilentlyContinue
    if ($Db) {
        $env:AEGIS_DB = $Db
    }
    if ($NoRefresh) {
        $env:AEGIS_REFRESH = "0"
    }

    if ($Install) {
        Write-Host "Installing server/requirements.txt ..."
        & python -m pip install -r server/requirements.txt
        if ($LASTEXITCODE -ne 0) {
            Write-Error "pip install failed with exit code $LASTEXITCODE."
            exit $LASTEXITCODE
        }
    }

    $uvicornArgs = @("-m", "uvicorn", "server.api.app:app", "--host", $BindHost, "--port", "$Port")
    if ($Reload) {
        $uvicornArgs += @("--reload", "--reload-dir", "server")
    } else {
        $uvicornArgs += @("--workers", "1")
    }

    $shownHost = $BindHost
    if ($BindHost -eq "0.0.0.0") {
        $shownHost = "127.0.0.1"
    }
    Write-Host "AEGIS API: http://${shownHost}:$Port  (health: http://${shownHost}:$Port/api/health)"
    if ($Db) {
        Write-Host "Store: $Db"
    } else {
        Write-Host "Store: in memory"
    }
    if ($NoRefresh) {
        Write-Host "Live refresh: off"
    }

    & python @uvicornArgs
    $exitCode = $LASTEXITCODE
}
finally {
    $env:AEGIS_DB = $savedDb
    $env:AEGIS_REFRESH = $savedRefresh
    Pop-Location
}

exit $exitCode
