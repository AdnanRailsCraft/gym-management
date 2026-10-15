# Gym Management System — Merged Product Requirements & Windows Installer Specification

**Document type:** Product Requirements Document (PRD) + Functional Specification + Technical Implementation Plan
**Product:** Gym Management System (GMS)
**Version:** 1.0 (merged baseline)
**Primary platform:** Windows 10/11 (64-bit) desktop and laptop
**Delivery format:** Installable Windows `.exe` installer (`GymManagementSystem-Setup-1.0.0.exe`)
**Recommended stack:** Electron + Next.js (TypeScript) + SQLite (single-PC edition)
**Status:** Initial baseline. Confirm optional scope (section 33) before implementation.

---

## 1. Project goal

Build a reliable, professional desktop application for managing the daily operations of one gym. It must install on a Windows laptop through a standard `.exe` installer and run as a desktop program, not as a website opened in an ordinary browser.

The system supports gym owners and authorized staff in managing members, memberships, attendance, payments, expenses, trainers, workout plans, reports, and backups.

### 1.1 Primary goals

- Make member registration and lookup fast.
- Track memberships, expiry dates, renewals, and freezes.
- Record attendance and prevent invalid check-ins.
- Track collected fees, unpaid balances, receipts, and expenses on a trustworthy ledger.
- Provide daily cash closing and clear daily/monthly reports.
- Support different staff roles with server-enforced permissions.
- Protect data against accidental deletion and computer failure.
- Install, upgrade, and uninstall cleanly on supported Windows computers.
- Allow offline use for all core gym operations.
- Preserve all data across upgrades.

### 1.2 Out of scope for version 1

Unless explicitly added later, version 1 does not include:

- Native Android or iOS apps, or a member-facing mobile app.
- Mandatory cloud accounts or subscriptions.
- Online payment processing.
- Biometric devices or turnstile hardware.
- Multi-branch synchronization.
- AI coaching or medical diagnosis.
- Automatic bank reconciliation.
- Multiple PCs writing to the same live database (see section 2.4).

The design should leave room for these to be added later.

---

## 2. Architecture and packaging

### 2.1 Required end-user experience

After running the installer, a user must be able to:

1. Double-click the installer, accept the license, and optionally choose an install location.
2. Install without manually installing Node.js, a database server, or a browser (the runtime is bundled inside the application).
3. Launch the app from the Start Menu or an optional desktop shortcut.
4. Complete a first-run wizard and create the owner account.
5. Use all core features without internet access.
6. Close and reopen the app without losing data.
7. Update to a newer version without losing members, payments, or settings.
8. Back up and restore data from inside the app.

The user must never need Command Prompt, PowerShell, npm commands, or environment variables, and must not need to know what a database or server is.

### 2.2 Recommended architecture

An **Electron desktop application that runs a Next.js server locally**. Electron provides the window and the Windows integration; Next.js (React, TypeScript) provides the user interface and the server-side logic; SQLite stores the data.

| Layer | Choice |
|---|---|
| Desktop shell | Electron. The main process owns the window, the single-instance lock, the application lifecycle, printing, native file dialogs, and supervision of the backend process |
| Web framework | Next.js (App Router, TypeScript), built with `output: "standalone"` so the production server is self-contained |
| Runtime | Electron's own bundled Node.js runs the Next.js server as a managed child process. No separate Node.js installation is needed |
| Database | **SQLite** through `better-sqlite3` (a native module rebuilt for the bundled Electron version), behind a typed query layer (Drizzle ORM proposed) |
| Validation | Zod (or equivalent) for every server-side input |
| Frontend | React inside Next.js; desktop-first; all fonts, icons, and assets bundled locally |
| Installer | Windows NSIS `.exe` produced by `electron-builder` (per-user install by default) |
| Networking | The Next.js server binds to loopback (`127.0.0.1`) only, on an available port, and requires a per-launch secret token (see below) |

**Process model.**

- **Electron main process:** window, lifecycle, single-instance lock, printing/PDF, file dialogs, backend supervision. It never contains business logic.
- **Backend process (Next.js server):** the **only** process that opens the SQLite database during normal operation. It hosts all business rules, authorization, the scheduler, and the backup service.
- **Renderer (browser window):** displays the UI. Context isolation on, Node integration off, sandboxed. It talks to the backend over loopback HTTP and to the main process only through a small, validated preload API.
- Business logic lives in a framework-independent `src/server` layer (services, policies, database access) that route handlers and server actions call. It must be testable without Electron or a browser.
- Restore and any operation that replaces the database file is coordinated by the main process: stop the backend, replace files, restart the backend.

**Loopback protection.** Binding to `127.0.0.1` keeps other computers out, but other programs and browser tabs on the same PC could still reach the port. Therefore every launch generates a random secret token. The backend rejects any request that lacks it, and the Electron main process attaches it only to requests from its own window. Session cookies are `HttpOnly` and `SameSite=Strict`. This is defense in depth; it does not defend against a user with administrator control of the PC (see section 23).

