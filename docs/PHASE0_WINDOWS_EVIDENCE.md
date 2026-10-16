# Phase 0 — Windows Verification Kit (evidence for PACKAGING.md §7)

This kit lists every step to verify the Phase 0 prototype on a real Windows machine. The Linux build host cannot run NSIS (`wine` absent) and cannot perform clean-machine testing, so nothing here is pre-verified. Run it, record results in the table at the bottom, and send them back.

## Artifacts

| Artifact | Path | SHA-256 |
|---|---|---|
| Portable app (unpacked) | `dist/win-unpacked/` (folder; run `GymManagementSystem.exe`) | exe: `12ec7c1a949d6f265c5165fea4d48bbe0a143ba0d1c7ef034184736ef444da44` |
| Installer (UNTRUSTED — see warning) | `dist/GymManagementSystem-Setup-0.0.1.exe` | see note below |

**Warning:** the installer exe in `dist/` was produced by a build that **exited with an error** (`wine process failed ENOENT` during the NSIS step) and is only 202 KB — too small to contain the app. **Do not run it.** Build a fresh installer on Windows using the commands below. Do not use `dist/win-unpacked` for anything beyond smoke testing; the official path is the installer you build yourself.

`GymManagementSystem.exe` (portable) was produced by a successful packaging step and carries the correct fuses; it is suitable for smoke tests before you build the installer.

## A. Build the installer on Windows (the machine you trust)

Prereqs: Node.js 22.23.x (`node -v`), npm, this repo copied over (including `dist/win-unpacked` optional), no wine needed on Windows.

```powershell
cd <repo>
npm ci
npm run typecheck          # must pass
npm run lint               # must pass
npm run test               # expect 23 passed
npm run build              # next build (standalone)
npm run build:electron     # tsc -> dist-electron
npx electron-builder install-app-deps   # rebuild better-sqlite3 for Electron ABI
node scripts/prepare-standalone.mjs
npx electron-builder --win nsis          # produces dist/GymManagementSystem-Setup-<version>.exe
npx @electron/fuses read --app dist/win-unpacked/GymManagementSystem.exe
```

Record the installer SHA-256:

```powershell
Get-FileHash dist\GymManagementSystem-Setup-0.0.1.exe -Algorithm SHA256
```

## B. Run every PACKAGING.md §7 criterion

Use a **clean Windows VM or laptop without developer tools** for the installer run. Steps below are the minimum evidence per criterion. Tick what passes; paste outputs where asked.

1. **Installer runs; shortcuts; app window.**
   Run `GymManagementSystem-Setup-0.0.1.exe`. Accept defaults. Confirm Start-Menu shortcut "GymManagementSystem" and Desktop shortcut (per NSIS config: `perMachine: false`, no admin required). Launch from shortcut → app window opens showing the status screen with "Empire Fitness".

2. **Server binds 127.0.0.1 only; free port; no inbound firewall rule.**
   While the app is open (backend running):

   ```powershell
   Get-NetTCPConnection -State Listen | Where-Object { $_.OwningProcess -eq (Get-Process gym-management-system -ErrorAction Stop).Id } | Select LocalAddress, LocalPort
   # backend is a child node process — also check:
   Get-NetTCPConnection -State Listen | Where-Object { $_.LocalAddress -eq '127.0.0.1' -and $_.LocalPort -gt 10000 } | Select LocalAddress, LocalPort, OwningProcess
   Get-NetFirewallRule | Where-Object { $_.DisplayName -like '*Gym*' -or $_.DisplayName -like '*Electron*' }
   ```

   Expect: all listeners on `127.0.0.1`, random high port (log line `waiting for backend health at http://127.0.0.1:<port>` in `%LOCALAPPDATA%\GymManagementSystem\logs\main.log`), and **no new inbound firewall rule**.

3. **Requests without the per-launch token are rejected.**
   Get the backend port from `main.log`. With the app open:

   ```powershell
   $port = (Select-String -Path "$env:LOCALAPPDATA\GymManagementSystem\logs\main.log" -Pattern 'http://127.0.0.1:(\d+)').Matches[0].Groups[1].Value
   Invoke-WebRequest "http://127.0.0.1:$port/api/health" -SkipHttpErrorCheck | Select StatusCode
   ```

   Expect: **401**. The cookie is only present inside the Electron session, so an outside request has no token.

