# Changelog

All user-visible changes are recorded here, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/) and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Merged product requirements specification (`docs/REQUIREMENTS.md`).
- Design document, installation guide, user guide, backup/restore guide, development guide, packaging guide, release checklist, security policy, and known-limitations document.
- Phase 0 packaging prototype: Electron host (per-launch token, single-instance, CSP, utilityProcess backend), Next.js app shell with launch-token gate (proxy + layout + health route), SQLite bootstrap with WAL/foreign keys, migration runner with pre-migration backups, first migration seeding settings (gym name, address, currency), bundled branding assets, dependency inventory, packaging findings log.
- Dependency inventory (`docs/DEPENDENCY_INVENTORY.md`).
- **Phase 1 — Foundation (auth, RBAC, sessions, first-run wizard, settings, audit log):**
  - Migration `db/migrations/0002_phase1_foundation.sql`: `users`, `roles`, `permissions`, `role_permissions`, `user_roles`, `user_sessions`, `gym_settings` (migrates Phase 0 `settings` rows, then drops `settings`), `audit_logs` (append-only via triggers), `idempotency_keys`; seeds 6 roles and 39 permission keys with per-role grants.
  - Password hashing: Node `crypto.scrypt` (N=32768, r=8, p=1, KEYLEN=64), format `scrypt$N$r$p$salt$hash`; dummy-hash path for unknown users.
  - Sessions: `gms_session` HttpOnly SameSite=Strict cookie, SHA-256-hashed tokens in DB, sliding idle expiry (default 480 min), revoke on logout/deactivate/password-reset.
  - Login with lockout (5 consecutive failures → 15 min), case-insensitive usernames, audit entries for `user.login` / `user.login_failed`.
  - First-run setup wizard (`/setup`): forced until an owner-role user exists; creates owner + typed `gym_settings` + `setup.completed` audit in one transaction; auto-signs owner in.
  - RBAC: 39 permission keys as single source of truth in `permissions.ts` (mirrored by SQL seed; drift fails tests); `authorize`/`can` with 403 `PolicyError`; nav filtered by permission.
  - Settings screens: gym settings (audited field diffs) and users management (create / deactivate / reset password / role assignment — all audited; cannot deactivate own account).
  - Audit log viewer (`/audit`) — read-only, paginated, append-only table enforced in SQLite.
  - Proxy chain: launch token first, then session cookie; `/api/health` and pre-owner `/setup` stay session-free; `/api/*` 401 JSON vs browser redirect to `/login`.
  - Phase 1 tests: catalog-vs-DB seed drift, password round-trip, sessions, login lockout, authorize, setup, users service, audit immutability (58 tests total, all passing).

### Changed
- Technology stack changed from Ruby on Rails to **Electron + Next.js (TypeScript)** with SQLite. Requirements, design, development, packaging, security, and agent-prompt documents updated accordingly.
- `docs/PACKAGING.md` §10 findings log records Phase 0 prototype results (Linux host: packaged app verified end-to-end; Windows NSIS build requires a Windows host).
- `.gitignore` added; `node_modules/` and obsolete Phase 0 starter files untracked from git.

### Fixed
- `scripts/db-migrate.ts`: top-level `await` broke under CJS/tsx — wrapped in `async function main()`.
- `src/proxy.ts`: `/api/health` was session-gated (Electron main health probe has no session cookie) — exempted; `/login` with valid session still redirects to `/`.
- Setup page marked `force-dynamic` so Next does not static-render `ownerExists()` at build time.

### Notes
- Windows §7 clean-machine evidence still pending; installer unsigned per documented default. Windows installer cannot be built on this Linux host (no wine).

<!--
## [1.0.0] - YYYY-MM-DD
### Added
### Changed
### Fixed
### Security
### Database
- Migration notes and any manual steps.
-->
