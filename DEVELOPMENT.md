# Development Guide

> The repository does not contain application code yet. Commands below are the **proposed** conventions for a standard Rails project and should be adjusted once the project is scaffolded. Read [REQUIREMENTS.md](REQUIREMENTS.md) and [DESIGN.md](DESIGN.md) first.

## 1. Prerequisites (developer machine only)

- Windows 10/11 64-bit (primary target) for packaging work; macOS/Linux are fine for pure Rails development.
- Ruby and Rails versions as pinned in `.ruby-version` and `Gemfile.lock` (**do not change versions silently**).
- Git.
- SQLite (bundled with the Ruby gem on most setups).
- Desktop-shell toolchain (Tauri prerequisites) for the `desktop/` folder.
- A clean Windows VM for installer tests.

End users never need any of these.

## 2. Setup

```bash
git clone <repository-url> gym-management
cd gym-management
bundle install
bin/rails db:setup        # create schema and seed roles, default expense categories, starter plan templates
bin/dev                   # start the app locally (loopback only)
```

Open the printed `http://127.0.0.1:<port>` address. Seeds must **not** create a default production password; in development use `bin/rails gms:dev_owner` to create a throwaway owner account (development environment only).

## 3. Project structure

```text
gym-management/
├── app/
│   ├── controllers/   # thin; authorize, call a service, render
│   ├── policies/      # all permission rules
│   ├── services/      # business workflows, each in a DB transaction
│   ├── models/
│   ├── jobs/          # idempotent scheduled work
│   └── views/
├── config/
├── db/migrate/ , seeds.rb
├── test/              # models, services, policies, controllers, integration, system
├── desktop/           # desktop shell + lifecycle manager
├── installer/         # installer config and assets
├── scripts/           # build, package, diagnostics, backup utilities
└── docs/
```

## 4. Coding conventions

1. **Money:** integer minor units or decimals only. Never `Float`.
2. **Services for workflows:** membership sale, payment, allocation, refund/reversal, check-in, cash closing, backup, restore live in `app/services`, each wrapped in a transaction.
3. **Authorization:** every controller action calls a policy. Do not rely on hidden buttons.
4. **No hard deletes** of members, payments, charges, attendance, or audit rows. Use archive, void, or reversal.
5. **Idempotency:** form submissions that create money or memberships carry a one-time token with a unique constraint.
6. **Dates:** membership calendar dates are date-only; timestamps are stored canonically and shown in the gym's timezone. Follow the date policy in DESIGN.md section B5.
7. **No hard-coded** currency, plan durations, or receipt formats.
8. **Secrets:** never in source control or logs. Never log passwords, tokens, or unneeded personal data.
9. **Migrations:** every schema change is a migration with a reversible path where possible; test against a copy of the previous release's database.
10. **Small steps:** one logical change per commit/PR; include tests and doc updates.
11. Prefer boring, well-maintained dependencies. Before adding a gem or package check maintenance, license, Windows compatibility, and security advisories, and record it in the dependency inventory.

## 5. Testing

```bash
bin/rails test                 # models, services, policies, controllers, integration
bin/rails test:system          # browser/UI tests
bin/rails db:migrate:status    # confirm migrations
```

Must be covered by automated tests before release:

- **Dates:** inclusive end dates, month-end clamping, leap years, freeze/extension math.
- **Ledger:** partial payments, allocation across charges, refunds, reversals, balance derivation, no double application.
- **Receipts:** unique numbering under concurrent requests.
- **Check-in:** allow/deny matrix, duplicate window, override with audit.
- **Authorization:** each role against each route (table-driven).
- **Backup:** create, verify checksum, reject corrupt file, restore round-trip.
- **Migrations:** fresh database and previous-release database.
- **Exports:** UTF-8 correctness and formula-injection escaping.

Report results honestly, including failures and skipped tests.

## 6. Local data during development

Development and test use separate databases. Packaged builds use `%PROGRAMDATA%\GymManagementSystem`. Never point a development run at a real gym's data directory.

## 7. Git workflow

- Branches: `main` (releasable), feature branches `feature/<short-name>`, fixes `fix/<short-name>`.
- Releases are tagged `vMAJOR.MINOR.PATCH` and built only from a tag.
- Update `CHANGELOG.md` in the same change as any user-visible behavior.

## 8. Debugging and logs

- Development logs: `log/development.log`.
- Packaged logs: `%PROGRAMDATA%\GymManagementSystem\logs` (rotated; no passwords or tokens).
- The diagnostics page shows version, database status, disk space, last backup, and can recompute ledger balances to detect inconsistencies.

## 9. Definition of done for a change

- [ ] Code, migration, and tests included and passing.
- [ ] Authorization and audit behavior covered where relevant.
- [ ] Security and data-integrity review done.
- [ ] Affected workflow exercised manually.
- [ ] Documentation and changelog updated.
- [ ] Pull request describes files changed, tests run, and remaining issues.
