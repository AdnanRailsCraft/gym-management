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
- **Phase 2 — Clients & memberships (plans, subscriptions, lifecycle):**
  - Migration `db/migrations/0004_memberships.sql`: `membership_plans` (seeded Daily/Weekly/Monthly/Quarterly/Half-Yearly/Annual starter templates — all editable), `memberships` (subscriptions with `lifecycle_status`, integer-minor-unit pricing, optional idempotency key), `membership_freezes`; rebuilds `members` as profile-only (member status `active|inactive|suspended|archived`) and backfills one membership per legacy member row so pre-0004 dev data survives.
  - Pure date/membership-state engine (`src/lib/dates.ts`): inclusive end dates, calendar-month clamping (31 Jan + 1 month → 27 Feb), day plans (`N − 1`), renewal start rules, and the computed state ladder (cancelled/suspended → frozen → scheduled → expired → expiring soon → active) per DESIGN B5. Expiry is never a stored column.
  - Membership lifecycle service (`src/server/members/memberships.ts`): sell, renew (new row — history preserved), extend (mandatory reason), freeze/unfreeze (plan freeze rules + max days; frozen days push the end date out and are trimmed when a freeze ends early), suspend/reactivate, cancel — each in one transaction with an audit entry; no hard deletes.
  - Plans management (`/plans`) and client detail (`/members/[id]`) screens; the client list shows the computed membership state with filters by member status, membership state, and plan.
  - Duplicate-client warnings on registration (phone, email, or exact name) and member numbers derived from the highest existing `EF-####`.
  - Migration `db/migrations/0005_member_profile_fields.sql`: optional registration fields from REQUIREMENTS 10.1 — referral source, fitness goals, and marketing consent. Injury/health notes and member photos are intentionally deferred (they need restricted-access consent handling and attachment storage).
  - All amounts are integer minor units; `src/lib/money.ts` is the only conversion point for display/input.
  - Phase 2 tests: date math, 0004 backfill, member CRUD/archive/duplicates, membership sell/renew/freeze/extend/suspend/cancel, idempotency and overlap rejection (93 tests total, all passing).
- **Restricted health notes (REQUIREMENTS 10.1):**
  - Migration `db/migrations/0006_member_health.sql`: adds `health_notes` and `health_consent` to `members`.
  - Health notes are visible and editable only with `members.view_health` (Owner and Manager by default); the client detail screen shows a privacy warning and a consent checkbox, and every change is audited as `member.health.update`.
  - Health columns are excluded from list payloads (`MemberListRow`) and from CSV export so they never reach a client that lacks the permission.
- **Attendance and check-in (REQUIREMENTS 12, Phase 3 start):**
  - Migration `db/migrations/0007_attendance.sql`: `attendance` table (member, check-in/out timestamps, method, allowed/overridden status, override reason, staff user).
  - `/attendance` screen: check-in form plus today's check-ins, gated by `attendance.view` / `attendance.record`.
  - Check-in rules: archived or suspended members are denied; expired or frozen memberships and repeat check-ins inside the configurable duplicate window (`duplicate_checkin_window_minutes`) are denied unless a user with `attendance.override` supplies a mandatory reason. Allowed and overridden check-ins are audited.
- **CSV export of the client list (REQUIREMENTS 10, Phases 4):**
  - `GET /api/members/export` returns a UTF-8 CSV of authorized member fields, gated by `members.export` (Owner only by default). Health notes are never exported.
- **UI and Usability Overhaul:**
  - Zero-dependency desktop SVG icon set (`src/components/icons.tsx`) providing consistent visual cues across all views.
  - Modern design system (`src/app/globals.css`): refined slate palette, soft card elevations, styled tables with uppercase headers, responsive layouts, active focus rings, and glassmorphism modal overlays.
  - Desktop Navigation Shell: dark app bar with Empire Fitness branding, "Offline Ready" status indicator, navigation icons with live expiring membership badge counters, user avatar chip with role badge, and styled sign-out button.
  - Front Desk Quick Actions: Dashboard action strip for 1-click check-in, client registration, renewals due, and plan management.
  - Clients & Members list: 1-click status filter pills with counts (All, Active, Expiring Soon, Expired, Archived), enhanced search input with instant clear button, client initials avatars, and multi-section registration/edit modal.
  - Attendance & Fast Check-In: high-efficiency front-desk flow with prominent search, immediate color-coded access validation cards (Green "Access Granted" vs Red "Expired / Denied"), Enter-key check-in, and today's check-in timeline.
  - Expiry Reminders: tabbed filtering with counts, 1-click WhatsApp reminder with prefilled polite text, and streamlined logging modal.
  - Client Profile & Plans: modern profile card with avatar, contact badges, subscription history table, and polished plan creation/editing modals.

