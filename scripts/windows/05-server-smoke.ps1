# 05-server-smoke.ps1 — boot the packaged-mode (production) server on Windows,
# prove loopback-only + live WAL/FK health JSON, then stop with no orphans.
. (Join-Path $PSScriptRoot "lib.ps1")

Set-Location (Join-Path $PSScriptRoot "..\..")

function Get-FreeLoopbackPort {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    $listener.Start()
    $port = ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
    $listener.Stop()
    return $port
}

$dataDir = Join-Path $env:TEMP ("gms-smoke-" + [System.Guid]::NewGuid().ToString("N").Substring(0, 8))
$port = Get-FreeLoopbackPort
$env:GMS_DATA_DIR = $dataDir
$env:RAILS_ENV = "production"
$env:PORT = "$port"

$serverProc = $null
try {
    # --- start: ruby bin/rails server (puma binds 127.0.0.1:$PORT via config/puma.rb)
    $rubyExe = (Get-Command ruby).Source
    $serverProc = Start-Process -FilePath $rubyExe `
        -ArgumentList @("bin/rails", "server") `
        -WorkingDirectory (Get-Location).Path `
        -PassThru -WindowStyle Hidden
    Write-Check -Name "server_process_started" -Pass ($null -ne $serverProc -and -not $serverProc.HasExited) `
        -Detail "pid=$($serverProc.Id) port=$port data=$dataDir"

    # --- poll health endpoint ------------------------------------------------
    $up = $false
    $rootPayload = $null
    for ($i = 1; $i -le 90; $i++) {
        try {
            $r = Invoke-WebRequest -Uri "http://127.0.0.1:$port/up" -UseBasicParsing -TimeoutSec 2
            if ($r.StatusCode -eq 200) { $up = $true; break }
        } catch { Start-Sleep -Seconds 1 }
    }
    Write-Check -Name "health_endpoint_up" -Pass $up -Detail "tries<=90 url=http://127.0.0.1:$port/up"

    # --- root JSON proves WAL + FK live on this Windows box -----------------
    if ($up) {
        try {
            $rr = Invoke-WebRequest -Uri "http://127.0.0.1:$port/" -UseBasicParsing -TimeoutSec 5
            $rootPayload = $rr.Content | ConvertFrom-Json
        } catch { $rootPayload = $null }
    }
    $walOk = ($null -ne $rootPayload) -and ($rootPayload.journal_mode -eq "wal")
    $fkOk  = ($null -ne $rootPayload) -and ($rootPayload.foreign_keys -eq $true)
    Write-Check -Name "sqlite_wal_active" -Pass $walOk -Detail "journal_mode=$(if ($rootPayload) { $rootPayload.journal_mode } else { 'no-response' })"
    Write-Check -Name "sqlite_foreign_keys_active" -Pass $fkOk -Detail "foreign_keys=$(if ($rootPayload) { $rootPayload.foreign_keys } else { 'no-response' })"

    # --- listener must be loopback-only -------------------------------------
    $listeners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
    $loopOnly = ($listeners.Count -gt 0)
    foreach ($l in $listeners) {
        if ($l.LocalAddress -ne "127.0.0.1" -and $l.LocalAddress -ne "::1") { $loopOnly = $false }
    }
    Write-Check -Name "listener_loopback_only" -Pass $loopOnly `
        -Detail ("addresses=" + (($listeners | ForEach-Object { $_.LocalAddress }) -join ","))

    # --- no inbound firewall rule created for the app -----------------------
    $fwRules = @(Get-NetFirewallRule -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName -like "*Gym*" })
    Write-Check -Name "no_firewall_rules_for_app" -Pass ($fwRules.Count -eq 0) `
        -Detail "matched=$($fwRules.Count)"
}
finally {
    # --- stop and prove no orphans ------------------------------------------
    if ($serverProc -and -not $serverProc.HasExited) {
        Stop-Process -Id $serverProc.Id -Force -ErrorAction SilentlyContinue
    }
    $portClosed = $false
    for ($i = 1; $i -le 15; $i++) {
        $still = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
        if ($still.Count -eq 0) { $portClosed = $true; break }
        Start-Sleep -Seconds 1
    }
    Write-Check -Name "server_stopped_port_closed" -Pass $portClosed -Detail "port=$port"

    $orphans = @(Get-CimInstance Win32_Process -Filter "Name='ruby.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like "*puma*" -or $_.CommandLine -like "*rails*server*" })
    Write-Check -Name "no_orphan_server_processes" -Pass ($orphans.Count -eq 0) `
        -Detail "orphans=$($orphans.Count)"

    # --- production data dir layout -----------------------------------------
    $dbOk = Test-Path (Join-Path $dataDir "db\gms.sqlite3")
    $secretOk = Test-Path (Join-Path $dataDir "config\secret_key_base")
    Write-Check -Name "data_dir_layout_created" -Pass ($dbOk -and $secretOk) `
        -Detail "db=$dbOk secret=$secretOk"

    Remove-Item -Recurse -Force $dataDir -ErrorAction SilentlyContinue
    $env:RAILS_ENV = ""
    $env:PORT = ""
    $env:GMS_DATA_DIR = ""
}

exit (Get-GmsExitCode)
