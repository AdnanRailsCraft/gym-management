# Installation Guide

> **Status:** no installer exists yet. This guide describes the intended experience and will be finalized after the Phase 0 prototype and clean-machine tests pass. Steps marked *(confirm)* may change.

## 1. Before you begin

You need:

- A Windows 10 or 11 **64-bit** PC or laptop.
- The installer file, for example `GymManagementSystem-Setup-1.0.0.exe`.
- About *(to be measured)* of free disk space.
- Permission to install software (administrator rights are needed once, for the all-users install).

You do **not** need internet access, Ruby, Node.js, a database server, or a web browser.

**Recommended:** verify the file before running it. Compare the SHA-256 checksum shown on the release notes with the checksum of your download:

```powershell
Get-FileHash .\GymManagementSystem-Setup-1.0.0.exe -Algorithm SHA256
```

## 2. Install

1. Double-click the installer.
2. If Windows SmartScreen warns that the publisher is unknown, this is expected for an **unsigned** build. Only continue if you got the file from a source you trust **and** the checksum matches. Do not disable Windows Defender.
3. Accept the license and choose an install location (the default is fine; spaces in the path are supported).
4. Choose whether to create a desktop shortcut.
5. Click **Install**, then **Finish**. Leave "Launch Gym Management System" ticked.

By default the app installs **for all users** (per-machine) and needs administrator rights once at install time. The running app itself never needs elevation.

## 3. First launch and setup

The first start shows a setup wizard:

1. **Gym details:** name, address, phone (optional), logo (optional).
2. **Currency and time zone:** default currency is PKR; change if needed.
3. **Receipts:** header and footer text.
4. **Starter plans:** tick any templates you want (monthly, quarterly, etc.); you can edit them later.
5. **Owner account:** your name, username or email, and a strong password. Write the password down and keep it safe; there is no default password and no way to recover it without another administrator.
6. **Backups:** choose a backup folder (an external drive is best) and reminder preference.
7. **Demo data (optional):** load sample members to practice. It can be removed later from Settings.

## 4. Where things are stored

| Item | Location |
|---|---|
| Program files | `%ProgramFiles%\GymManagementSystem` |
| Data (database, uploads, logs) | `%PROGRAMDATA%\GymManagementSystem` |
| Backups | The folder you chose in setup |

Your data is kept **separate** from the program so upgrades and uninstalls do not erase it.

## 5. Daily use

Start the app from the Start Menu or desktop shortcut. Closing the window shuts the app and its background service down safely. Only one copy can run at a time; opening it again brings the existing window forward.

## 6. Upgrading

1. Close the app.
2. Run the newer installer. It installs over the existing version.
3. On first launch the app **backs up your data automatically**, then updates the database. Do not close it during this step.
4. Check Help → About for the new version.

Upgrading never deletes your data. If an update fails, the app will not open your data in a half-updated state; see [BACKUP_RESTORE.md](BACKUP_RESTORE.md) for recovery.

## 7. Uninstalling

1. Windows Settings → Apps → Installed apps → *Gym Management System* → Uninstall.
2. The uninstaller asks whether to **keep** or **delete** your data. Keep is the default.
3. If you keep your data, a later reinstall reconnects to it. To remove everything, choose delete, and also remove your backup folder yourself if you no longer need it.

## 8. Troubleshooting

| Problem | What to try |
|---|---|
| The app window does not open | Wait up to a minute on first launch; then reopen. Use Help → Export support report, or open the logs folder (`%PROGRAMDATA%\GymManagementSystem\logs`) |
| "Another copy is already running" | Look for the app in the taskbar or system tray; if none, restart the PC |
| SmartScreen warning | Expected for unsigned builds; verify the checksum (section 1) |
| "Port in use" | The app picks a free port automatically; if the error persists, restart the PC and send the support report |
| Startup says a database update failed | Do not retry repeatedly. Send the support report and follow [BACKUP_RESTORE.md](BACKUP_RESTORE.md) |
| Printer not found | Check it appears in Windows Settings → Printers; or use **Save as PDF** |
| Forgot owner password | Another Owner account can reset it; otherwise contact the developer for the documented recovery procedure *(to be defined)* |

If you contact support, attach the **support report** (it redacts personal data and secrets).
