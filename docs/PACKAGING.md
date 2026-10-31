# Packaging Guide — Building the Windows Installer (Electron + Next.js)

> **Status:** this is the plan for the Phase 0 prototype. **No packaging approach has been proven yet.** Treat every method below as a *candidate to evaluate*, and do not describe the installer as self-contained or offline-ready until it passes the clean-machine tests in the [Release Checklist](RELEASE_CHECKLIST.md).

## 1. Goal

Produce `GymManagementSystem-Setup-<version>.exe` that installs and runs on a clean Windows 10/11 64-bit PC with:

- no Node.js, database server, or browser installed by the user;
- no internet needed during or after install;
- user data stored **outside** the program directory;
- clean shutdown of every process it starts;
- upgrade and uninstall that preserve data.

## 2. What must be bundled

| Component | Notes |
|---|---|
| Electron runtime | Includes Chromium and Node.js; no WebView2 dependency |
| Electron main + preload code | Compiled, in `app.asar` |
| Next.js standalone server | Output of `next build` with `output: "standalone"`, plus `.next/static` and `public/` copied alongside it |
| `better-sqlite3` native binary | Built for the **Electron** ABI and unpacked from the archive |
| Business logic, schema, migrations | Included in the standalone build / resources |
| Fonts, icons, templates | All local; no runtime downloads |

## 3. Candidate approaches to evaluate in Phase 0

Record the findings for each in section 9.

**A. Standalone server run with `utilityProcess.fork` (preferred to try first).** The Electron main process forks the Next.js `server.js` from `resources/` as a utility process, passing the port, data directory, and per-launch token through environment variables. This works with Electron's hardening fuse that disables running Electron as plain Node.

**B. Standalone server run with `spawn(process.execPath, ["server.js"], { env: { ELECTRON_RUN_AS_NODE: "1", ... } })`.** Simple and widely used, but it **requires** Electron's "run as node" capability to stay enabled, which conflicts with hardening that disables it. Only choose B if the security trade-off is accepted and documented.

**C. Fallback: static export + IPC.** Replace the Next.js server with a statically exported React interface; run business logic in the main process (or a utility process) behind validated IPC. Removes the local web server entirely. Requires explicit approval (REQUIREMENTS section 2.3).

**D. Second fallback: a different technology** such as .NET + SQLite.

For each candidate check: native module loading in the packaged build, startup time, installer size, antivirus false positives, ease of reproducible builds, and whether a per-launch token can be enforced.

## 4. Key packaging details to get right

1. **Place the Next.js standalone folder in `resources/` via `extraResources`, not inside `app.asar`.** The server expects a normal filesystem layout.
2. **Unpack native modules.** Configure `asarUnpack` for `better-sqlite3` (the `.node` binary).
3. **Rebuild native modules for Electron** during packaging (`electron-builder install-app-deps` / `npmRebuild`), and verify the result by opening a database in the packaged app.
4. **Copy static assets.** The standalone output does not include `.next/static` or `public/`; copy them next to the server or the UI will be unstyled.
5. **Data directory is passed in**, never derived from the install folder. Default `%LOCALAPPDATA%\GymManagementSystem`.
6. **Free port + token.** Choose a free loopback port at startup; generate a random token each launch; the backend rejects requests without it.
7. **Disable telemetry** (`NEXT_TELEMETRY_DISABLED=1`) and confirm no network calls occur at startup (test with networking disabled and with a network monitor).
8. **Single instance** via Electron's single-instance lock; second launch focuses the first window.
9. **No auto-update by default.** If `electron-updater` or similar is added later, it must be opt-in and point only to a deliberately configured update source. Offline update packages remain supported.
10. **Production lockdown:** DevTools and remote debugging off; Electron fuses configured; CSP set.

## 5. Build pipeline (proposed)

On a Windows build machine:

1. **Clean checkout** of a release tag.
2. `npm ci` (exact locked dependencies).
3. `npm run typecheck && npm run lint && npm test`.
4. `next build` with standalone output; copy `.next/static` and `public/` into the standalone folder.
5. Compile the Electron main and preload code.
6. Run `electron-builder` with an NSIS target. Proposed settings: not one-click, per-user (`perMachine: false`), allow choosing the install directory, create Start Menu shortcut and optional desktop shortcut, **do not delete user data on uninstall by default**, offer an explicit data-removal option.
7. **Sign** the executables and installer if a code-signing certificate is available.
8. **Compute SHA-256** of the installer and write it to `dist/checksums.txt`.
9. **Generate the dependency/license inventory** and write build metadata (commit, date, Node/Electron/Next.js versions) to `dist/`.

