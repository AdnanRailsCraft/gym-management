# Packaging Guide — Building the Windows Installer

> **Status:** Phase 0 prototype built and CI-proven (see §10). Installer is unsigned; owner clean-machine smoke checklist (§10.3) must pass before Phase 1. Do not describe the installer as fully self-contained until that smoke plus the remaining §5 criteria pass.

## 1. Goal

Produce `GymManagementSystem-Setup-<version>.exe` that installs and runs on a clean Windows 10/11 64-bit PC with:

- no Ruby, Node.js, database server, or browser installed by the user;
- no internet needed during or after install;
- user data stored **outside** the program directory;
- clean shutdown of every process it starts;
- upgrade and uninstall that preserve data.

## 2. What must be bundled

| Component | Notes |
|---|---|
| Ruby runtime (Windows build) | Same major/minor version as `.ruby-version` |
| Application gems | Including native extensions compiled for Windows (for example, the SQLite gem) |
| Rails application code and precompiled assets | Assets compiled at build time, not on the user's machine |
| SQLite library | Usually included with the gem; verify |
| Desktop shell | Tauri (or alternative) executable with the web view runtime it needs |
| Launcher/lifecycle manager | Starts and supervises Rails; see REQUIREMENTS section 3 |
| Migrations | Run by the app at startup after an automatic backup |
| Fonts, icons, default templates | No downloads at runtime |

## 3. Candidate approaches to evaluate in Phase 0

Evaluate each against the exit criteria in section 5 and record the findings in this file.

1. **Tauri shell + bundled Ruby as a sidecar process.** Ruby and the app are copied into the install folder; the shell launches `ruby` with the Rails server bound to `127.0.0.1` on a free port and loads that URL in its window. The shell's own installer bundler (or a separate installer tool) creates the `.exe`.
2. **Another maintained desktop shell** (for example, Electron) running the same bundled Ruby sidecar, if the Tauri web-view behavior proves unsuitable.
3. **Fallback — native .NET + SQLite.** If neither approach is reliable, switch architectures. This requires explicit approval (REQUIREMENTS section 2.3).

Check for each: Windows web-view availability on Windows 10 (some installs may need the Edge WebView2 runtime bundled or installed by the installer), antivirus false positives, installer size, startup time, and ease of reproducible builds.

## 4. Build pipeline (proposed)

On a Windows build machine with the developer toolchain:

1. **Clean checkout** of a release tag.
2. **Install dependencies** from lockfiles: `bundle install --deployment`-style install for production gems only.
3. **Precompile assets** (`RAILS_ENV=production`).
4. **Stage the runtime:** copy the Ruby runtime and installed gems into `build/stage/ruby`, the app into `build/stage/app`.
5. **Remove** development/test gems, caches, and source maps from the stage.
6. **Build the shell** (`desktop/`) in release mode and place it in the stage.
7. **Generate the installer** with the chosen tool (shell bundler or an installer builder such as NSIS, WiX, or Inno Setup).
8. **Sign** the executables and installer if a code-signing certificate is available.
9. **Compute SHA-256** of the installer and write it to `dist/checksums.txt`.
10. **Record** the dependency/license inventory and build metadata (commit, date, tool versions) in `dist/`.

Scripts for these steps live in `scripts/` and must be runnable by someone following this document, not just the original author.

## 5. Phase 0 exit criteria

All must be demonstrated on a **clean Windows VM and a real Windows laptop**, with no developer tools installed:

- [ ] Installer runs; shortcuts created; app opens in its own window.
- [ ] Rails binds to `127.0.0.1` only; a free port is chosen automatically; no inbound firewall rule is created.
- [ ] Single-instance lock works; a second launch focuses the first.
- [ ] Data is written to `%PROGRAMDATA%\GymManagementSystem`, not the install folder.
- [ ] SQLite persists across restarts; WAL mode and foreign keys are active.
- [ ] A sample migration runs on upgrade, with an automatic pre-migration backup.
- [ ] Closing the window stops Rails; no orphan processes after exit or after a forced kill and relaunch.
- [ ] Works with networking disabled.
- [ ] Install path with spaces works.
- [ ] Upgrade from v0.0.1 to v0.0.2 keeps data.
- [ ] Uninstall keeps data by default and offers explicit removal.
- [ ] Installer size, install time, and first/second launch times recorded.