- **Invoices, billing and receipts (REQUIREMENTS 13):**
  - Migration `db/migrations/0009_invoices.sql`: `invoices` (sequential number from the receipt prefix, status, integer-minor totals, due date, notes) and `invoice_items`.
  - `/invoices` screen: financial KPIs (invoiced / collected / outstanding / count), status tabs, search, invoice creation with line items and an optional payment, printable receipt view, and copy/WhatsApp/SMS sharing. Client detail shows that client's billing history.
  - Migration `db/migrations/0010_invoice_payments.sql`: append-only `invoice_payments` ledger. Paid amounts, balances, statuses and revenue reports are derived from the ledger on every read; the old `amount_paid_minor` column is kept only as a cache. Backfills pre-ledger payments.
  - Voiding an invoice is an audited reversal, never a delete: each open payment gets a linked negative ledger row (`payment.reversal`) and the invoice moves to `voided`. Paid-total and over-discount submissions are rejected.
  - Invoice creation accepts an idempotency key, so a double-click or retried request returns the original invoice instead of creating a duplicate.

- **Non-technical usability pass:**
  - Dashboard hero now uses the bundled gym photo and brand mark (all local assets — nothing is fetched online), plus a welcome card that explains everything is stored on this computer.
  - Irreversible actions (void invoice, archive client) use in-app confirmation dialogs that say in plain language what will happen and what is kept, and collect a reason.
  - Every client, membership, invoice and reminder action now shows a success message afterwards (for example "Client registered successfully. You can now sell them a plan.") instead of silently reloading.
  - Duplicate plan names return a friendly message ("A membership plan named … already exists.") instead of a raw SQLite constraint error.
  - All dialogs are keyboard and screen-reader friendly: `role="dialog"`, `aria-modal`, a labelled heading, Escape to close, and focus restored when closed.
  - The printable receipt footer falls back to the configured gym name instead of a hard-coded brand.

### Security
- Developer tools are disabled in packaged builds. `src/server/dev/*` actions (create owner, quick-login, reset password, wipe users) refuse to run unless `GMS_ENABLE_DEV_MENU=1` or the app is running in development; the floating Dev Menu and `/dev` console are hidden in production, and Electron no longer shows the Developer menu or allows DevTools in a packaged build.
- Electron hands only allowlisted external links (`https://wa.me/`, `https://api.whatsapp.com/`, `sms:`, `tel:`, `mailto:`) to the operating system; every other navigation and new window stays blocked.


### Changed
- Technology stack changed from Ruby on Rails to **Electron + Next.js (TypeScript)** with SQLite. Requirements, design, development, packaging, security, and agent-prompt documents updated accordingly.
- `docs/PACKAGING.md` §10 findings log records Phase 0 prototype results (Linux host: packaged app verified end-to-end; Windows NSIS build requires a Windows host).
- `.gitignore` added; `node_modules/` and obsolete Phase 0 starter files untracked from git.
- Extracted shared `gymSettingsSchema` and `emptyToNull` helper into `src/server/gym-form.ts` (deduplicates setup wizard and gym settings form logic).
- Rebuilt the client list, client detail, plans, and dashboard screens on the shared light CSS design system (`.page`, `.kpi`, `.section`, `.chip`) and moved member/membership mutations behind permission-checked, Zod-validated server actions with audit entries.

### Fixed
- Electron: `window.prompt()` is not supported in Electron, so "Void invoice" and "Archive client" silently did nothing in the packaged app — both now use in-app confirmation dialogs.
- `scripts/db-migrate.ts`: top-level `await` broke under CJS/tsx — wrapped in `async function main()`.
- `src/proxy.ts`: `/api/health` was session-gated (Electron main health probe has no session cookie) — exempted; `/login` with valid session still redirects to `/`.
- `src/proxy.ts`: `/api/` and `/_next/` were both session-gated — assets for `/login` and `/setup` got 401 and the app shell never hydrated. `/_next/*` now skips the session gate entirely; `/api/*` still requires the token.
- `src/server/users/service.ts`: last active owner can now be deactivated via `setUserActive` or role-stripped via `updateUserRoles` — both now guard against removing the final owner (prevents reopening the `/setup` wizard).
- `src/server/users/service.ts`: `updateGymSettings` is now atomic (settings update + audit write in one transaction).
- `src/server/auth/login.ts`: failed-login counters (`failed_login_count`, `locked_until`) are now cleared on the disabled-user path (correct password on a disabled account).
- `electron/main.ts`: will-navigate allowlist used a prefix match (`navUrl.startsWith(url)`) that blocked same-origin asset navigations — now compares origin properly.
- `electron/main.ts`: `before-quit` now waits up to 2 s for the backend utility process to exit before quitting (reduces SQLite WAL teardown risk on Windows).
- `src/app/(app)/settings/users/actions.ts`: `requireUser()` called twice in each action — now returns the user from a single guard call.
- `src/app/setup/actions.ts`: double audit (`user.create` + `setup.completed`) removed — `completeSetup` already writes `setup.completed`.
- Deleted unused `createUserPasswordHash` export in `src/server/auth/login.ts`.
- Removed unused `drizzle-orm` dependency.
- Fixed repo-wide lint failures so `npm run lint` passes: unused `ownerExists` import in `src/proxy.ts`, unused `redirect` imports in `src/app/login/page.tsx` and `src/app/setup/page.tsx`, and an unused dev-admin username in `src/server/dev/actions.ts`; excluded the one-off `test-electron.js` probe from lint.
- Removed the members server actions' `as any` casts (now Zod-validated), which were the source of two `no-explicit-any` errors.

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
