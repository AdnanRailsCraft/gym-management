# Packaging Guide — Building the Windows Installer

> **Status:** this is the plan for the Phase 0 prototype. **No packaging approach has been proven yet.** Treat every method below as a *candidate to evaluate*, and do not describe the installer as self-contained until it passes the clean-machine tests in the [Release Checklist](RELEASE_CHECKLIST.md).

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

A valid code-signing certificate reduces (but may not immediately eliminate) SmartScreen warnings. If unsigned, document the warning, publish the checksum, and never advise disabling Windows security features.

## 8. Reproducibility

- Pin tool versions (Ruby, Rails, shell toolchain, installer builder) in a `TOOLCHAIN.md` or this file.
- Build only from tagged commits.
- Two builds from the same tag should produce functionally identical installers; record any known non-determinism (for example, embedded timestamps).

## 9. Versioning

Semantic versioning (`MAJOR.MINOR.PATCH`). The version appears in the installer filename, Help → About, diagnostics, backups' manifests, and `CHANGELOG.md`. A database schema version is tracked separately and checked at startup.

## 10. Prototype findings log

Record results here as Phase 0 progresses.

| Date | Approach | Result | Blockers / notes |
|---|---|---|---|
| | | | |