If criteria cannot be met within a reasonable effort, document the blockers and decide on the fallback.

## 6. Installer behavior to configure

- Product name, version, publisher, icon, and license screen.
- Default per-user install with no elevation; optional per-machine install requires elevation.
- Optional desktop shortcut; Start Menu shortcut always.
- Detect a running instance and ask the user to close it before upgrading.
- Never overwrite the data directory.
- Uninstaller: remove binaries and shortcuts; ask whether to keep or delete data (default keep).

## 7. Signing and SmartScreen

**Phase 0 decision (single owner-controlled gym PC):** self-signed code-signing cert + one-time local trust import. This removes the SmartScreen block **on that PC only**; the UAC prompt still shows the cert subject (`Gym Management System Local`) instead of "Unknown Publisher". Any other machine still sees the unsigned-app warning — expected while Phase 0 targets one machine.

Owner procedure on the gym PC (never on CI; PFX password stays in your env — `GMS_SIGN_PFX_PASSWORD` — never in git):

```powershell
# 1. once — create cert (password printed once; persist via setx)
.\scripts\windows\06-sign.ps1 -CreateCert

# 2. download GymManagementSystem-Setup-0.1.0.exe from the CI artifact, then:
.\scripts\windows\06-sign.ps1 -Files .\GymManagementSystem-Setup-0.1.0.exe

# 3. once, elevated shell — trust on this PC
.\scripts\windows\06-sign.ps1 -InstallTrust

# 4. confirm
Get-AuthenticodeSignature .\GymManagementSystem-Setup-0.1.0.exe | fl Status, StatusMessage
# expect Status = Valid; double-click → no SmartScreen block
```

Later phases (multi-machine distribution): replace with Azure Trusted Signing or a paid CA cert; do not ship the self-signed PFX or its trust step to third parties. A valid paid code-signing certificate reduces (but may not immediately eliminate) SmartScreen warnings until reputation builds. If unsigned, document the warning, publish the checksum, and never advise disabling Windows security features.

## 8. Reproducibility

- Pin tool versions (Ruby, Rails, shell toolchain, installer builder) in a `TOOLCHAIN.md` or this file.
- Build only from tagged commits.
- Two builds from the same tag should produce functionally identical installers; record any known non-determinism (for example, embedded timestamps).

## 9. Versioning

Semantic versioning (`MAJOR.MINOR.PATCH`). The version appears in the installer filename, Help → About, diagnostics, backups' manifests, and `CHANGELOG.md`. A database schema version is tracked separately and checked at startup.

## 10. Prototype findings log / Phase 0 report

**Status:** Phase 0 implementation complete; CI proven on `windows-latest`; owner clean-machine smoke pending (checklist below). **Gate: do not start Phase 1 until the owner reports the smoke checklist passed.**

### 10.1 What was chosen (council verdict + implementation)

| Area | Choice | Where |
|---|---|---|
| Shell | Tauri 2 (single WebView2 window owns Rails lifecycle) | `desktop/` |
| Data dir | `%PROGRAMDATA%\GymManagementSystem` (per-machine, installer elevates once; runtime never elevates) | shell `main.rs`, `config/environments/production.rb` |
| Installer | Inno Setup 6 (`x64compatible`, `{autopf}`) | `installer/gym-management.iss` |
| Build/verify | GitHub Actions `windows-latest` (owner smoke secondary) | `.github/workflows/windows.yml` |
| Pins | Ruby 3.4.10 (`.ruby-version` + CI hardcoded), Rails 8.1.3.1, Tauri CLI ^2.9 | Gemfile, workflow, `desktop/package.json` |
| Min OS | Windows 10 22H2 x64 (WebView2, x64 Ruby) | §33 |
| Money | Integer minor units, ledger; immutable payments + audited reversals | not yet implemented (Phase 1+) |

### 10.2 CI evidence (run `38217510947`, branch `main`, commit `e8945f0`)

| Job | Result | Evidence |
|---|---|---|
| `windows` | pass, 3m45s | 17/17 checks green (`phase0-report` artifact): ruby pin, frozen bundle + sqlite3 native load, assets:precompile, 6 tests / 15 assertions / 0 failures, prod server boots on free loopback port, `/up` 200, `/` JSON `wal`+`fk`+`schema_migrations:1`, listener only on `127.0.0.1`, no firewall rules, clean stop, no orphans, port closed, data-dir layout incl. `logs/production.log` |
| `desktop-shell` | pass, ~5m | release `gym-desktop.exe` built from `desktop/src-tauri`, asserted ≥1MB, uploaded (`gym-desktop-exe` artifact, 2.37MB) |
| `installer` | pass, 5m46s | 16/16 checks green: robocopy portable Ruby from `RbConfig::TOPDIR`, app code + portable `vendor/bundle` (deployment mode), desktop exe staged, layout contract complete, ISCC found, compile success, setup exe ≥5MB |

