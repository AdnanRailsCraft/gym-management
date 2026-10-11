# Gym Management System (GMS)

A Windows desktop application for running a single gym: members, memberships, attendance, payments, expenses, receipts, reports, and backups. It installs from a normal `.exe`, runs offline, and keeps its data on the owner's own computer.

> **Project status: specification phase.** Nothing in this repository has been built or tested yet. Every statement below describes the **intended** product. No claim about installation, offline use, security, or compatibility is verified until the Phase 0 prototype passes on a clean Windows machine (see [PACKAGING.md](docs/PACKAGING.md)).

## Key features (planned for version 1)

- Member registration, search, archive, and printable member cards.
- Configurable membership plans, renewals, freezes, and full history.
- Reception check-in with clear allowed/denied results and audited overrides.
- Ledger-based payments: partial payments, receipts, refunds and reversals that never erase history.
- Daily cash closing, expenses, and operational income/expense reports.
- Role-based access: Owner, Manager, Receptionist, Accountant, Trainer, Auditor.
- Backup and restore from inside the app; audit log of sensitive actions.
- Optional modules after the core passes: trainers, workout plans, classes, equipment, payroll.

## Architecture at a glance

| Layer | Choice |
|---|---|
| Desktop shell | Tauri (or another maintained Windows wrapper) |
| Backend | Ruby on Rails, run locally and bound to `127.0.0.1` only |
| Database | SQLite (single-PC edition) |
| Installer | Windows `.exe` built by the chosen packaging tool |
| Fallback | .NET + SQLite if the Rails packaging prototype fails |

Only **one PC** uses a given database. If several PCs must share live data, a different server-based design is required. See [DESIGN.md](docs/DESIGN.md) and [REQUIREMENTS.md](docs/REQUIREMENTS.md) section 2.4.

## Documentation

| Document | Purpose |
|---|---|
| [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) | Full product and technical requirements |
| [docs/DESIGN.md](docs/DESIGN.md) | UI and system design |
| [docs/INSTALLATION.md](docs/INSTALLATION.md) | Install, first launch, upgrade, uninstall |
| [docs/USER_GUIDE.md](docs/USER_GUIDE.md) | Day-to-day use by role |
| [docs/BACKUP_RESTORE.md](docs/BACKUP_RESTORE.md) | Backups, restore, recovery |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Developer setup, conventions, tests |
| [docs/PACKAGING.md](docs/PACKAGING.md) | Building the Windows installer |
| [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md) | Pre-release sign-off |
| [docs/KNOWN_LIMITATIONS.md](docs/KNOWN_LIMITATIONS.md) | Honest list of limits |
| [SECURITY.md](SECURITY.md) | Security assumptions and reporting |
| [CHANGELOG.md](CHANGELOG.md) | Version history |

## Getting started (developers)

1. Read [REQUIREMENTS.md](docs/REQUIREMENTS.md), then [DESIGN.md](docs/DESIGN.md).
2. Complete **Phase 0** (packaging prototype) before building features.
3. Follow [DEVELOPMENT.md](docs/DEVELOPMENT.md) for the local setup.

## Getting started (gym owners)

When a release exists, follow [INSTALLATION.md](docs/INSTALLATION.md). No programming tools or database knowledge are needed.

## License

To be decided. A dependency and license inventory is a required release deliverable.
