# Backup and Restore Guide

> Describes the intended behavior. It becomes authoritative only after backup and restore have passed the clean-machine tests in the [Release Checklist](RELEASE_CHECKLIST.md).

## 1. Why backups matter

All gym data lives on one computer. If the disk fails, the laptop is lost, or a file is damaged, a recent backup is the only way back. **Keep at least one backup on a different device** (an external drive or another PC), not only on the same laptop.

## 2. What a backup contains

- The full database (members, memberships, payments, attendance, expenses, settings, audit log).
- Uploaded files (member photos, expense attachments).
- A manifest with the app version, database version, date, and file list, plus a checksum.

Backups contain personal and financial data. Store them securely and consider encryption.

## 3. Making a backup

### Manual
**Backup and Restore → Back Up Now.** Wait for "Backup completed". The new file appears in the list with its date, size, and result.

### Scheduled
**Settings → Backup:** choose frequency (daily recommended), time, destination folder, and how many to keep (for example, 7 daily and 4 weekly). Scheduled backups run **only while the app is open**; if a backup was missed, the app runs it at next start and warns you. Many gyms should also make a manual backup at closing time.

### Encryption (optional)
Turn on **Encrypt backups** and set a passphrase. **Write the passphrase down and store it separately.** A lost passphrase means the backup cannot be opened.

### Good habits
- Back up at closing time and before any software update.
- Copy the backup folder to an external drive weekly.
- Test a restore at least every few months.

## 4. Restoring

> **Restore replaces your current data** with the backup's contents. Anything entered after that backup was made will be lost, except for the safety copy described below.

Only an Owner can restore.

1. Close any other open windows and make sure no one else is using the app.
2. **Backup and Restore → Restore**, then select a backup (or browse to one on an external drive).
3. The app shows the backup's date, app version, and database version, and **verifies its integrity**. If verification fails, do not continue; choose another backup.
4. Read the warning and type the confirmation word when asked.
5. The app creates a **safety backup of the current data first**.
6. It pauses all activity, replaces the data, applies any needed upgrades, and restarts its services. A progress bar is shown; do not turn the PC off.
7. When complete, check recent members, today's payments, and the latest receipt number.
8. The restore is recorded in the audit log.

### Restoring onto a new computer
1. Install the application (see [INSTALLATION.md](INSTALLATION.md)); use the same or a newer version than the backup.
2. At the setup wizard, choose **Restore from backup** if offered; otherwise finish setup and use Backup and Restore → Restore.
3. Select the backup file, enter the passphrase if encrypted, and follow steps 3–8 above.

## 5. If something goes wrong

| Situation | Action |
|---|---|
| Restore fails verification | Choose another backup; do not force it |
| Restore stops partway | Do not close repeatedly. Restart the app; it will detect the incomplete restore and offer to roll back to the safety backup |
| App won't open after an update | The app made a backup before updating. Reinstall the previous version, then restore that backup |
| Disk is full | Free space, or choose another backup destination, then retry |
| Backup shows "failed" | Open the logs folder and use Export support report |
| Encrypted backup, lost passphrase | The data cannot be recovered from that backup; use an older unencrypted or known-passphrase backup |

The safety backup is stored in the backup folder with `pre-restore` in its name. Keep it until you have confirmed the restored data is correct.

## 6. Manual recovery (support use)

If the application cannot start at all, a technician can recover data from the folders in section 7 without the app:

1. Close the app completely.
2. Copy the entire data folder to a safe place.
3. Reinstall the app, then restore a backup through the interface.

Do not edit database files by hand.

## 7. File locations

| Item | Default location |
|---|---|
| Live data | `%LOCALAPPDATA%\GymManagementSystem` |
| Backups | The folder chosen in setup (Settings → Backup) |
| Logs | `%LOCALAPPDATA%\GymManagementSystem\logs` |

## 8. Acceptance test (developers and testers)

1. Load sample data: members, memberships, payments, attendance, an attachment.
2. Make a backup.
3. On a clean machine or empty data directory, install the app.
4. Restore the backup.
5. Verify counts and totals match, receipts keep their numbers, attachments open, and the audit log contains the restore entry.
6. Repeat with an encrypted backup and with a deliberately corrupted file (must be rejected).