Installer artifact: `GymManagementSystem-Setup-0.1.0.exe`, ~46MB (`phase0-installer` artifact).

### 10.3 Owner GUI smoke checklist (clean Windows 10/11 x64 machine, no dev tools)

Run on a real machine; report PASS/FAIL per line:

1. [ ] Download `GymManagementSystem-Setup-0.1.0.exe` from the `phase0-installer` artifact; verify SHA-256 against the published checksum.
2. [ ] Double-click installer: UAC prompt once; installs under `C:\Program Files\Gym Management System`; Start Menu + optional desktop shortcut appear.
3. [ ] Launch app: one window opens showing the gym UI (window navigated to `http://127.0.0.1:<free port>/`); no browser opens.
4. [ ] `%PROGRAMDATA%\GymManagementSystem` contains `db/gms.sqlite3`, `logs/production.log`, `logs/launcher.log`, secret key file.
5. [ ] `netstat -ano | findstr LISTENING` shows the Rails port bound to `127.0.0.1` only (never `0.0.0.0`); Windows Firewall shows no new inbound rule.
6. [ ] Launch a second instance: no second Rails starts; first window is focused.
7. [ ] Close the window: `ruby.exe` / `puma` processes are gone (no orphans in Task Manager).
8. [ ] Relaunch: data persists (write rows via §11.7 scratch table — Phase 0 has no UI tables); startup works with networking disabled (airplane mode).
9. [ ] Kill the app via Task Manager → Relaunch: Rails restarts cleanly, data intact.
10. [ ] Uninstall via Settings → Apps: binaries removed; `%PROGRAMDATA%\GymManagementSystem` **still present** (data preserved by default).
11. [ ] Install into a path with spaces (default already has one); still boots.
12. [ ] Record: installer size (~46MB), install time, first-launch time, second-launch time.

Phase 0 exit-criteria items **not yet applicable** (deferred, no feature exists yet): sample migration on upgrade with pre-migration backup; v0.0.1→v0.0.2 upgrade; explicit "delete data?" uninstall prompt. These become Phase 1+ acceptance tests.

### 10.4 Unverified / known gaps (honesty list)

- **.ps1 scripts never executed on a local Windows box by the author** — all proof is CI (`windows-latest`); local Linux host lacks pwsh/Windows. Scripts are PS 5.1 + pwsh compatible by construction only.
- **Tauri window navigation to loopback URL** verified only to the extent that the shell builds and the health poll logic is sound; the actual WebView2 navigation behavior needs owner GUI smoke (step 3).
- **Ruby runtime staged wholesale** from `RbConfig::TOPDIR` (includes headers/docs); no size slimming yet. Expected later phase: trim to runtime-only files.
- **Installer default is unsigned in CI artifacts**: SmartScreen will warn on any PC that has not run the §7 local-trust procedure. Publish SHA-256; never advise disabling security features (§7). Owner gym PC: run `06-sign.ps1 -CreateCert` → sign → `-InstallTrust` to clear the block on that machine only.
- **Upgrade path** (detect running instance, data-preserving upgrade) not implemented.
- Node20 deprecation annotation from `actions/upload-artifact@v5` is warning-only; not investigated.
- `frontendDist` points at committed `desktop/dist-web-src` (static HTML); no frontend build step exists yet by design.

### 10.5 Findings / deviations from original plan