**Electron security requirements.**

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity` left enabled.
- Strict Content Security Policy; no remote scripts, styles, fonts, or images. The app must not load anything from the internet.
- Block navigation away from the app origin and block new windows; open external links only through an explicit, allow-listed handler.
- The preload script exposes only narrow, named functions; every IPC message is validated in the main process. No generic "run command" or "read any file" channel.
- Use Electron's fuses/hardening options to disable unneeded features (for example, running as plain Node, remote debugging in production builds).
- Keep Electron and Next.js on maintained, patched versions; pin exact versions and review security advisories at every release.

**SQLite requirements.** Enable foreign-key enforcement and write-ahead logging (WAL), set a busy timeout, and use the SQLite online backup mechanism (or `VACUUM INTO`) for consistent backups. `better-sqlite3` transactions are synchronous: keep them short and never `await` inside one. Verify that required queries, transactions, and reports perform acceptably on a 10,000-member test dataset.

**Why SQLite is the default.** Bundling and managing a PostgreSQL cluster on a non-technical user's laptop adds heavy packaging risk (service installation, elevation, port conflicts, stale processes, engine upgrades). SQLite removes those risks for the intended single-PC deployment.

**Important feasibility notes.** Do not claim a fully self-contained, offline-ready installer until it has been demonstrated on a clean Windows machine. Known risks to prove in Phase 0:

- `better-sqlite3` must load inside the **packaged** app (correct Electron ABI, native binary unpacked from the archive).
- The Next.js standalone server must start from the packaged resources and find its static assets and traced dependencies.
- Next.js telemetry must be disabled, and nothing (fonts, images, analytics) may be fetched from the internet at build output or at run time.
- Do not rely on Next.js middleware alone for authentication or authorization; always authorize inside route handlers, server actions, and service functions.
- Installer size and startup time must be acceptable on a modest laptop.

### 2.3 Fallback architecture

If the Electron + Next.js prototype proves unreliable on supported Windows machines:

1. **First fallback:** keep Electron, but replace the Next.js server with a statically exported React interface. The business-logic layer then runs in the Electron main process (or a utility process), reached through validated IPC instead of local HTTP. This removes the local web server and its port.
2. **Second fallback:** a different desktop technology such as .NET with SQLite.

Either change is a technology change and requires explicit approval before implementation.

### 2.4 Multi-PC operation

The first release targets **one primary Windows PC**. If several staff PCs must use the same live data at the same time:

- Do **not** share a SQLite file over a network folder.
- Choose an explicit shared-server architecture (for example, a dedicated PC running the backend with a server database such as PostgreSQL), with authentication, firewall rules, and encrypted transport.
- Do not run independent local databases on each PC and expect them to stay in sync.

This decision must be made **before** implementation because it changes the database and deployment design.

### 2.5 Windows compatibility

- Support 64-bit Windows 10 and 11; document the exact minimum build, CPU, RAM, and disk space after testing.
- Verify on a clean Windows virtual machine and on a real Windows laptop.
- Support standard display scaling (100–150%) and common resolutions (1366×768 and 1920×1080).
- Normal daily use must not require administrator rights. Elevation, if needed, is limited to installation.
- Internet is never required for normal operation; it may be used only for optional updates or integrations.

---

## 3. Local service lifecycle

The desktop application manages its own local services safely.

### 3.1 On launch

1. Acquire a single-instance lock, or bring the existing window to the front.
2. Verify application files and configuration.
3. Open the SQLite database and check integrity and schema version.
4. If migrations are pending: take an automatic backup first, run migrations, and refuse to start against a partially migrated database.
5. Start the Next.js backend as a child process on a loopback-only address and an available port (choose another port if there is a collision), with a fresh per-launch secret token.
6. Wait for a health endpoint to report ready.
7. Open the desktop window.
8. On failure, show a recoverable error with access to logs and diagnostics.

### 3.2 On normal exit

1. Warn if a critical operation (payment, backup, restore, export) is still running.
2. Stop accepting new UI actions and finish or safely abort in-flight work.
3. Stop the backend (Next.js) process.
4. Release the single-instance lock.

### 3.3 After a crash or forced shutdown

- Detect stale locks and stale processes safely.
- **Never terminate unrelated Node.js, Electron, or database processes.** Only stop processes the application started and can identify as its own.
- Rely on SQLite's journal/WAL recovery; verify integrity on the next launch.
- Explain any recovery steps to the user in plain language.
- Repeated launches must never produce duplicate backends or corrupt the data directory.

### 3.4 Scheduled jobs

Scheduled work (expiry reminders, backup reminders, scheduled backups) must run inside the application's own scheduler and must not depend on a specific window being open at a specific moment. Jobs must be idempotent, record last-run time and errors, and **catch up after startup** if the application was closed when a job was due.

---

## 4. Installation, updates, and uninstallation

### 4.1 Installer requirements

- Product name, version, publisher, and application icon.
- License/terms screen if applicable.
- Install-path selection where appropriate; paths containing spaces must work.
- Disk-space check, clear progress, and clear error messages.
- Start Menu shortcut and optional desktop shortcut; optional launch after install.
- **All dependencies are bundled.** The installer must not download anything during installation.
- Prefer a per-user installation that does not require elevation; request elevation only when strictly necessary (for example, a per-machine install).
- Handle an already-running app during upgrade.
- Provide a repair/recovery path for an interrupted installation.
- Do not open inbound firewall ports in local-only mode.
- No bundled default production password.
- No hidden telemetry. Disclose and obtain consent for any optional diagnostics.
- Sign the installer and executables when a code-signing certificate is available. Without signing, Windows SmartScreen may show a warning; document this, and never instruct users to disable Windows Defender or bypass security warnings.
- Document installer integrity (checksum) and provenance.

### 4.2 Data location

- Store the database, uploaded files, logs, and backups in a separate writable directory such as `%LOCALAPPDATA%\GymManagementSystem` (single-user) or `%PROGRAMDATA%\GymManagementSystem` (per-machine), chosen according to the deployment model.
- Never keep the only copy of data inside the program installation directory or any directory an upgrade or uninstaller routinely deletes.

### 4.3 Updates

- Show the current version.
- Support a documented update process; offline update packages are acceptable. Online update checks only if an update server is deliberately configured. The core app must work without one.
- Verify package integrity and source.
- **Back up data before every schema migration.**
- Run migrations safely and provide a rollback/recovery strategy.
- Never replace the user's data directory during an application update.

### 4.4 Uninstall

- Remove application binaries and shortcuts and stop application-owned processes cleanly.
- **Preserve user data by default**, and state clearly where it is kept.
- Offer an explicit, clearly worded option to delete all data and backups.
- Reinstalling must be able to reconnect to retained data.
- Never delete unrelated files or services.

---

## 5. First-run setup wizard

The wizard collects:

- Gym/business name.
- Address and phone (optional).
- Currency (default PKR; configurable).
- Time zone and date-boundary behavior.
- Financial-year start month, if needed for reports.
- Optional starter membership plans (daily, weekly, monthly, quarterly, six-month, annual templates).
- Owner full name, username/email, and password (stored only as a secure hash).
- Backup location and reminder preference.
- Receipt header and footer.
- Optional demo data, which must be removable safely.

---

## 6. Offline behavior

These must work with no internet connection:

- Login for local accounts.
- Member creation and editing.
- Membership sales, renewals, freezes.
- Attendance and check-in.
- Payment and expense recording, receipts, and reports.
- Backup and restore.

Any internet-dependent feature (email, SMS, WhatsApp, update checks) must be clearly marked and must never block basic operation when offline.

---

## 7. Users, roles, and permissions

Use role-based access control **enforced on the backend**. Hiding a button is not authorization. Every server-side action must be authorized in controllers, policies, or services.

### 7.1 Roles

**Owner / Administrator**
- Full access to all modules and settings.
- Manage staff accounts, roles, and permissions.
- Configure plans, fees, discounts, receipt numbering, backups, and application settings.
- View all financial reports and audit logs.
- Record refunds and adjustments with a reason.
- Restore backups.
- Delete or reverse records only through controlled, audited workflows.

**Manager**
- Manage members, memberships, attendance, and daily operations.
- View permitted reports.
- Record or approve expenses within configured limits.
- Approve attendance overrides and discounts within configured limits.
- Cannot change owner credentials or perform restricted system operations (restore, role changes) unless granted.

**Receptionist**
- Register, update, and search members.
- Record check-ins.
- Sell and renew memberships where authorized.
- Record payments and print receipts.
- See only the financial information needed for assigned duties.
- No access to payroll, full profit reports, security settings, or unrestricted audit logs by default.

**Accountant / Finance staff**
- View payments, dues, invoices, expenses, and financial reports.
- Reconcile daily cash totals and export financial reports.
- Record approved financial transactions.
- No access to workout or sensitive health notes unless granted.
- Cannot change security settings or erase transaction history.

**Trainer**
- View assigned members only.
- Create and update workout plans for assigned members.
- Record training sessions and progress.
- View their own schedule (and commission summary, if enabled).
- No unrestricted access to financial records or other members' sensitive information.

**Read-only / Auditor**
- View explicitly permitted screens and reports.
- Cannot create, update, delete, or reverse any record.

### 7.2 Permissions matrix (defaults)

| Capability | Owner | Manager | Receptionist | Accountant | Trainer | Auditor |
|---|---|---|---|---|---|---|
| Dashboard | Full | Operational | Limited | Financial | Limited | Read-only |
| Members | Full | Full | Create/edit allowed fields | Read-only as needed | Assigned only | Read-only |
| Membership plans | Full | Edit | Sell/renew only | Read-only | No | Read-only |
| Memberships (sell/renew/freeze) | Full | Full | Sell/renew | Read-only | No | Read-only |
| Attendance | Full | Full + override | Record | Read-only | View relevant | Read-only |
| Payments | Full | Full | Collect/record | Full finance | No | Read-only |
| Refunds / adjustments | Full | Approve within limit | No | Record if granted | No | No |
| Expenses | Full | Record/approve | No | Record/view | No | Read-only |
| Workouts | Full | View | No | No | Assigned only | No |
| Staff / payroll | Full | Limited | No | Authorized finance | Own profile | No |
| Reports | Full | Operational | Operational | Financial | Training | Permitted |
| Audit log | Full | Limited | No | Financial entries | No | Read-only |
| Settings / roles | Full | No | No | No | No | No |
| Backup | Full | Create only | No | No | No | No |
| Restore | Full | No | No | No | No | No |

Administrators may adjust role permissions where practical. Critical actions require appropriate permission and are recorded in the audit log.

### 7.3 Account controls

- Secure login and logout; passwords hashed with a modern supported algorithm; never stored or logged in plaintext.
- Password change and administrator-controlled reset.
- Progressive delay or lockout after repeated failed attempts.
- Configurable session timeout after inactivity.
- Disable accounts without deleting their audit history.
- Optional re-authentication for sensitive operations (refunds, restore, role changes).
- Confirmation required for destructive or financial actions.

---

## 8. Navigation and desktop UI

### 8.1 Layout

- Left sidebar navigation; top bar with gym name, current date, quick search, notifications, and current user.
- Main content area optimized for desktop monitors (**desktop-first**), usable on small laptop screens.
- Consistent tables, filters, pagination, forms, dialogs, and confirmations; breadcrumbs on deeper screens.
- Visible loading, empty, validation, success, and error states.
- Keyboard-friendly navigation with clear focus indicators and accessible contrast.
- Status shown with text labels, never color alone.
- Avoid horizontal scrolling on common screens at typical laptop resolutions.
- No destructive action without confirmation; warn about unsaved changes when leaving a modified form.
- Enter-key behavior must never accidentally submit destructive forms.
- Pagination for large tables; never load all records at once.

### 8.2 Sidebar

1. Dashboard
2. Members
3. Attendance
4. Membership Plans
5. Memberships and Renewals
6. Payments
7. Invoices and Receipts
8. Expenses
9. Trainers
10. Workout Plans *(optional)*
11. Exercise Library *(optional)*
12. Classes and Appointments *(optional)*
13. Staff and Payroll *(post-MVP)*
14. Equipment and Inventory *(post-MVP)*
15. Reports
16. Notifications and Reminders
17. Audit Log
18. Backup and Restore
19. Settings
20. Help / About

Items are hidden according to the signed-in user's permissions.

### 8.3 Visual style

- Professional, modern business software with a neutral background and one restrained accent color.
- Sidebar with icons and readable labels; consistent badges, dialogs, forms, and tables.
- Labels always visible; required fields clearly marked; inline validation plus an error summary.
- Tab order follows visual order.
- Avoid mobile-style oversized cards and navigation patterns.

---

## 9. Dashboard

### 9.1 KPI cards

- Total members and active members.
- Memberships expiring soon and expired memberships.
- Today's check-ins.
- Payments collected today and month-to-date.
- Outstanding dues.
- Expenses for the selected period.
- Net operating result for the selected period, with its calculation explained.

### 9.2 Charts and lists

- Income by day/week/month.
- Attendance trend.
- Membership status distribution.
- New members over time; renewals and expirations.
- Recent payments and recent registrations.
- Upcoming membership expiries.
- Members with overdue balances.
- Recent administrative activity, if authorized.

### 9.3 Controls

- Date-range filter and refresh.
- Quick actions: Add Member, Check In, New Payment, New Expense, Renew Membership.
- Clicking a KPI opens the corresponding filtered list.
- All values respect the viewer's role; financial figures are hidden from roles without finance access.

### 9.4 Calculation definitions

- **Active membership:** effective start date has arrived, effective end date has not passed, and status is active, unless a documented freeze policy applies. Status is computed from dates and lifecycle rules, never from a stale status field alone.
- **Outstanding dues:** valid charges minus successful payment allocations and approved credits/refunds, without double-counting.
- **Collected revenue:** payments with status *successful* only. Pending or failed payments never count.
- **Net operating result:** recorded collected income minus recorded expenses for the period. Label it an *operational summary*, not audited accounting profit.
- Timezone and date-boundary behavior (for example, when "today" ends) are defined in gym settings.

---

## 10. Member management

### 10.1 Registration fields

Required by default:
- System-generated unique member number.
- Full name.
- At least one contact method, according to gym policy.
- Registration date.
- Member status.

Optional / configurable:
- Photo, phone, email, date of birth.
- Gender, only if the gym has a legitimate operational need.
- Address, emergency contact name and phone.
- Notes, referral source, fitness goals.
- Consent to marketing messages.
- Relevant injury/health notes, only when necessary, with consent, restricted access, and a visible privacy warning.

Validation:
- Warn about likely duplicates (matching phone, email, or name) with configurable matching.
- Validate email and phone formats reasonably without assuming one national format.
- Do not require unnecessary sensitive information.
- Track creation and last-update timestamps.

### 10.2 Member list

Columns: member number, photo thumbnail, full name, phone, plan, membership status, expiry date, outstanding balance, last attendance, actions.

Features:
- Search by name, member number, phone, or email.
- Filter by member status; by membership state (active, expiring soon, expired, frozen, suspended, cancelled); by plan; by join date; by outstanding balance.
- Sort and paginate.
- Export authorized fields to CSV; print a member list.
- Bulk actions are permission-controlled and confirmed.
- **Never hard-delete members who have financial or attendance history.** Use archive/deactivation. Deletion happens only through an authorized, audited privacy workflow.

### 10.3 Member status vs. membership status

Member status (separate from membership state): **Active, Inactive, Suspended, Archived.** A person remains a member record even when their membership expires.

### 10.4 Member profile

Tabs:
1. Overview and contact information
2. Current membership
3. Membership history
4. Payments, invoices, and outstanding balance
5. Attendance history
6. Workout plans *(if enabled)*
7. Fitness measurements *(if enabled)*
8. Trainer assignments
9. Notes and documents *(restricted)*
10. Audit/history view *(authorized users only)*

Actions: edit profile, start/renew membership, freeze/unfreeze, suspend/reactivate, record payment, print member card, view/print receipt, record an attendance correction (with reason and audit event), archive member.

### 10.5 Member number and card

- Unique, human-readable member number.
- Optional QR code containing an opaque identifier or signed token. **Never** encode phone, address, payment, or health details.
- Printable member card layout.
- Manual lookup must always remain available if scanning is unavailable.

---

## 11. Membership plans and lifecycle

### 11.1 Plan fields

- Name and description.
- Duration (days or calendar months) and unit.
- Price and joining/registration fee.
- Tax, only if required and configured.
- Included services or usage restrictions; optional visit/session limit.
- Whether freezing is allowed, maximum freeze duration, and freeze rules.
- Grace period, if applicable.
- Discount eligibility.
- Whether the plan can be sold to new members.
- Active/inactive flag; created/updated timestamps.

Provide starter templates (daily, weekly, monthly, quarterly, six-month, annual). All prices and durations are configurable and never hard-coded.

### 11.2 Membership record

- Member, plan, start date, end date.
- Agreed price, joining fee, discount amount and reason, final charge.
- Amount paid and balance due (derived from the ledger; see section 13).
- Status, freeze periods, extensions.
- Created-by user, notes, reason for manual adjustments, timestamps.

### 11.3 Lifecycle actions

- Start a new membership.
- Renew a membership (history preserved).
- Extend expiry with a mandatory reason (permission-controlled, audited).
- Upgrade/change plan. Prorating only if that policy is explicitly implemented.
- Freeze and unfreeze, if allowed by the plan.
- Suspend and reactivate.
- Cancel with a reason and appropriate financial handling.
- View the full change history.
- Alert on overlapping active memberships unless gym policy allows them.

### 11.4 Expiry rules

- Status is calculated from dates and lifecycle rules.
- Configurable reminder periods (for example, 7 days and 1 day before expiry).
- Expired memberships are visibly marked.
- Check-in is blocked for expired memberships by default; an authorized override with a reason is audited.
- **Never silently renew or extend a membership, or charge money automatically.**
- Document whether end dates are inclusive, and how month-end and leap-year dates behave. Do not assume a month equals 30 days.
- Prevent duplicate renewals from double-clicks or retries (idempotency).
- Use date-only fields for calendar membership dates; display in the gym's configured timezone.

---

## 12. Attendance and check-in

### 12.1 Check-in screen (reception-optimized)

- Large search field focused on screen open.
- Search by member number, name, or phone. Barcode/QR scanners work as keyboard input.
- Show photo, name, membership status, expiry date, and any warning.
- One clear **Check In** action; a clear allowed/denied result with the reason.
- Record timestamp and staff user. Optional check-out.

### 12.2 Rules

- Prevent accidental duplicate check-ins within a configurable interval.
- Warn or block expired, suspended, or frozen memberships per policy.
- Authorized override (Owner, Manager, or granted role) requires a mandatory reason and creates an audit record.
- Support manual attendance when a scanner is unavailable.
- Corrections preserve an audit trail. **Attendance is never silently deleted.**
- Handle timezone and daylight-saving behavior where relevant.

### 12.3 Attendance data

Member, check-in time, optional check-out time, entry method (manual, QR, other), staff user or device, status, override reason, notes.

### 12.4 Reports

- Daily attendance list; attendance by member and date range.
- Members who have not visited for a chosen period.
- Peak-hour and weekly trends; check-ins by staff user.
- Corrected and overridden entries.
- Export (CSV) and print/PDF.

### 12.5 Optional QR/webcam check-in

May be added later. A manual search-and-check-in workflow must always remain. QR codes must not expose private information.

---

## 13. Payments, ledger, invoices, and receipts

### 13.1 Ledger model (source of truth)

Money is modeled as a ledger, not a mutable balance field.

- **Charges** record what is owed (membership fee, joining fee, training session, class, other approved charge).
- **Payments** record money actually received.
- **Payment allocations** record how each payment is applied to charges. One payment may cover several charges, and several payments may cover one charge.
- **Adjustments / refunds / reversals** are separate, linked, audited records.
- **Outstanding balance** is derived from charges, allocations, refunds, and adjustments. If a cached balance is kept for speed, it must be updated transactionally and be reconcilable against the ledger.
- Never store only `member.balance` as the source of truth.

### 13.2 Payment record

- Unique payment/receipt number.
- Member; related membership, invoice, or charge.
- Amount and currency.
- Method: cash, bank transfer, card terminal, or configured method.
- Date/time; transaction/reference number where relevant.
- Received-by user; notes.
- Status: pending, successful, failed, voided, or refunded as appropriate.
- Link to a refund/reversal where applicable.

### 13.3 Financial rules

- Money uses integer minor units or a decimal type. **Never floating point.**
- Ordinary payments must be greater than zero.
- Support full and partial payments; show the remaining balance clearly.
- Prevent overpayment unless explicitly allowed.
- Prevent a payment being applied twice, including on retries or double-clicks.
- **Completed payments are never edited or deleted.** Corrections use a reversal, refund, or adjustment with reason, permission, and audit entry.
- Refunds, discounts, write-offs, and corrections require a reason and permission; large amounts may require manager or owner approval.
- A refund never deletes the original payment.
- Pending or failed payments are not collected revenue.
- Use database transactions for membership creation, charge creation, payment allocation, refunds, and invoice updates.
- Offline cash and bank-transfer recording must work without any online gateway. Online gateways are optional future work and must be specified and tested separately.

### 13.4 Invoices and receipts

- Sequential, human-readable invoice/receipt numbers: unique, never silently reused, safe under concurrency.
- Gym name, logo, address, contact details.
- Member name and number; plan/service description.
- Gross price, discount, tax (if configured), amount paid, balance due.
- Payment method, reference, date/time, issuing staff user, currency formatting.
- Configurable footer and refund/cancellation policy.
- Print preview, Windows printer support (A4 required), PDF export.
- Reprints show the **same** receipt number, never create a duplicate payment, and are marked "COPY".

### 13.5 Daily cash reconciliation

- Daily payment totals by method and by staff user.
- **Daily cash closing report:** expected cash vs. declared cash.
- Recorded discrepancy with an explanation.
- Reconciliation edits are restricted and audited; closed days cannot be silently reopened.

---

## 14. Expenses and basic accounts

### 14.1 Categories (configurable)

Rent; electricity, gas, water, internet/telephone; staff salaries; trainer commissions; equipment purchase and repair; cleaning supplies; marketing; maintenance; other.

### 14.2 Expense record

Reference number, date, category, description, amount and currency, payment method, supplier/payee, optional attachment/receipt (restricted file types and sizes), recorded-by user, approval status (if approval is enabled), notes, audit history.

### 14.3 Reports

- Daily, weekly, monthly, and custom-range collections.
- Collections by payment method, staff user, and membership plan.
- Expenses by category.
- Outstanding balances.
- Discounts, refunds, and adjustments.
- Income vs. expenses; operating result = recorded income minus recorded expenses, with the basis documented.
- Cash closing report.

**Accounting limitation:** Version 1 is a practical gym operations ledger, not a double-entry accounting system. Reports are labeled operational. Do not present the software as tax-compliant accounting without jurisdiction-specific review.

---

## 15. Trainers, staff, and payroll

### 15.1 Staff profiles

Staff ID, name, contact details, role, start date, employment status, shift/schedule if used, salary/commission configuration (restricted), login-account link, notes, audit history.

### 15.2 Trainer features

- Profile and specialties; availability and schedule.
- Assigned members; training-session calendar.
- Record session completion or cancellation.
- Member-specific notes (restricted access).
- Optional session packages with remaining sessions.
- Optional commission calculation with explicit, documented rules.
- Performance reports based on transparent, defined metrics.

### 15.3 Payroll (post-MVP unless requested)

- Salary period, base salary, approved adjustments, commission, advances/deductions where legally appropriate, amount paid, payment date, payslip print/export.
- Restricted to authorized roles; full audit trail.
- No automatic payroll-tax calculation unless jurisdiction-specific requirements are defined.

---

## 16. Workout plans and fitness progress (optional module)

Managed from the PC by trainers and authorized staff. May be postponed without blocking core operations. It is not a medical service.

### 16.1 Exercise library

Name, description and instructions, muscle group, equipment, difficulty, optional local image/video, safety notes, active/inactive.

### 16.2 Workout plans

Plan name and goal, assigned member and trainer, start/end dates, workout days, exercises with order, sets, reps, target weight, rest, notes; revision history; print-friendly sheet.

### 16.3 Logging and progress

- Date, exercise, sets/reps/weight performed, optional perceived effort and notes.
- Personal records; history and progress charts.
- Body weight and configurable measurements; goals with target dates.
- Collect only what the service needs. Body-fat figures only if measured appropriately.
- Progress photos require consent, restricted access, and a deletion policy.
- Do not diagnose conditions or present estimates as clinical measurements.

---

## 17. Classes and appointments (optional)

- Class name, type, description, instructor, date/time, duration, capacity, room/area.
- Member booking and cancellation; waitlist if enabled; attendance.
- Personal-training appointment slots and trainer availability.
- Conflict prevention for trainers and rooms.
- Utilization reports; printable daily schedule; reminders.

Not required for launch. Enable only if the gym needs it.

---

## 18. Equipment and inventory (post-MVP)

- Equipment register: asset ID, category, location, purchase date and cost, condition, status, warranty, supplier.
- Maintenance schedule, repair log, repair cost, downtime.
- Consumable inventory: quantity, reorder threshold, low-stock warning, stock movements.
- Stock adjustments require a reason and an audit record.
- No retail point-of-sale module unless the gym intends to sell products.

---

## 19. Notifications and reminders

### 19.1 In-app (base release)

Membership expiring soon or expired; payment due/overdue; upcoming class or appointment; backup due, failed, or low disk space; low inventory (if enabled); optional update available. Printable call lists for contacting members manually.

### 19.2 External channels (future)

Email, SMS, and WhatsApp need internet, provider accounts, cost, consent, and separate configuration. The app must never claim delivery when a message was only queued or attempted. Store delivery results and respect consent and opt-out.

### 19.3 Scheduled jobs

Daily expiry checks, backup reminders, optional inactivity reminders, log/temp-file cleanup. Reminders are created idempotently to avoid duplicates, and jobs follow the lifecycle rules in section 3.4.

---

## 20. Reports, search, exports, printing, hardware

### 20.1 Required reports

Member directory; new registrations; members by status; memberships expiring in a range; expired memberships; renewals; attendance by day/member/range; inactive members; payments by date, method, and staff; outstanding dues; discounts, refunds, adjustments; expenses by date and category; income vs. expenses; cash closing; audit/user activity for authorized admins.

### 20.2 Controls

- Date-range filters, column filters, sorting, pagination, global member search.
- Print with preview; configurable page size, margins, currency, date format, and logo.
- CSV export with correct UTF-8 encoding; PDF export; optional XLSX.
- Report headers include generation time, selected filters, and currency.
- **Authorization applies to exports exactly as to on-screen data.** Avoid exporting unnecessary personal information. Log sensitive bulk exports.
- Prevent spreadsheet formula injection in exported text fields.

### 20.3 Hardware

Required: printing receipts, invoices, and reports on a Windows-installed printer (A4).
Optional: thermal receipt printer, USB barcode/QR scanner, webcam QR scanning, label printer, cash drawer.
Hardware must be tested on actual target devices, and a manual workflow must remain if hardware fails.

---

## 21. Settings

### 21.1 Gym settings

Name, logo, address, contacts; currency (default PKR); timezone; date/number formats; business hours; receipt/invoice prefix, numbering, header, and footer; membership reminder periods; attendance duplicate-check interval and default rules; freeze policy; configurable payment methods and expense categories; tax fields only if required; printer and PDF preferences.

### 21.2 User settings

Create, edit, and deactivate staff users; reset passwords; assign roles and permissions; session timeout; re-authentication for sensitive actions.

### 21.3 Application settings

Version; database and storage status; data directory and disk usage; log location; backup schedule, destination, retention, and status; optional update channel; logging level; configurable local port avoiding collisions; diagnostics.

Settings changes are permission-controlled, and important changes are audited.

---

## 22. Backup, restore, and data portability

### 22.1 Backup

- Manual **Back Up Now** action and optional scheduled backups (catch-up on startup if missed).
- Configurable destination, including an external drive; stored outside the installation directory.
- Includes the database (using a consistent SQLite backup method), uploaded files and photos, settings, and version metadata.
- Timestamped filenames; checksum recorded; completion/failure status and last-success time shown.
- Configurable retention (for example, last 7 daily and last 4 weekly).
- Optional encrypted archive with a clear recovery-key procedure.
- Warn on failure or low disk space.
- Never overwrite the only known-good backup without confirmation.
- Backups contain member data and must be protected accordingly.

### 22.2 Restore

- Owner/admin only, with explicit confirmation and optional re-authentication.
- Select and validate a backup; show its date and app/database version; verify checksum and integrity first.
- Warn that restore replaces current data.
- **Automatically create a safety backup of current data first.**
- Block writes during restore; restore atomically where feasible; show progress and clear errors.
- Restart services safely; record the restore in the audit log.
- Never silently overwrite the database. Document recovery steps if restore fails.

### 22.3 Export and import

- Member directory export to CSV with permission checks; documented backup format.
- If member import is included: validate rows, show a preview and errors before writing, and use idempotency checks so payments are never imported twice.
- Provide a way to export a member's relevant records where required.

### 22.4 Backup acceptance test

Create sample data, back up, install on a clean test machine or data directory, restore, and verify members, memberships, payments, attendance, and attachments.

---

## 23. Security, privacy, and audit

- Bind the local server to loopback only; require the per-launch secret token; never expose it on the network by default.
- Apply the Electron hardening rules in section 2.2 (context isolation, sandbox, strict CSP, navigation blocking, validated IPC).
- Secure sessions, CSRF protection, secure headers, secure random tokens.
- Validate input and authorize every operation on the server.
- Protect against SQL injection (parameterized queries), XSS, CSRF, path traversal, and unsafe uploads; restrict upload types and sizes; store uploads only in controlled directories.
- Never store secrets in source code, logs, or version control. Never log passwords, session tokens, or payment secrets.
- Least-privilege file permissions; user data under the Windows application-data directory.
- Sensitive personal and fitness information is restricted to authorized roles.
- **Audit at least:** membership edits and date extensions, plan changes, payments, refunds and reversals, discounts and write-offs, attendance overrides and corrections, role and user changes, settings changes, exports of sensitive data, cash-closing edits, backups, and restores.
- Audit logs are append-only through the normal UI.
- Define data retention and deletion policy.
- Any future remote-access mode must use encrypted transport, authentication, and firewall design.
- Test authorization boundaries automatically, and test with standard non-admin Windows accounts.

**Limitation to document:** on a computer controlled by its owner, local administrator access cannot be fully defended against. Recommend strong Windows account security and encrypted device/backup storage.

---

## 24. Reliability and data integrity

- Database transactions for all multi-step financial and membership actions.
- Constraints and indexes for uniqueness and lookups; prevent duplicate receipt/payment numbers.
- Money in integer minor units or decimals only.
- Timestamps stored in a consistent canonical form and displayed in the gym's timezone.
- Protect against duplicate submissions and repeated clicks.
- Handle disk-full errors and database-lock conditions gracefully.
- Handle interrupted writes and crashes safely.
- Background tasks are safe to retry and never duplicate payments or reminders.
- Avoid hard deletion of records needed for financial or audit history.
- If a startup migration fails, do not start against a partially migrated database; back up before migrations; provide recovery instructions.

---

## 25. Database design

Use a relational database with foreign keys, indexes, constraints, timestamps, and explicit deletion policies. Do not put business data in a generic key/value table. Review and normalize the final schema during implementation, and propose it for approval before building feature screens.

### 25.1 Proposed tables

| Table / model | Purpose |
|---|---|
| `users`, `roles`, `permissions`, `user_roles` | Accounts and access control |
| `gym_settings`, `app_settings` | Gym and application configuration (no secrets) |
| `members` | Profile, member number, status |
| `membership_plans` | Configurable packages |
| `memberships` | Subscriptions, dates, status |
| `membership_freezes` | Freeze periods and reasons |
| `charges` | Amounts owed |
| `payments` | Money received |
| `payment_allocations` | How payments apply to charges |
| `payment_adjustments` (refunds/reversals) | Corrections linked to originals |
| `invoices`, `invoice_items` | Billing documents |
| `cash_closings` | Daily expected vs. declared cash |
| `attendance_records` | Check-in/out history, overrides |
| `expenses`, `expense_categories` | Operating expenses |
| `staff_profiles`, `trainer_profiles` | Staff and trainer details |
| `trainer_assignments`, `trainer_sessions` | Trainer-member links and sessions |
| `exercises`, `workout_plans`, `workout_days`, `workout_exercises`, `workout_logs` | Workout module |
| `fitness_measurements`, `fitness_goals` | Progress module |
| `gym_classes`, `class_bookings` | Classes module |
| `equipment`, `maintenance_records`, `inventory_items`, `stock_movements` | Equipment/inventory |
| `notifications` | In-app reminders |
| `audit_logs` | Sensitive actions |
| `backup_records` | Backup time, location, size, checksum, result |

### 25.2 Constraints and indexes

- Unique: member number, invoice/receipt number, username/email.
- Foreign keys on all relationships (and enforced in SQLite).
- Indexes on member name, number, phone, and common report filters.
- Check constraints for valid and nonnegative monetary values where appropriate.
- Versioned migrations with tested upgrade paths from previous releases.
- Preserve financial and audit history.

### 25.3 Branch readiness

Version 1 is single-gym. If multiple branches may be added later, document whether each record would need a `gym_id`/`branch_id`. Do not implement incomplete tenant isolation that could expose one gym's records to another.

---

## 26. Logging, errors, and diagnostics

- Log startup/shutdown, service health, migrations, backup results, and unexpected errors, with rotation and retention limits.
- Never log passwords, tokens, or unnecessary member details.
- Friendly error messages with a reference ID; never show raw stack traces to ordinary users.
- Clear errors for disk full, database unavailable, failed backup, printer unavailable, invalid restore, and migration failure.
- Diagnostics page: version, OS version, database status, disk space, last backup status.
- **Export support report** function that redacts personal data and secrets.
- Debug mode disabled in production builds.

---

## 27. Performance and quality targets

Targets are acceptance criteria to be **measured on a reference Windows laptop**, not guarantees.

- First launch within roughly 5–10 seconds; later launches faster.
- Member search results within about 1 second.
- Common pages load within about 2 seconds with 10,000 member records in test data.
- Indexed search and pagination for large datasets.
- Payment, check-in, and renewal flows with minimal steps.
- UI stays responsive during reports, exports, and backups; long tasks show progress and allow safe cancellation where possible.
- No data loss after normal shutdown.

---

## 28. Testing strategy

### 28.1 Unit / model tests

Membership expiry and date boundaries (leap years, month-end, inclusive/exclusive end dates); freeze and extension calculations; discounts and final charge; payment allocation and outstanding balance; refunds and reversals; rounding; duplicate member detection; attendance duplicate prevention; role and permission checks; report date filters; receipt numbering and concurrency; backup validation; date and currency handling.

### 28.2 Integration tests

Member registration and search; create member → membership → partial payment → remaining payment → receipt; check-in of an active member; rejection or authorized override for expired/frozen members; renewal with preserved history; refund/reversal with audit entry; expense recording and report totals; cash closing; report filtering and exports; receptionist blocked from protected reports and settings; backup and restore with record comparison; migrations on a fresh database and on a previous-release database; permission checks across all endpoints.

### 28.3 Installer and desktop tests

- Fresh install on a clean Windows 10 and 11 64-bit machine with no developer tools.
- Install under a standard user account where supported; install to a path containing spaces.
- First launch and setup wizard; launch after reboot; offline operation.
- Launch, close, and relaunch without duplicate processes; shutdown stops the backend.
- Display scaling 100–150% and supported resolutions.
- Printing and PDF generation.
- Interrupted install and repair.
- Upgrade from a previous version with data intact; backup and restore across an upgrade.
- Uninstall keeping data; uninstall with explicit data removal; reinstall reconnecting to retained data.
- Confirm no inbound firewall ports open by default.
- Confirm data is not stored only under the installation directory.
- Document Windows Defender/SmartScreen behavior.
- Backup and restore on a second clean environment.

---

## 29. User acceptance scenarios

1. Owner installs the app and creates the gym profile.
2. Receptionist registers a new member.
3. Owner creates a monthly plan.
4. Receptionist sells the plan and records a partial payment.
5. The app calculates the remaining balance correctly from the ledger.
6. Receptionist prints a receipt; reprint shows the same number marked COPY.
7. Member checks in while the membership is valid.
8. Check-in is denied after expiry; a manager override with a reason succeeds and is audited.
9. Owner renews the membership and sees its history.
10. Accountant records an expense and generates a monthly summary.
11. Receptionist closes the day: expected vs. declared cash with a discrepancy note.
12. Owner records a refund; the original payment remains and a linked reversal exists.
13. Owner creates a backup and restores it on a test installation.
14. Upgrade preserves all members, payments, and settings.
15. Receptionist cannot open owner-only settings or restore operations, even by direct URL.

---

## 30. Development roadmap

### Phase 0 — Packaging feasibility prototype *(do first)*

- Select and document the desktop shell.
- Package a minimal Electron + Next.js app (one screen reading and writing one SQLite record) into a Windows `.exe` installer, bundling the runtime and native dependencies.
- Prove that `better-sqlite3` loads and the Next.js standalone server starts inside the **packaged** build, not only in development.
- Verify startup, shutdown, port handling, single-instance lock, SQLite persistence, migration, logs, and data directory.
- Verify fresh install, upgrade, uninstall, and data retention on a clean Windows machine.
- Decide whether to proceed with Electron + Next.js or switch to a fallback architecture (section 2.3).

**Exit criterion:** a clean machine installs and runs the prototype with no manual runtime or database installation. Do not defer this risk to the end.

### Phase 1 — Core foundation
Project structure and shell; schema and migrations; authentication and roles; first-run wizard; gym settings; audit log foundation.

### Phase 2 — Members and memberships
Member CRUD, search, archive; plans; membership creation, expiry, renewal, freeze, history; member profile.

### Phase 3 — Attendance and finance
Check-in with overrides; charges, payments, allocations, invoices, receipts; expenses; cash closing; financial and attendance reports; dashboard.

### Phase 4 — Reliability and desktop polish
Printing, PDF and CSV exports; notifications and reminders; backup and restore UI; keyboard navigation; error handling and diagnostics; permission review.

### Phase 5 — Optional modules
Trainers and workouts; classes and appointments; equipment and inventory; payroll; external messaging; multi-PC or multi-branch operation if approved.

### Phase 6 — Release and distribution
Installer hardening, icon, metadata, code signing where available; clean-machine, upgrade, and recovery testing; user guide and release notes; versioned installer with checksum.

---

## 31. Acceptance criteria and definition of done

The initial release is complete only when every item is true:

- [ ] A working Windows `.exe` installer is produced and builds reproducibly from documented steps.
- [ ] A non-technical user can install it on a clean supported Windows laptop without installing Node.js or a database server.
- [ ] A first-run wizard creates the owner account securely; no default production password exists.
- [ ] The app launches from the Start Menu into its own desktop window and works offline.
- [ ] Members can be created, searched, edited, and archived.
- [ ] Plans can be configured and memberships issued, renewed, frozen, and viewed in history.
- [ ] Start/end dates and expiry state are calculated correctly, including date-boundary cases.
- [ ] Check-in works for eligible members, shows clear rejection reasons, and supports audited overrides.
- [ ] Full and partial payments work; balances are derived from the ledger.
- [ ] Unique receipts print or save as PDF; reprints do not duplicate payments.
- [ ] Expenses, daily cash closing, and income/expense reports work and export.
- [ ] Permissions are enforced server-side and covered by automated tests.
- [ ] Financial changes are auditable and cannot be silently erased.
- [ ] Backup and restore are implemented, documented, and tested on a clean machine.
- [ ] Upgrading preserves all data; uninstall behavior and data location are explicit.
- [ ] Automated tests pass; installation, backup, restore, and recovery have passed on a clean Windows machine.
- [ ] No critical or high-severity security or data-loss defects remain open.
- [ ] No unverified claim is made about offline operation, self-containment, security, or compatibility.

---

## 32. Required deliverables

1. Complete source code with Git history and tagged releases.
2. Versioned database migrations.
3. Automated tests.
4. Windows `.exe` installer (for example, `GymManagementSystem-Setup-1.0.0.exe`) with app icon and version metadata.
5. Checksum and version record for every released installer.
6. Documentation: `README.md`, `REQUIREMENTS.md`, `INSTALLATION.md`, `USER_GUIDE.md` (owner, receptionist, trainer, accountant), `BACKUP_RESTORE.md`, `DEVELOPMENT.md`, `PACKAGING.md`, `RELEASE_CHECKLIST.md`, `SECURITY.md`, `CHANGELOG.md`.
7. Release notes and a known-limitations document.
8. Reproducible build instructions.
9. Dependency and license inventory.
10. Optional demo-data set that can be removed safely.

Never distribute an installer that has not passed the clean-machine install and data-preservation tests.

### Suggested repository layout

```text
gym-management/
├── src/
│   ├── app/            # Next.js App Router: pages, layouts, route handlers, server actions
│   ├── components/     # React UI components
│   ├── server/         # business logic: services, policies, db access, jobs (no UI code)
│   └── lib/            # shared helpers (money, dates, validation schemas)
├── db/                 # schema, migrations, seed data
├── electron/           # main process, preload script, lifecycle manager, security config
├── tests/              # unit, integration, and end-to-end (Playwright) tests
├── build/              # installer configuration, icons, assets
├── scripts/            # build, package, diagnostics, backup utilities
├── docs/
└── README.md
```

Keep business logic in `src/server`, independent of Next.js UI code, and keep the Electron and packaging code isolated.

---

## 33. Decisions to confirm before implementation

This specification assumes:

- One gym location in the first release.
- Windows 10/11 64-bit; one primary Windows PC.
- Core operations work offline.
- PKR is the default currency, configurable.
- Cash and bank transfers are recorded manually; online gateways are optional later.
- Electron + Next.js (TypeScript) is the selected stack, subject to the Phase 0 prototype; SQLite is the single-PC database.
- Optional modules (workouts, classes, equipment, payroll) are decided before Phase 1.

**Open decisions:**

1. Will more than one PC ever need the same live data? If yes, decide now (section 2.4).
2. Which optional modules ship in version 1?
3. Per-user (`%LOCALAPPDATA%`) or per-machine (`%PROGRAMDATA%`) data location?
4. Which approval thresholds apply to refunds, discounts, and expenses?
5. Is a code-signing certificate available?
6. Confirm the proposed libraries (Drizzle ORM, `better-sqlite3`, Zod, Vitest, Playwright, `electron-builder`) or choose alternatives.

---

## 34. Rules for the development agent

Implement in small, testable, reviewable phases.

**Before coding**
1. Inspect the repository and document the existing architecture.
2. Build the packaging prototype first; list risks, unsupported dependencies, and limitations.
3. Propose the schema and migrations before feature screens.
4. Confirm which optional modules are in scope.

**During coding**
- Do not silently change the selected stack (Electron + Next.js + SQLite) or the pinned Node.js, Electron, or Next.js versions; any change needs an explicit architecture decision.
- Use migrations for all schema changes, with tests for every meaningful model and business rule.
- Put multi-step financial workflows in service functions under `src/server`, each wrapped in one database transaction.
- Enforce authorization in route handlers, server actions, and service functions, not only in the UI and not only in Next.js middleware.
- Never weaken the Electron security settings (context isolation, sandbox, no Node integration in the renderer, strict CSP, validated IPC).
- Never use floating point for money. Never store passwords in plaintext. Never store secrets in source control.
- Never hard-delete financial or audit history as a routine correction.
- Do not hard-code currency, dates, plan durations, or receipt numbering.
- Keep user data separate from application binaries.
- Add rollback and recovery instructions for migrations and installer updates.
- Keep the first release focused; build optional modules only after core acceptance criteria pass.
- Do not fabricate packaging or test results. Report test runs honestly, including failures and skips.
- Do not claim the `.exe` is self-contained or working until tested on a clean Windows machine.

**At each phase:** implement, run tests, review security and data integrity, test the affected workflow, update documentation, then report work completed, files changed (with exact paths), tests run, and remaining issues.

**First implementation task:** create the packaging feasibility prototype and prove it can be installed, launched, closed, upgraded, and uninstalled on Windows without losing persistent data.
