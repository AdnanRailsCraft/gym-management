# run-all.ps1 — Phase 0 Windows verification orchestrator.
# Runs each step, aggregates checks.jsonl into dist/results/report.json.
# Exit code 0 = every check passed. Report is the machine-readable source
# of truth; humans paste this file, not prose summaries.
param(
    [string[]]$Steps = @("01-deps", "02-test", "05-server-smoke")
)

. (Join-Path $PSScriptRoot "lib.ps1")

Set-Location (Join-Path $PSScriptRoot "..\..")

$resultDir = Get-GmsResultDir
New-Item -ItemType Directory -Force -Path $resultDir | Out-Null
Remove-Item (Join-Path $resultDir "checks.jsonl") -ErrorAction SilentlyContinue
Remove-Item (Join-Path $resultDir "report.json") -ErrorAction SilentlyContinue

$stepResults = @()
foreach ($step in $Steps) {
    $scriptPath = Join-Path $PSScriptRoot "$step.ps1"
    if (-not (Test-Path $scriptPath)) {
        Write-Host "MISSING STEP SCRIPT: $scriptPath"
        $stepResults += [ordered]@{ step = $step; exit_code = -1; status = "missing" }
        continue
    }
    Write-Host "=== $step ==="
    & $scriptPath
    $code = $LASTEXITCODE
    $status = if ($code -eq 0) { "pass" } else { "fail" }
    $stepResults += [ordered]@{ step = $step; exit_code = $code; status = $status }
}

# --- aggregate ------------------------------------------------------------
$checks = @()
$checksFile = Join-Path $resultDir "checks.jsonl"
if (Test-Path $checksFile) {
    foreach ($line in (Get-Content $checksFile)) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        $checks += ($line | ConvertFrom-Json)
    }
}
$failed = @($checks | Where-Object { -not $_.pass })
$report = [ordered]@{
    generated_at = (Get-Date).ToUniversalTime().ToString("o")
    machine      = $env:COMPUTERNAME
    total        = $checks.Count
    failed       = $failed.Count
    steps        = $stepResults
    checks       = $checks
}
$reportPath = Join-Path $resultDir "report.json"
$report | ConvertTo-Json -Depth 6 | Set-Content -Path $reportPath -Encoding utf8

Write-Host ""
Write-Host "=== SUMMARY: $($checks.Count) checks, $($failed.Count) failed ==="
if ($failed.Count -gt 0) {
    foreach ($f in $failed) { Write-Host "  FAILED: $($f.name) — $($f.detail)" }
}
Write-Host "Report: $reportPath"

if ($failed.Count -gt 0 -or ($stepResults | Where-Object { $_.status -ne "pass" }).Count -gt 0) {
    exit 1
}
exit 0