| Date | Finding | Action |
|---|---|---|
| 2026-10-12 | `rails server` defaults to binding `0.0.0.0` outside development | Pinned `ENV["BINDING"] ||= "127.0.0.1"` in `config/boot.rb`; puma.rb also pins `127.0.0.1` |
| 2026-10-12 | `config.log_path` is not a real Rails setting (silent no-op) | Production logs written via `ActiveSupport::Logger` into `%PROGRAMDATA%\...\logs\production.log` |
| 2026-10-12 | Zero migrations ⇒ `db:prepare` creates empty DB, no `schema_migrations` table ⇒ 503 on `/` | Added baseline migration + `db/schema.rb`; `05-server-smoke` asserts `production_db_prepare` |
| 2026-10-12 | `Gemfile.lock` lacked `x64-mingw-ucrt` platform ⇒ Windows bundle fail | `bundle lock --add-platform x64-mingw-ucrt` |
| 2026-10-12 | `ruby/setup-ruby` rejects `ruby-version-file` for this usage | Hardcoded `ruby-version: '3.4.10'` in workflow; 01-deps checks drift vs `.ruby-version` |
| 2026-10-12 | `dangerousUseHttpScheme` not in Tauri 2 config schema | Removed; loopback `http://` external URL works without it |
| 2026-10-12 | `tauri-build` requires `icons/icon.ico` on Windows even with `bundle.active: false` | Committed placeholder 32×32 ICO (replace before real release) |
| 2026-10-12 | `WebviewUrl` has no `FromStr` in Tauri 2; `AppHandle` move/borrow errors in `run_on_main_thread` closures | `url` crate + `WebviewUrl::External(Url)`; `post_main` helper clones handle |
| 2026-10-12 | PowerShell scripts share one `checks.jsonl`; baseline captured at dot-source so each script exits on its own failures only | `lib.ps1` `$script:GmsBaselineFailures` pattern |
| 2026-10-12 | Setup exe filename aligned with §1 goal: `GymManagementSystem-Setup-0.1.0.exe` | `.iss` + `04-installer.ps1` assert + CI artifact glob |
| 2026-10-12 | SmartScreen cannot be silenced by code; owner has one controlled gym PC | Self-signed cert + LocalMachine\Root trust (`06-sign.ps1`, §7). Multi-machine → Azure Trusted Signing/CA cert in a later phase. PFX never committed |

### 10.6 Decision

Phase 0 pipeline (dev box → CI → installer artifact) is proven end-to-end on Windows CI. Remaining risk is concentrated in the **owner GUI smoke** (§10.3) run under the **§11 Test Gate** (evidence-per-claim, artifacts required, named owner signs). **Phase 1 must not start until the §11 gate passes**; if a gate item fails, fix in Phase 0 and re-run CI before any feature work.

---

## 11. Phase 0 Test Gate (council-validated)

Council (5 advisors + 5 peer reviewers + chairman, 2026-10-12) verdict: gate = **evidence-per-claim on the actual gym PC**, not check-count. CI proves the code; only the gym PC proves the environment. Single test machine exists — no clone — so order operations to protect data: non-destructive tests first, destructive tests only after an off-machine copy of the data dir exists.

### 11.1 Scope statement (verbatim, must appear in the pass doc)

> Phase 0 = install, run, persist, survive kill, offline, loopback-only, uninstall-keeps-data. Install-only: no upgrade claim — upgrade path deferred to Phase 1. Passing Phase 0 does not mean safe-to-upgrade.

### 11.2 Gate criteria (all seven required)

1. **Install on the gym PC.** Record: Windows build, AV product, username (ASCII or not). Verify installed installer SHA-256 matches the CI artifact checksum (provenance).
2. **12-item smoke (§10.3), each with an artifact** — screenshot, saved command output, or timestamped log. No artifact = not passed.
3. **Off-machine data copy** (this is also the ongoing backup): copy `%PROGRAMDATA%\GymManagementSystem` to external drive/cloud before any destructive test.
4. **Three data-survival tests, in this order, after item 3:**
   - (a) Write rows (§11.7) → Task Manager kill process tree mid-save → relaunch → count in §11.7 query shows every row, WAL recovered.
   - (b) Write rows (§11.7) → hard reboot (or pull power) mid-save → relaunch → `PRAGMA integrity_check` = `ok` via §11.7 query, row count intact.
   - (c) Restore from the off-machine copy into a wiped data dir → app boots with data (§11.7 count matches).
5. **Loud-failure checks:** occupy the loopback port before launch (`netstat`) → visible error window, not blank WebView; interrupt the installer mid-way (kill setup.exe) → no broken hybrid left behind, clean re-install possible.
6. **One week of real gym usage**, fixed duration, zero data incidents (WAL files present, no corruption messages in `production.log`).
7. **Named owner signs the "Phase 0 Passed" doc** (date + name). Artifacts retained alongside the doc.

