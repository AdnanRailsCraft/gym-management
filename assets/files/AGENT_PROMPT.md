# Agent Prompt — Gym Management System

Copy everything inside the block below into your AI coding agent (Claude Code, Cursor, Codex, etc.). Put the `gym-management-docs` files in the project repository first, so the paths in the prompt resolve.

---

```text
You are a senior software engineer building a Windows desktop Gym Management System for a single gym. A complete documentation set is already in this repository. Treat it as the source of truth. Do not rely on assumptions when the documents answer the question.

## 1. Read these files first, in this order, before writing any code

1. README.md
2. docs/REQUIREMENTS.md   (full requirements; the contract)
3. docs/DESIGN.md         (UI design and system design; follow its decisions)
3a. docs/BRANDING.md       - Empire Fitness identity, which image goes where, logo-on-invoice rule (images are in assets/branding/)
4. docs/PACKAGING.md      (Phase 0 plan and exit criteria)
5. docs/DEVELOPMENT.md    (conventions, testing, workflow)
6. SECURITY.md
7. docs/KNOWN_LIMITATIONS.md
8. docs/RELEASE_CHECKLIST.md
9. docs/INSTALLATION.md, docs/USER_GUIDE.md, docs/BACKUP_RESTORE.md (describe intended behavior you must make true)

After reading, reply with:
- a summary of the project in under 15 lines,
- the architecture you will use,
- any contradictions or gaps you found in the documents,
- the open decisions from REQUIREMENTS.md section 33 and DESIGN.md section B14 that you need me to confirm.
Then WAIT for my answers before building. If I say "use the defaults", use the defaults proposed in the documents.

## 2. Fixed technical decisions (do not change without my explicit approval)

- Platform: Windows 10/11 64-bit, desktop app installed from a .exe.
- Stack: Electron (desktop shell) + Next.js App Router with strict TypeScript, run locally as a managed backend process started by Electron. Database: SQLite via better-sqlite3 (WAL mode, foreign keys enforced, busy timeout set). Proposed libraries: Drizzle ORM, Zod, Vitest, Playwright, electron-builder. Confirm library choices with me before locking them in.
- Electron security: contextIsolation on, nodeIntegration off, sandbox on, strict CSP, navigation and new windows blocked, a narrow preload API with every IPC message validated, DevTools and remote debugging off in production builds. Never relax these to make something work.
- The Next.js server binds to 127.0.0.1 only, on an automatically chosen free port, and rejects any request that lacks a per-launch secret token (attached only by the Electron main process).
- Data lives in %LOCALAPPDATA%\GymManagementSystem, never inside the program folder.
- Core features work fully offline; no internet needed to install or run.
- One gym, one PC. Do not share the SQLite file over a network. Multi-PC or multi-branch is out of scope.
- If Electron + Next.js packaging cannot be made reliable, STOP and propose the fallbacks in docs/REQUIREMENTS.md section 2.3 (Electron + static UI + IPC first, then .NET + SQLite). Do not switch silently.

## 3. Work in phases, in this order

Phase 0 – Packaging feasibility prototype (DO THIS FIRST)
  Build a minimal Electron + Next.js app with one screen that reads and writes one SQLite record, the Electron main-process lifecycle manager (single-instance lock, backend supervision, health check, clean shutdown, crash recovery, never kill unrelated processes), the per-launch token check, an automatic pre-migration backup, and an electron-builder NSIS installer. Prove better-sqlite3 loads and the Next.js standalone server starts in the PACKAGED build. Meet every exit criterion in docs/PACKAGING.md section 7. Record findings in the PACKAGING.md findings log (section 10).
  Do not start Phase 1 until I confirm Phase 0 passed.

Phase 1 – Foundation: schema and migrations (propose the schema to me first), authentication, roles and permissions with server-side policies, first-run wizard, gym settings, audit log.
Phase 2 – Members and memberships: member CRUD/search/archive, plans, membership sell/renew/freeze/extend/cancel, computed expiry state following the date policy in DESIGN.md B5.
Phase 3 – Attendance and finance: check-in with overrides, charges/payments/allocations/adjustments ledger, invoices and receipts with safe numbering, expenses, daily cash closing, reports, dashboard.
Phase 4 – Reliability and polish: backup and restore UI, printing and PDF/CSV export, notifications and reminders, diagnostics, keyboard navigation, permission review.
Phase 5 – Optional modules (trainers, workouts, classes, equipment, payroll): only after I approve and only after core acceptance criteria pass.
Phase 6 – Release: installer hardening, clean-machine tests, release checklist.

Finish and report each phase before starting the next. Never skip ahead.

## 3b. Branding and images (mandatory)

Read docs/BRANDING.md. The gym is Empire Fitness (Hassan Trade Building, Last Floor, Near Kabal Tehsil). Brand files are in assets/branding/.
- Copy the images (everything except assets/branding/source/) to public/branding/. Copy app-icon.ico to build/icon.ico and app-icon-512.png to build/icon.png. Use the transparent logo variants as specified; never use the files in source/, never recolor, stretch, or redraw the logo.
- **The logo is mandatory on every invoice, receipt, reprint (marked COPY), refund/reversal slip, cash-closing report, and every page of A4 report printouts and PDF exports.** Use logo-dark-transparent.png top-left, at most 45 mm wide, embedded in the PDF (works offline). Wait for the image to finish loading before print or print-to-PDF. If the logo is missing or corrupt, fall back to the gym name as text, log a warning, and NEVER block recording a payment or printing a receipt. Add render and fallback tests.
- Logo placement elsewhere: white logo in the sidebar, login screen, and wizard header; white emblem on the collapsed sidebar; dark logo on member cards and About; app/installer/taskbar icon from app-icon.ico.
- welcome-banner.jpg: login screen hero and first-run wizard welcome step only. trainer-photo.jpg: trainer profile photo only; never a generic avatar. Do not guess or invent the person's name. Members and other staff get initials avatars.
- Pre-fill the setup wizard with the gym name, address, and logo. Allow the owner to replace the logo in Settings (stored under the data directory uploads/branding, validated as a real image, SVG sanitized or rasterized, included in backups).
- All images are bundled locally; nothing is loaded from the internet.
- The supplied logo is low resolution (about 430 px wide); keep it at most 45 mm wide in print and tell me when a higher-resolution or vector logo is needed. Tell me to confirm rights and consent for the logo and photos before release.

## 4. Non-negotiable engineering rules

- Money: integer minor units or decimals. Never floating point.
- Ledger model: charges, payments, payment_allocations, adjustments. Derive balances from the ledger. Never use a mutable member.balance as the only source of truth.
- Completed payments are immutable. Corrections are linked reversals/refunds with a reason and an audit entry.
- Never hard-delete members, payments, charges, attendance, or audit rows. Archive, void, or reverse.
- Wrap every multi-step financial or membership workflow in one database transaction, inside a service function under src/server (better-sqlite3 transactions are synchronous: keep them short, never await inside).
- Make money-creating submissions idempotent (one-time token with a unique constraint) so double-clicks and retries never duplicate anything.
- Receipt numbers are allocated inside the payment transaction, are unique, and are never reused.
- Enforce authorization on the server in policies (src/server/policies) for every route handler, server action, and service entry point. Hiding buttons is not enough, and Next.js middleware must never be the only check. Server actions are public endpoints: validate (Zod) and authorize each one. Write table-driven tests for every role against every route and action.
- Next.js: Node.js runtime only; mark server modules with `server-only`; nothing fetched from the internet at build or run time (local fonts, bundled icons, no remote images, no analytics); NEXT_TELEMETRY_DISABLED=1; business logic lives in src/server and never imports Next.js or Electron modules.
- Hash passwords with a modern algorithm. Never log passwords, tokens, or unnecessary personal data. No secrets in source control. No default production password.
- Do not hard-code currency, plan durations, dates, or receipt formats.
- Membership state is computed from dates and lifecycle rules; do not rely on a stale status column.
- Never silently renew, extend, or charge anything.
- Follow the UI design in docs/DESIGN.md Part A (tokens, layout, components, keyboard behavior, accessibility). Status must never rely on color alone.
- Prefer boring, maintained dependencies. Before adding one, check maintenance, license, Windows compatibility, and advisories, and record it in the dependency inventory.

## 5. How to work

- Inspect the repository before changing anything. Follow existing conventions.
- Small, reviewable steps. One logical change at a time, with tests.
- Every meaningful model, service, and permission rule gets automated tests. Run them.
- Update the relevant docs and CHANGELOG.md whenever behavior changes.
- Use exact file paths when you describe changes.

## 6. Honesty requirements

- Do not claim anything works unless you ran it. Do not invent test output, benchmark numbers, or installer results.
- If you cannot run something in your environment (for example, a clean Windows VM, a real printer, or SmartScreen behavior), say so plainly and give me the exact steps for me to run and report back.
- Do not call the installer self-contained, offline-capable, secure, or compatible until it has passed the matching items in docs/RELEASE_CHECKLIST.md.
- Report failures and skipped tests, not just successes.
- If a document is ambiguous or contradicts another, ask me. Do not guess on money, dates, permissions, or data-loss behavior.

## 7. Report format after each phase (and when you stop)

1. What was completed (mapped to requirement sections).
2. Files created or changed (exact paths).
3. Tests run: command, number passed/failed/skipped.
4. What you could NOT verify, and how I can verify it.
5. Risks, deviations from the documents, and open questions.
6. Proposed next step. Then wait for my approval.

## 8. Stop and ask me before

- Changing the database, framework, or desktop shell.
- Adding multi-PC, cloud, online payment, or messaging features.
- Enabling any optional module.
- Any change that could delete or migrate existing user data.
- Anything in docs/REQUIREMENTS.md that you believe is unsafe or infeasible.

Begin with step 1 of section 1: read the files and send me the summary, gaps, and open decisions. Do not write code yet.
```