Scripts for these steps live in `scripts/` and must be runnable by someone following this document.

## 6. Installer behavior to configure

- Product name, version, publisher, icon, and license screen.
- Default per-user install without elevation; an optional per-machine install requires elevation.
- Detect a running instance and ask the user to close it before upgrading.
- Never overwrite or remove the data directory during install or upgrade.
- Uninstaller removes binaries and shortcuts; asks whether to keep or delete data (default keep).
- Installer must not download anything.

## 7. Phase 0 exit criteria

All must be demonstrated on a **clean Windows VM and a real Windows laptop**, with no developer tools installed:

- [ ] Installer runs; shortcuts created; the app opens in its own window.
- [ ] The Next.js server binds to `127.0.0.1` only on an automatically chosen free port; no inbound firewall rule is created.
- [ ] Requests without the per-launch token are rejected.
- [ ] `better-sqlite3` loads in the **packaged** app; WAL mode and foreign keys are active.
- [ ] Data is written to `%LOCALAPPDATA%\GymManagementSystem`, not the install folder, and persists across restarts.
- [ ] A sample migration runs on upgrade with an automatic pre-migration backup.
- [ ] Single-instance lock works.
- [ ] Closing the window stops the backend; no orphan processes after exit or after a forced kill and relaunch.
- [ ] Works with networking disabled; no outbound requests at startup.
- [ ] Install path with spaces works.
- [ ] Upgrade from v0.0.1 to v0.0.2 keeps data.
- [ ] Uninstall keeps data by default and offers explicit removal.
- [ ] Installer size, install time, and first/second launch times are recorded.
- [ ] Electron security settings (context isolation, sandbox, no Node integration in renderer, CSP) verified in the packaged build.

If criteria cannot be met within reasonable effort, document the blockers and decide on a fallback (section 3, C or D).

## 8. Signing, SmartScreen, and antivirus

A valid code-signing certificate reduces (but may not immediately eliminate) SmartScreen warnings. If unsigned, document the warning, publish the checksum, and never advise disabling Windows security features. Test the installer against Windows Defender; unsigned Electron apps are sometimes flagged and any false positive must be documented.

## 9. Reproducibility and versioning

- Pin exact versions of Node.js, Electron, Next.js, `better-sqlite3`, and `electron-builder`; record them in the build metadata.
- Build only from tagged commits. Two builds from the same tag should be functionally identical; note any known non-determinism.
- Semantic versioning (`MAJOR.MINOR.PATCH`). The version appears in the installer filename, Help → About, diagnostics, backup manifests, and `CHANGELOG.md`. The database schema version is tracked separately and checked at startup.

## 10. Prototype findings log

| Date | Approach (A/B/C/D) | Result | Blockers / notes |
|---|---|---|---|
| 2026-10-16 | A (Next standalone + electron-builder, Node host) | Partial success | Full chain through `electron-builder --dir` works on Linux: packaged app boots under Xvfb, `utilityProcess.fork` runs `resources/app/server.js`, migrations apply at startup, launch-token gate returns 401 without token and 200 with Bearer/cookie. All 8 hardening fuses verified flipped via `@electron/fuses read`. **NSIS cross-build fails: `spawn wine ENOENT`** — electron-builder 26 has no wine auto-download; the Windows installer must be built on Windows (or a host with wine installed). `dist/win-unpacked/GymManagementSystem.exe` was produced (unsigned) and can be smoke-tested directly. §7 criteria remain unchecked pending clean-Windows evidence. |
| 2026-10-16 | A | Config gotcha fixed | `electron-builder`'s copy filter (`createFilter`) always drops a copy-root named `node_modules` from `extraResources`. Fix: declare `from: .next/standalone/node_modules` → `to: app/node_modules` as a second `extraResources` entry. |
| 2026-10-16 | A | Convention change | Next 16.4 deprecates `middleware.ts` in favour of `proxy.ts`: proxy always runs on Node.js runtime (no `runtime` key allowed), `config.matcher` still supported. The launch-token gate lives in `src/proxy.ts` and uses `node:crypto` timing-safe compare. |
| 2026-10-16 | A | Native module note | better-sqlite3 13 ships multi-platform prebuilds (`prebuilds/*.node`, prebuildify) and has no `bindings`/`file-uri-to-path` runtime deps. On Linux x64 the same prebuild loads under host Node 22 and Electron 44. Windows ABI match still to be verified on a Windows host. |
| 2026-10-16 | A | Installer UX gap | §6 uninstaller "keep or delete data" question is achievable via `nsis.include` (`build/installer.nsh` hook); not implemented yet. Current config keeps data (`deleteAppDataOnUninstall: false`), matching §7's default-keep requirement. |
