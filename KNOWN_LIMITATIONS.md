# Known Limitations

An honest list of what version 1 does and does not do. Update it every release.

## Scope

- **One gym, one primary PC.** No multi-branch support and no live sharing between PCs.
- **No cloud sync.** Data lives on the local computer; backups are the owner's responsibility.
- **No online payments.** Cash, bank transfer, and card-terminal payments are recorded manually. The app does not process or confirm card payments.
- **No mobile app and no member self-service portal.**
- **No biometric or turnstile integration.**
- **Messaging (email, SMS, WhatsApp) is not part of version 1.**

## Accounting

- This is an **operations ledger**, not double-entry accounting software.
- Reports are labeled operational and are not tax filings. Do not rely on them for tax compliance without professional review.
- "Net operating result" is recorded income minus recorded expenses and ignores accruals, depreciation, and tax.

## Technical

- SQLite supports one active writer at a time. This is fine for one reception PC but is not suited to several PCs writing at once.
- The Rails-in-a-desktop-shell design is unproven until Phase 0 passes. A fallback to a native .NET build exists if it fails.
- Unsigned builds trigger Windows SmartScreen warnings.
- A user with local Windows administrator access can read or alter the data files directly.
- Scheduled backups and reminders only run while the application is open; missed jobs catch up when it next starts.
- Performance figures are targets, not measured results, until tested on reference hardware.

## Optional modules

Workout plans, classes, equipment, payroll, and fitness measurements may be absent from version 1. Check the release notes for what shipped.

## Data

- Members with financial or attendance history are archived, not deleted. Permanent erasure requires an authorized privacy workflow.
- Restoring a backup replaces current data; changes made after the backup was taken are lost (a safety backup of the current data is created first).
