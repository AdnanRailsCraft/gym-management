# Design Document

Covers the **user-interface design** and the **system design** of the Gym Management System. It turns the rules in [REQUIREMENTS.md](REQUIREMENTS.md) into concrete decisions. Items marked **(confirm)** are proposed defaults that need owner approval.

---

# Part A — User Interface Design

## A1. Design principles

1. **Reception speed first.** Check-in, payment, and renewal must take the fewest possible steps.
2. **Desktop-first.** Designed for mouse and keyboard on 1366×768 and 1920×1080, at 100–150% Windows scaling.
3. **Never ambiguous about money.** Amounts, balances, and statuses are always labeled; corrections are visible, never hidden.
4. **Safe by default.** Destructive or financial actions need confirmation; nothing is silently deleted.
5. **Status is never color alone.** Every colored badge also carries a text label (and optionally an icon).
6. **Calm and professional.** Neutral surfaces, one accent color, generous spacing.

## A2. Visual tokens

### Color (light theme)

| Token | Value | Use |
|---|---|---|
| `--bg` | `#F5F7FA` | App background |
| `--surface` | `#FFFFFF` | Cards, tables, dialogs |
| `--border` | `#D9DEE5` | Dividers, inputs |
| `--text` | `#1B2430` | Primary text |
| `--text-muted` | `#5B6676` | Secondary text |
| `--accent` | `#1F5FBF` | Primary buttons, links, selection |
| `--accent-hover` | `#194D9A` | Hover/pressed |
| `--sidebar-bg` | `#16202E` | Sidebar |
| `--sidebar-text` | `#D5DCE6` | Sidebar labels |
| `--success` | `#1E7A46` | Active, paid, allowed |
| `--warning` | `#B26A00` | Expiring soon, partial |
| `--danger` | `#B3261E` | Expired, denied, overdue, destructive |
| `--info` | `#0F6E8C` | Neutral notices |
| `--focus` | `#F2A900` | Keyboard focus ring (3px) |

All text/background pairs must meet WCAG AA contrast (4.5:1 for body text). A dark theme is optional and out of version 1.

### Typography

- Font stack: `"Segoe UI", system-ui, -apple-system, sans-serif` (native on Windows, works offline, no web-font download).
- Sizes: body 14px, table 13px, small/help 12px, page title 22px, section heading 16px, KPI figure 28px.
- Use tabular (monospaced) numerals for money columns so digits align.

### Spacing, shape, motion

- 4px base grid; common steps 8, 12, 16, 24, 32.
- Corner radius 6px (inputs, buttons), 10px (cards).
- Minimum click target 32×32px (36px for primary actions).
- Motion limited to short fades (≤150ms); respect the Windows reduced-motion setting.

## A3. App shell

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ ☰  Iron Gym            [ Search members (Ctrl+K) ]      🔔3   Ayesha ▾    │ Top bar (56px)
├────────────┬───────────────────────────────────────────────────────────────┤
│ Dashboard  │  Page title                              [ + Primary action ]│
│ Members    │  Breadcrumb / filters                                         │
│ Attendance │  ┌─────────────────────────────────────────────────────────┐  │
│ Memberships│  │                                                         │  │
│ Plans      │  │                    Content area                         │  │
│ Payments   │  │                                                         │  │
│ Expenses   │  └─────────────────────────────────────────────────────────┘  │
│ Reports    │                                                               │
│ ...        │                                                               │
│ Settings   │                                                               │
└────────────┴───────────────────────────────────────────────────────────────┘
 Sidebar 220px (collapsible to 64px icon rail)
