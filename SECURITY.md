# Security Policy

## Status

The application is in the specification phase. This document defines the security assumptions the implementation must meet and how to report problems. Nothing here is a verified claim about a finished product.

## Reporting a vulnerability

- Do **not** open a public issue for a security problem.
- Send a private report to the project owner at: `<security contact to be added>`.
- Include: affected version, steps to reproduce, impact, and any logs with personal data removed.
- Expect an acknowledgement within a reasonable time and a fix plan for confirmed issues. Critical and high-severity issues block a release.

## Security assumptions

1. **Single trusted computer.** The app runs on a computer controlled by the gym owner. Someone with local administrator access or physical access to the machine, its data directory, or its backups cannot be fully defended against.
2. **Local-only service.** The Rails backend listens on `127.0.0.1` only and is not reachable from other computers. No inbound firewall ports are opened.
3. **No network sharing of the database.** The SQLite file is never shared over a network folder.
4. **Personal data.** Member records, health notes, photos, and financial history are sensitive. Access is limited by role and enforced on the server.

## Required protections

- Passwords hashed with a modern algorithm; never stored or logged in plaintext.
- Progressive delay or lockout after repeated failed logins; session timeout.
- Server-side authorization on every action; automated tests for permission boundaries.
- Protection against SQL injection, XSS, CSRF, path traversal, and unsafe uploads.
- Restricted upload types and sizes; uploads stored only in controlled directories.
- Secrets never stored in source control or logs.
- Append-only audit log for sensitive actions (see REQUIREMENTS section 23).
- Exports follow the same permissions as on-screen data; spreadsheet formula injection is prevented.
- Optional encrypted backups.
- No hidden telemetry. Any diagnostics are opt-in and disclosed.

## Recommendations for gym owners

- Use a Windows account with a strong password; do not share it.
- Enable Windows disk encryption (such as BitLocker) where available.
- Keep backups on an external drive that is stored securely; encrypt them if they leave the premises.
- Give each staff member their own login. Disable accounts when staff leave.
- Keep Windows and the application updated.

## Release gates

A release is blocked if any critical or high-severity security issue is open, if dependency advisories are unreviewed, or if permission tests fail.

## Unsigned installers

Without a code-signing certificate Windows SmartScreen may warn about the installer. Verify the published checksum instead, and never disable Windows Defender to run the installer.