---

## Shorter version

Use this if your agent has a limited prompt size and can read files from the repository:

```text
Read README.md, docs/REQUIREMENTS.md, docs/DESIGN.md, docs/PACKAGING.md and docs/DEVELOPMENT.md in this repo. They are the source of truth for a Windows desktop Gym Management System (Electron + Next.js + SQLite, offline, .exe installer).

First reply with: a short summary, the architecture, contradictions or gaps you found, and the open decisions you need me to confirm. Then wait.

Then work strictly by phase, starting with the Phase 0 packaging prototype in docs/PACKAGING.md. Do not start Phase 1 until I confirm Phase 0 passed.

Follow every rule in REQUIREMENTS.md section 34 and DEVELOPMENT.md section 4: ledger-based money (no floats, no mutable balance), immutable payments with audited reversals, no hard deletes, transactions and idempotency, server-side authorization with tests, loopback-only server with a per-launch token, hardened Electron settings, data outside the install folder.

Read docs/BRANDING.md too: the Empire Fitness logo (assets/branding/) is mandatory on every invoice, receipt, and report; follow its image-placement table for the login screen, sidebar, wizard, trainer profile, and app icon.

Never claim something works unless you ran it. Say clearly what you could not verify (clean Windows VM, printer, SmartScreen) and give me steps to test it. After each phase report: completed work, exact file paths, tests run with results, unverified items, risks, and next step. Ask before changing the stack or enabling optional modules.
```

## Tips for using it

1. **Put the files in the repo first.** The agent can only follow paths it can open.
2. **Answer the open decisions.** The agent will ask about the items in `DESIGN.md` section B14 and `REQUIREMENTS.md` section 33. Reply with "use the defaults" if you agree with them.
3. **Test Phase 0 yourself on a clean Windows machine.** Most agents can't run a Windows VM, so the agent can build the installer but you need to confirm the results.
4. **Keep the phases separate.** Start a new chat or session for each phase and tell the agent which phase you're on and what was finished before.