### 11.3 Failure rules (agreed before testing, not after)

- Any gate-criteria failure = **block**. Owner decides fix-now vs. defer-explicitly in writing; default is fix in Phase 0.
- After any fix: re-run **full** smoke (§10.3) + the three data-survival tests. No partial re-runs.
- Threshold: all 12 smoke items + all gate criteria must pass. 11/12 is not a pass.

### 11.4 Explicitly out of scope for Phase 0

- Upgrade round-trip (v0.0.1→v0.0.2) — Phase 1.
- Multi-user, multi-machine, second gym location.
- SmartScreen polish beyond §7 local trust on this one PC.
- Cert expiry, Windows Update resetting trust store — document recovery in §7 if hit.
- Re-verifying CI (already green; trust it until a change lands).

### 11.5 Cheap add recommended for Phase 1 (not a Phase 0 gate item)

Launch-time `PRAGMA integrity_check` with an owner-facing error message — converts silent corruption into a visible error at open. Also: Tauri→Rails handoff failure UX (port conflict / missing Ruby currently risks a blank window; council flagged as worst failure mode for a non-technical owner).

### 11.6 Evidence checklist template

| # | Item | Artifact | Pass/Fail | Date |
|---|---|---|---|---|
| 1 | Windows build / AV / username recorded | note file | | |
| 2 | Installer SHA-256 matches CI | checksum text | | |
| 3 | Smoke items 1–12 | 12 artifacts | | |
| 4 | Off-machine data copy exists | copy confirmation | | |
| 5a | Kill mid-save → rows intact | screenshot + query | | |
| 5b | Hard reboot → integrity_check clean | sqlite output | | |
| 5c | Restore from copy → boots with data | screenshot | | |
| 6 | Port-occupied → loud error | screenshot | | |
| 7 | Interrupted install → clean re-install | note + second install | | |
| 8 | One week usage, zero incidents | dated log | | |
| 9 | Owner signature | pass doc | | |

### 11.7 Gate data commands (commands verified: local prod env returns `count=1`, `integrity=ok`)

Phase 0 has **no tables** (baseline migration is empty) — row tests use a scratch table via raw SQL (never via migrations; `schema.rb` untouched). All commands from elevated cmd, app stopped (close window first) unless a step says otherwise:

```bat
cd /d "C:\Program Files\Gym Management System\app"
set RAILS_ENV=production
set GMS_DATA_DIR=%PROGRAMDATA%\GymManagementSystem

:: write 3 rows (pre-kill / pre-reboot)
..\ruby\bin\ruby.exe bin\rails runner "ActiveRecord::Base.connection.execute(%q{CREATE TABLE IF NOT EXISTS phase0_smoke (id INTEGER PRIMARY KEY AUTOINCREMENT, note TEXT, created_at TEXT)}); 3.times { |i| ActiveRecord::Base.connection.execute(%q{INSERT INTO phase0_smoke (note, created_at) VALUES ('row} + i.to_s + %q{', datetime('now'))}) }; puts 'count=' + ActiveRecord::Base.connection.select_value(%q{SELECT count(*) FROM phase0_smoke}).to_s"

:: after relaunch: verify count + integrity (expect count=3+, integrity=ok)
..\ruby\bin\ruby.exe bin\rails runner "puts 'count=' + ActiveRecord::Base.connection.select_value(%q{SELECT count(*) FROM phase0_smoke}).to_s; puts 'integrity=' + ActiveRecord::Base.connection.select_value(%q{PRAGMA integrity_check}).to_s"

:: after gate passed: drop the scratch table
..\ruby\bin\ruby.exe bin\rails runner "ActiveRecord::Base.connection.execute(%q{DROP TABLE IF EXISTS phase0_smoke}); puts 'dropped'"
```

Notes: `sqlite3.exe` CLI is **not** in the portable install — rails runner only. Production env requires `GMS_DATA_DIR` or the runner silently targets the wrong path. App must be stopped for restore (step 5c) — close the window, confirm no `ruby.exe` in Task Manager first.

---

Record additional results here as Phase 0 progresses.

| Date | Approach | Result | Blockers / notes |
|---|---|---|---|
| 2026-10-12 | Tauri 2 + Inno 6 + RubyInstaller portable + GitHub Actions windows-latest | CI green (all 3 jobs); installer artifact ~46MB | Owner smoke pending; see §10.3 |
