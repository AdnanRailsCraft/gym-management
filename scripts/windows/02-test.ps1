# 02-test.ps1 — run the Rails test suite on Windows and emit machine-readable results.
. (Join-Path $PSScriptRoot "lib.ps1")

Set-Location (Join-Path $PSScriptRoot "..\..")

# --- prepare test/development databases -----------------------------------
$dbp = Invoke-Tool -FilePath "bundle" -ArgumentList @("exec", "rails", "db:prepare")
Write-Check -Name "db_prepare" -Pass ($dbp.ExitCode -eq 0) `
    -Detail ($dbp.Output.Trim() -split "`n" | Select-Object -Last 1)

# --- full test suite ------------------------------------------------------
$test = Invoke-Tool -FilePath "bundle" -ArgumentList @("exec", "rails", "test")
$summary = (($test.Output.Trim() -split "`n") | Select-String -Pattern "\d+ runs,.*skips" | Select-Object -Last 1)
if (-not $summary) { $summary = ($test.Output.Trim() -split "`n" | Select-Object -Last 1) }
Write-Check -Name "rails_test_suite" -Pass ($test.ExitCode -eq 0) -Detail ([string]$summary)

# --- index guard (every FK must be indexed — PERFORMANCE.md) ---------------
$idx = Invoke-Tool -FilePath "bundle" -ArgumentList @("exec", "rails", "db:missing_indexes")
Write-Check -Name "db_missing_indexes" -Pass ($idx.ExitCode -eq 0) `
    -Detail ($idx.Output.Trim() -split "`n" | Select-Object -Last 1)

exit (Get-GmsExitCode)
