# Release Checklist

Complete every item before distributing an installer. Record the date, tester, machine, and result for each section. Do not tick an item you did not actually run.

**Version:** ______  **Date:** ______  **Release owner:** ______

## 1. Code and build
- [ ] All planned changes merged; version number updated everywhere.
- [ ] `CHANGELOG.md` updated; release notes written.
- [ ] Build produced from a clean checkout using the steps in `PACKAGING.md`.
- [ ] Debug mode disabled; no secrets in the repository or build output.
- [ ] Dependency and license inventory regenerated and reviewed.
- [ ] Dependency security advisories reviewed; none critical or high unresolved.

## 2. Automated tests
- [ ] Unit/model tests pass (dates, money, ledger, permissions, receipt numbering).
- [ ] Integration tests pass (membership → payment → receipt, check-in, refund, backup/restore).
- [ ] Authorization tests pass for every role and endpoint.
- [ ] Migrations pass on a fresh database and on the previous release's database.
- [ ] Failures and skipped tests are listed in the release notes.

## 3. Clean-machine installer tests (Windows 10 and 11, 64-bit)
- [ ] Machine has no Node.js or developer tools.
- [ ] Fresh install succeeds; install path with spaces also works.
- [ ] Start Menu and optional desktop shortcuts work.
- [ ] First-run wizard creates the owner; no default password exists.
- [ ] App works with networking disabled.
- [ ] Close and reopen: no duplicate processes, no data loss.
- [ ] Reboot, then launch.
- [ ] 100%, 125%, 150% scaling at 1366×768 and 1920×1080.
- [ ] Receipt printing and PDF export.
- [ ] Interrupted install, then repair.
- [ ] No inbound firewall port opened.
- [ ] Data stored outside the installation directory.

## 4. Upgrade and uninstall
- [ ] Upgrade from the previous version keeps members, payments, settings.
- [ ] Automatic pre-migration backup was created.
- [ ] Uninstall keeps data and states where it is.
- [ ] Uninstall with explicit data removal works.
- [ ] Reinstall reconnects to retained data.

## 5. Backup and restore
- [ ] Manual and scheduled backup succeed; checksum recorded.
- [ ] Restore on a second clean environment; members, memberships, payments, attendance, attachments verified.
- [ ] Corrupt backup is rejected with a clear message.

## 6. Security
- [ ] Server bound to 127.0.0.1 only.
- [ ] Receptionist cannot reach owner-only pages by direct URL.
- [ ] Logs contain no passwords, tokens, or unnecessary personal data.
- [ ] No critical or high-severity issues open.

## 7. Documentation and artifacts
- [ ] Installation guide, user guide, backup guide, and known limitations current.
- [ ] Installer named `GymManagementSystem-Setup-<version>.exe`.
- [ ] SHA-256 checksum generated and archived with the installer.
- [ ] Installer signed (or the unsigned status and SmartScreen warning documented).

## Sign-off

| Role | Name | Date | Approved |
|---|---|---|---|
| Developer | | | ☐ |
| Tester | | | ☐ |
| Owner | | | ☐ |