4. **better-sqlite3 loads in the packaged app; WAL + foreign keys active.**
   Already proven by startup: `main.log` must show `[gms] migrations applied: 0001_init` and no `NODE_MODULE_VERSION` / `was compiled against a different Node.js version` error. DB files present:

   ```powershell
   Get-ChildItem "$env:LOCALAPPDATA\GymManagementSystem\db"
   ```

   Expect: `gym.db`, `gym.db-wal`, `gym.db-shm`.

5. **Data in `%LOCALAPPDATA%\GymManagementSystem`, not install folder; persists across restarts.**
   Check `%LOCALAPPDATA%\GymManagementSystem\{db,uploads,backups,logs,config}` exist. Close app fully, relaunch, confirm the same `gym.db` is reused (check `main.log` for a second `migrations applied` only on first run; second run should be silent) and nothing new appears in the install directory.

6. **Sample migration runs on upgrade with automatic pre-migration backup.**
   Covered in criterion 10 (upgrade). On first run, `backups/` may be empty; a backup is created only when an already-versioned DB meets a *new* migration. Verify by upgrading v0.0.1 → v0.0.2 (criterion 10) and checking `backups\pre-migration-*.db` exists.

7. **Single-instance lock.**
   Launch the app twice (double-click shortcut twice fast). Expect: second launch focuses the existing window, no second backend port in `main.log`.

8. **Closing window stops backend; no orphans.**
   Close the app window. Then:

   ```powershell
   Get-Process | Where-Object { $_.Name -match 'gym-management|GymManagement' }
   tasklist | findstr /i node
   ```

   Expect: no leftover processes. Also force-kill via Task Manager (End task on the window process), relaunch, and confirm no orphaned `node` from the previous session.

9. **Works with networking disabled; no outbound requests at startup.**
   Disable the VM's NIC (or unplug). Relaunch app. Expect: app starts, window loads, `main.log` shows `backend healthy`. Optional stronger check: run Wireshark/Fiddler while launching and confirm zero outbound SYN packets.

10. **Install path with spaces works.**
    Reinstall choosing a custom install path containing spaces (e.g. `C:\Program Files\Gym Test App`), launch, confirm healthy.

11. **Upgrade v0.0.1 → v0.0.2 keeps data.**
    Bump `version` in `package.json` to `0.0.2`, rebuild installer (section A), run it over the existing install. Launch. Expect: `main.log` shows migrations were checked (0 pending), data intact (same gym name "Empire Fitness" on screen), and if you also add a dummy migration it runs with a `pre-migration-...-0.0.1-to-0.0.2` backup. For Phase 0 evidence, the no-op upgrade plus presence of data after reinstall is sufficient; the migration-backup path was unit-tested on Linux (`tests/migrate.test.ts`).

12. **Uninstall keeps data by default.**
    Uninstall via Settings → Apps → GymManagementSystem. After uninstall: `%LOCALAPPDATA%\GymManagementSystem` still exists with the DB. Reinstall, relaunch, data intact.

13. **Sizes and timings recorded.**
    Record: installer file size; install duration (start of setup → finish); first-launch time (double-click → window painted); second-launch time. Paste numbers into the table below.

14. **Security settings verified in packaged build.**
    In the running app: `Ctrl+Shift+I` must do nothing (DevTools disabled in production). `View Source` / right-click Inspect must do nothing. No remote URLs load (app only ever talks to 127.0.0.1). Fuses already verified on the exe (RunAsNode disabled, NODE_OPTIONS disabled, onlyLoadAppFromAsar, ASAR integrity on) — re-run on your Windows build:

    ```powershell
    npx @electron/fuses read --app dist\win-unpacked\GymManagementSystem.exe
    ```

## C. Recording table

| # | Criterion | Pass/Fail | Evidence (paste output, screenshot path, or numbers) |
|---|---|---|---|
| 1 | Installer/shortcuts/window | | |
| 2 | 127.0.0.1 only, free port, no firewall rule | | |
| 3 | No token → 401 | | |
| 4 | better-sqlite3 + WAL + FK | | |
| 5 | %LOCALAPPDATA% data, persists | | |
| 6 | Pre-migration backup on upgrade | | |
| 7 | Single instance | | |
| 8 | Clean shutdown, no orphans | | |
| 9 | Offline / no outbound | | |
| 10 | Path with spaces | | |
| 11 | Upgrade keeps data | | |
| 12 | Uninstall keeps data | | |
| 13 | Size/time numbers | | |
| 14 | Security settings in prod build | | |

Installer SHA-256: _______________________
SmartScreen / Defender notes: _______________________
