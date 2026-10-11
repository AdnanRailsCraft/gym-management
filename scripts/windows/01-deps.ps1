# 01-deps.ps1 — prove the toolchain and gems on this Windows machine.
# Checks: exact Ruby pin, exact Rails pin, bundle install, sqlite3 native
# extension loads (MSVC landmine), production asset precompile.
. (Join-Path $PSScriptRoot "lib.ps1")

Set-Location (Join-Path $PSScriptRoot "..\..")

# --- exact Ruby pin -------------------------------------------------------
$pinned = (Get-Content ".ruby-version" -Raw).Trim() -replace "^ruby-", ""
$actual = (& ruby -e "print RUBY_VERSION" 2>&1 | Out-String).Trim()
Write-Check -Name "ruby_version_matches_pin" -Pass ($actual -eq $pinned) `
    -Detail "pinned=$pinned actual=$actual"

# --- bundle install (frozen lockfile) -------------------------------------
$env:BUNDLE_FROZEN = "true"
$bundle = Invoke-Tool -FilePath "bundle" -ArgumentList @("install", "--jobs", "4", "--retry", "3")
Write-Check -Name "bundle_install" -Pass ($bundle.ExitCode -eq 0) `
    -Detail ($bundle.Output.Trim() -split "`n" | Select-Object -Last 1)

# --- exact Rails pin ------------------------------------------------------
$railsVer = (& bundle exec ruby -e "require 'rails'; print Rails.version" 2>&1 | Out-String).Trim()
Write-Check -Name "rails_version_is_8_1_3_1" -Pass ($railsVer -eq "8.1.3.1") `
    -Detail "actual=$railsVer"

# --- sqlite3 native extension compiles/loads on Windows -------------------
$sql = Invoke-Tool -FilePath "bundle" -ArgumentList @("exec", "ruby", "-e", "require 'sqlite3'; print SQLite3::VERSION")
Write-Check -Name "sqlite3_native_extension_loads" -Pass ($sql.ExitCode -eq 0) `
    -Detail $sql.Output.Trim()

# --- production assets precompile (needs a temp data dir) -----------------
$buildData = Join-Path $env:TEMP "gms-build-data"
New-Item -ItemType Directory -Force -Path $buildData | Out-Null
$env:GMS_DATA_DIR = $buildData
$env:RAILS_ENV = "production"
$pre = Invoke-Tool -FilePath "bundle" -ArgumentList @("exec", "rails", "assets:precompile")
$env:RAILS_ENV = ""
Write-Check -Name "assets_precompile_production" -Pass ($pre.ExitCode -eq 0) `
    -Detail (($pre.Output.Trim() -split "`n" | Select-Object -Last 1))

exit (Get-GmsExitCode)
