# Shared helpers for Phase 0 Windows build/test scripts.
# Compatible with Windows PowerShell 5.1 and pwsh 7+.
# Every check appends one JSON line to %GMS_RESULT_DIR%\checks.jsonl so the
# orchestrator can build a machine-readable report. No prose-only results.

$ErrorActionPreference = "Stop"

function Get-GmsResultDir {
    $dir = $env:GMS_RESULT_DIR
    if ([string]::IsNullOrEmpty($dir)) { $dir = "dist\results" }
    return $dir
}

function Write-Check {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][bool]$Pass,
        [string]$Detail = ""
    )
    $dir = Get-GmsResultDir
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $file = Join-Path $dir "checks.jsonl"
    $entry = [ordered]@{
        name   = $Name
        pass   = $Pass
        detail = $Detail
        script = $PSCommandPath
        ts     = (Get-Date).ToUniversalTime().ToString("o")
    }
    ($entry | ConvertTo-Json -Compress) | Add-Content -Path $file
    if ($Pass) { Write-Host "PASS  $Name  $Detail" } else { Write-Host "FAIL  $Name  $Detail" }
}

function Get-GmsFailedCount {
    $dir = Get-GmsResultDir
    $file = Join-Path $dir "checks.jsonl"
    if (-not (Test-Path $file)) { return 0 }
    $failed = 0
    foreach ($line in (Get-Content $file)) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        $obj = $line | ConvertFrom-Json
        if (-not $obj.pass) { $failed++ }
    }
    return $failed
}

# Captured when this file is dot-sourced, i.e. before the calling script
# records any checks. Lets each script exit non-zero only for ITS OWN failures
# while still sharing one accumulating checks.jsonl across the run.
$script:GmsBaselineFailures = Get-GmsFailedCount

function Get-GmsExitCode {
    $failed = Get-GmsFailedCount
    if ($failed -gt $script:GmsBaselineFailures) { return 1 }
    return 0
}

function Invoke-Tool {
    # Runs a command, captures output, returns @{ ExitCode; Output }.
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [string[]]$ArgumentList = @()
    )
    $output = & $FilePath @ArgumentList 2>&1 | Out-String
    return @{ ExitCode = $LASTEXITCODE; Output = $output }
}