```

- Sidebar items are filtered by the user's permissions (the server still enforces them).
- The top-bar search is global: member number, name, or phone. `Ctrl+K` focuses it.
- Notifications bell opens a panel of in-app reminders.

## A4. Components

| Component | Behavior |
|---|---|
| **Data table** | Search, sortable columns, pagination (25/50/100), sticky header, empty state, loading skeleton, row actions menu |
| **Status badge** | Pill with text label: Active, Expiring soon, Expired, Frozen, Suspended, Cancelled, Paid, Partial, Unpaid, Voided, Refunded |
| **Form field** | Visible label above input, required marker, help text, inline error below, error summary at the top on submit |
| **Money input** | Right-aligned, currency prefix, numeric only, two decimals, never accepts negative for ordinary payments |
| **Confirm dialog** | States the action and its consequence in plain words; destructive button labeled with the verb (e.g. "Reverse payment"), default focus on Cancel |
| **Reason dialog** | Mandatory reason text for overrides, extensions, refunds, corrections |
| **Toast** | Non-blocking success message; errors that need action use an inline banner instead |
| **Banner** | Persistent warnings: backup overdue, low disk space, unsaved changes |
| **Date picker** | Date-only, typed entry allowed, shows the gym's date format |
| **Receipt preview** | A4 print preview with Print and Save PDF |

## A5. Keyboard behavior

- Logical tab order matching visual order; visible focus ring on every control.
- `Ctrl+K` global search; `Esc` closes dialogs; `Enter` submits only non-destructive forms.
- Check-in screen: field focused on open; `Enter` selects the top match; `Enter` again confirms check-in.
- Tables: arrow keys move between rows where practical; `Enter` opens the row.

## A6. Key screens

### Dashboard

```text
┌─ Date range: [This month ▾]                  [Add Member][Check In][New Payment][New Expense]
│
│ [Active members] [Today's check-ins] [Outstanding dues] [Collected today]
│      312               87                Rs 148,500        Rs 42,000
│
│ [Expiring soon]  [Expired]  [Month income]  [Month expenses]  [Net operating result*]
│
│ ┌ Income by day ───────────────┐  ┌ Attendance trend ──────────────┐
│ │        ▂▃▅▇▆▅▇               │  │      ▃▄▅▅▇▆▄                   │
│ └──────────────────────────────┘  └────────────────────────────────┘
│ ┌ Expiring memberships ┐ ┌ Recent payments ┐ ┌ Recent activity ┐
│ └──────────────────────┘ └─────────────────┘ └─────────────────┘
│ * Operational summary: recorded income minus recorded expenses.
```

KPI cards are clickable and open the matching filtered list. Finance cards are hidden from roles without finance access.

### Check-in (reception)

```text
┌─ Check-in ───────────────────────────────────────────────┐
│  [ Scan or type member number, name, or phone…        ]  │
│                                                          │
│  ┌────────┐  Hassan Raza        #M-000214                │
│  │ photo  │  Monthly Plan · expires 28 Oct 2026          │
│  └────────┘  ● ACTIVE   Balance due: Rs 0                │
│                                                          │
│            [        Check In        ]                    │
│                                                          │
│  Result: ✔ Checked in at 06:42 by Ayesha                 │
│  — or —  ✖ DENIED: Membership expired 3 days ago         │
│           [ Renew membership ]  [ Override… (manager) ]  │
└──────────────────────────────────────────────────────────┘
```

- Denied results always give the reason and the next action.
- **Override** opens the reason dialog and requires a role with permission; it is audited.
- Duplicate check-in within the configured interval shows an informational message, not an error.

### Member list

Columns: Member #, photo, name, phone, plan, membership badge, expiry, balance, last visit, actions. Filters row: status, membership state, plan, joined range, "has balance". Export and Print buttons respect permissions.

### Member profile

Header: photo, name, member #, status badge, quick actions (Renew, Record payment, Freeze, Edit). Tabs: Overview · Memberships · Payments · Attendance · Workouts · Measurements · Trainers · Notes · History. Sensitive tabs appear only for permitted roles.

### Sell / renew membership (dialog or page)

1. Choose plan (shows price, joining fee, duration).
2. Start date (defaults to today, or the day after current expiry on renewal).
3. Discount (amount + reason; limited by role).
4. Summary: final charge, computed end date.
5. Optional payment now: amount, method, reference → balance shown.
6. Confirm → creates the membership, charge, optional payment and allocation in **one transaction**, then offers **Print receipt**.

The confirm button disables after the first click to prevent duplicates.

### Payments

List with date range, method, staff, status. Detail view shows allocations and any linked reversal. A completed payment has **Reverse / Refund…** (reason required), never Edit or Delete.

### Daily cash closing

Shows expected cash by method, an input for declared cash, the computed difference, and a mandatory explanation when the difference is not zero. Closing locks the day; reopening requires Owner permission and is audited.

### Reports

A left list of reports and a right pane with date range and filters, a table, and Print / CSV / PDF buttons. Report headers show generation time, filters, and currency.

### Settings, Backup and Restore, Audit Log

- Settings: tabs for Gym, Receipts, Plans, Payment methods, Expense categories, Users and roles, Security, Backup.
- Backup and Restore: last successful backup, **Back Up Now**, schedule, destination, backup list; **Restore** is a guarded multi-step flow (select → verify → warn → safety backup → type-to-confirm).
- Audit Log: read-only table filterable by user, action, entity, and date.

## A7. States and messages

- **Loading:** skeleton rows or spinner after 300ms; progress bar for backup, restore, export.
- **Empty:** explain what the screen is for and offer the primary action ("No members yet — Add your first member").
- **Error:** plain-language message, what to try, and a reference ID; no stack traces.
- **Validation:** inline error under the field plus a summary at the top.
- **Unsaved changes:** prompt before leaving a modified form.

## A8. Accessibility

- Contrast meets WCAG AA; focus always visible; labels programmatically linked to inputs.
- Status communicated by text, not color alone.
- Respect Windows display scaling, text size, and reduced-motion settings.
- Dialogs trap focus and return it on close.

## A9. Printing

- Receipts: A4 layout with gym logo and header, receipt number, member, line items, paid, balance, method, issuer, footer policy. Reprints carry a "COPY" mark.
- A narrow-roll (thermal) layout is optional.
- Reports use a print stylesheet: no sidebar, table headers repeat, page numbers.

---

# Part B — System Design

## B1. Component overview

```text
┌──────────────────────── Windows PC ───────────────────────────────┐
│  Electron main process                                            │
│   • single-instance lock     • window, menus, printing / PDF      │
│   • native dialogs           • starts + supervises backend        │
│   • generates per-launch secret token                             │
│        │ validated IPC (preload)          │ spawns                │
│        ▼                                  ▼                       │
│  Renderer (sandboxed)  ──loopback HTTP──►  Backend: Next.js       │
│  React UI (Next.js pages)  127.0.0.1:<free port> + token          │
│                                           route handlers /        │
│                                           server actions          │
│                                              │                    │
│                                              ▼                    │
│                                    src/server: policies →         │
│                                    services → db access           │
│                                    scheduler (reminders, backups) │
│                                              │                    │
│                                              ▼                    │
│  SQLite (WAL, better-sqlite3)   uploads/   logs/   backups/       │
│  in %LOCALAPPDATA%\GymManagementSystem\  (outside install folder) │
└───────────────────────────────────────────────────────────────────┘
```

Only the backend process opens the database during normal operation. Restore (which replaces the database file) is run by the main process: it stops the backend, swaps the files, and restarts it.

## B2. Layered responsibilities

| Layer | Responsibility |
|---|---|
| Electron main process | Window, lifecycle, single-instance lock, printing/PDF, file dialogs, backend supervision, restore orchestration. **No business logic.** |
| Preload script | Exposes a few narrow, named functions (print, open folder, choose backup file) to the renderer; the main process validates every call |
| Next.js pages / components | Present data and collect input; contain no permission or money logic |
| Route handlers / server actions | Parse and validate input (Zod), call a policy check, call a service, shape the response |
| Policies (`src/server/policies`) | The **only** place permission rules live; called on every action |
| Services (`src/server/services`) | Business workflows (sell membership, record payment, reverse payment, check in, close day, backup); each wraps its database work in one synchronous transaction |
| Data access (`src/server/db`) | Typed queries and schema (Drizzle proposed); derived-state queries |
| Scheduler (`src/server/jobs`) | Idempotent scheduled work (expiry reminders, backups) running inside the backend process |

**Rules:** UI code never imports `better-sqlite3` or the db layer. Services never import Next.js or Electron modules, so they can be unit-tested alone. `better-sqlite3` is synchronous, so transactions stay short and never `await` inside.

## B3. Domain model (core)

```text
Member 1───* Membership *───1 MembershipPlan
Membership 1───* MembershipFreeze
Member 1───* Charge            (membership fee, joining fee, session, other)
Member 1───* Payment
Payment *───* Charge           via PaymentAllocation (amount)
Payment 1───* PaymentAdjustment (refund / reversal, reason, approved_by)
Invoice 1───* InvoiceItem
Member 1───* AttendanceRecord
User   1───* AuditLog
CashClosing (per day): expected, declared, difference, explanation
```

## B4. Ledger design

- **Charge** = amount owed. **Payment** = money received. **PaymentAllocation** = portion of a payment applied to a charge.
- `charge_balance = charge.amount − Σ allocations + Σ approved adjustments to that charge`
- `member_balance = Σ charge_balance` over the member's valid charges.
- Money is stored as **integer minor units** (paisa) in a currency-aware column; never floats.
- Completed payments are immutable. A mistake is fixed with a **PaymentAdjustment** linked to the original, with reason, user, and time.
- If a cached balance column exists, it is updated inside the same transaction and verified by a reconciliation check (a diagnostics action recomputes from the ledger and reports differences).

### Idempotency

Each submit carries a one-time token (stored with a unique constraint). A repeated submit with the same token returns the original result instead of creating a second membership or payment.

## B5. Membership state

Stored fields: `start_on`, `end_on`, `lifecycle_status` (`scheduled`, `active`, `cancelled`, `suspended`) and freeze periods. **Displayed state is computed**:

```text
cancelled/suspended  → shown as such
today inside a freeze period → Frozen
today < start_on → Scheduled
today > end_on (+ grace) → Expired
end_on − today ≤ reminder days → Expiring soon
otherwise → Active
```

"Today" uses the gym's configured timezone and date boundary.

### Date policy (confirm)

- `end_on` is **inclusive**: a 1-month plan starting 15 Jan ends 14 Feb.
- Calendar-month plans add months to the start date, then subtract one day. If the target month is shorter, clamp to its last day (start 31 Jan + 1 month → ends 27 Feb, or 28 Feb in a leap year, as the day before the clamped date).
- Day-based plans add `N − 1` days.
- Freezing pushes `end_on` out by the frozen days.
- Renewal while still active starts the day after the current `end_on`; after expiry it starts today (staff may choose another date with permission).

## B6. Check-in decision flow

```text
find member → archived/suspended? → DENY (reason)
            → no membership?      → DENY (offer sell)
            → expired?            → DENY (offer renew / manager override)
            → frozen?             → DENY (offer unfreeze / override)
            → duplicate in window?→ INFO "already checked in at HH:MM"
            → else ALLOW → write AttendanceRecord (user, time, method)
Override → needs permission + reason → AttendanceRecord(status: overridden) + AuditLog
```

## B7. Receipt numbering

- A `number_sequences` row per (document type, year) holds the next value.
- The number is allocated **inside the same transaction** that creates the payment, with a unique index on the formatted number.
- Format: `<prefix>-<year>-<6-digit sequence>`, e.g. `RC-2026-000123` (confirm).
- A voided or reversed receipt keeps its number; numbers are never reused.

## B8. Authorization design

- A permission is a string key such as `payments.refund`. Roles map to sets of keys (editable by the Owner).
- Every route handler and server action calls `authorize(user, permission, record?)` from `src/server/policies` before touching data, and services re-check where an action can be reached by more than one path. Record-level rules (a trainer sees only assigned members) are in the policy. Next.js middleware may redirect unauthenticated users for convenience, but is never the only check.
- The UI hides what a user cannot do, but the policy is the authority. Tests iterate every role against every route and assert allow/deny.

## B9. Audit logging

An `audit_logs` row records: user, action key, entity type and id, before/after summary of changed fields, reason (when required), timestamp, and application version. Audited actions are listed in REQUIREMENTS section 23. The UI exposes no edit or delete for audit rows.

## B10. Scheduled work

A scheduler inside the backend process (started once at server start, with a guard against double start in development) runs: daily expiry reminder generation, backup (if scheduled), log/temp cleanup. Each job stores `last_run_at` and `last_error`, uses a unique key per (job, date) so reruns are harmless, and on startup runs any job whose due time passed while the app was closed.

## B11. Backup design

1. Use SQLite's online backup (or `VACUUM INTO`) to produce a consistent database copy while the app runs.
2. Add `uploads/` and a `manifest.json` (app version, schema version, timestamp, file list).
3. Compress into `gms-backup-YYYYMMDD-HHMMSS.zip`; compute a SHA-256 checksum; optionally encrypt.
4. Record the result in `backup_records`; apply retention.

**Restore:** validate manifest + checksum → check version compatibility → create a safety backup → pause writes → replace database and uploads → run any needed migrations → restart services → write an audit entry.

## B12. Startup and upgrade design

Startup follows REQUIREMENTS section 3: the main process takes the single-instance lock, the backend checks the database and runs migrations, and the window opens only after the backend health endpoint reports ready. On an upgrade the new version detects a lower schema version, creates an automatic backup, runs migrations in a transaction where SQLite allows, and aborts without serving requests if a migration fails, leaving the backup and clear recovery steps.

## B13. File layout on disk

```text
%LOCALAPPDATA%\GymManagementSystem\
├── db\gms.sqlite3 (+ -wal, -shm)
├── uploads\
├── backups\
├── logs\
└── config\settings.json   (no secrets in plain text)

C:\Users\<user>\AppData\Local\Programs\GymManagementSystem\   (program files; safe to replace)
  ├── GymManagementSystem.exe            (Electron)
  └── resources\                         (Next.js standalone server, native modules, assets)
```

## B14. Decisions to confirm

| # | Decision | Proposed default |
|---|---|---|
| 1 | Inclusive end dates | Yes |
| 2 | Receipt number format | `RC-YYYY-NNNNNN` |
| 3 | Data location | `%LOCALAPPDATA%` (per user) |
| 4 | Accent color | `#1F5FBF` |
| 5 | Overpayment | Not allowed |
| 6 | Grace period after expiry | Per plan, default 0 days |
| 7 | Refund approval above a threshold | Manager/Owner; amount to be set |
