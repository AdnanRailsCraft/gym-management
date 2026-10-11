# User Guide

A plain-language guide for gym staff. Screens and wording may change slightly before release.

## 1. Signing in

Open the app, type your username and password, and click **Sign in**. After several wrong attempts the app makes you wait before trying again. You are signed out automatically after a period of inactivity. Always click your name → **Sign out** when leaving the desk.

What you see depends on your role. If a menu item is missing, your role does not include it.

## 2. Roles at a glance

| Role | Main job |
|---|---|
| Owner | Everything, including settings, users, backups, restore |
| Manager | Daily operations, approvals, overrides |
| Receptionist | Members, check-in, selling/renewing, taking payments |
| Accountant | Payments, expenses, cash closing, financial reports |
| Trainer | Assigned members and their workout plans |
| Auditor | View-only |

---

## 3. Receptionist

### Register a new member
1. **Members → Add Member**.
2. Enter full name and at least one phone or email. Fill optional fields only if you need them.
3. If the app warns about a possible duplicate, check the existing member before continuing.
4. **Save**. The member gets a number such as `M-000214`.
5. Optionally **Print member card**.

### Sell or renew a membership
1. Open the member → **Start membership** (or **Renew**).
2. Choose the plan and start date.
3. Add a discount only if allowed, with a reason.
4. Check the summary (final charge and end date).
5. Enter the payment now if the member is paying (amount, method, reference for transfers).
6. **Confirm**, then **Print receipt**. Click Confirm only once; the button locks after the first click.

### Take a payment later
Open the member → **Record payment**. Enter the amount (it may be less than the balance). The remaining balance updates. Print the receipt.

### Check a member in
1. Open **Attendance → Check-in**. The search box is ready.
2. Type or scan the member number, name, or phone. Press **Enter**.
3. Read the result:
   - **Allowed:** press **Check In**.
   - **Denied:** the reason is shown (for example, expired). Offer **Renew**. Only a Manager or Owner can **Override**, and a reason is required.
4. A repeat check-in within a few minutes shows a notice instead of a second entry.

### Close the day (if assigned)
**Payments → Daily Cash Closing**: enter the cash you counted. If it differs from the expected amount, write an explanation, then **Close day**.

---

## 4. Manager

- **Overrides:** when check-in is denied, choose Override, enter a clear reason, confirm. It is logged.
- **Extend or adjust a membership:** open the membership → **Extend**, enter days and a reason.
- **Freeze / unfreeze:** open the membership → **Freeze**, choose dates (within the plan's rules).
- **Approve expenses and refunds** within your limit; larger amounts go to the Owner.
- **Reports:** Reports menu → choose a report → set dates → **Print**, **CSV**, or **PDF**.

---

## 5. Accountant

### Record an expense
**Expenses → New Expense**: date, category, amount, method, payee, notes; attach a receipt photo or PDF if you have one. Save.

### Correct a payment
Payments are never edited or deleted. Open the payment → **Reverse / Refund**, choose full or partial, enter the reason. A linked reversal record is created and the original stays visible.

### Reports
Daily collections, collections by method and staff, outstanding balances, expenses by category, and income vs. expenses. These are **operational** reports, not tax filings.

---

## 6. Trainer

- **My members:** only members assigned to you appear.
- **Workout plan:** open a member → Workout plans → New plan; add days and exercises with sets, reps, weight, and rest; **Print** a sheet.
- **Log a session:** record what was actually performed and add notes.
- Do not store medical diagnoses. Health notes are limited to what is needed for safe training and are visible only to authorized staff.

---

## 7. Owner

### Staff and roles
**Settings → Users**: add a user, choose a role, set a temporary password, require a change at first login. To remove access, **Disable** the account; their history stays.

### Plans and prices
**Membership Plans**: add or edit name, duration, price, joining fee, freeze rules. Changing a price affects **future** sales only.

### Backups
**Backup and Restore → Back Up Now.** Check "Last successful backup" regularly. See [BACKUP_RESTORE.md](BACKUP_RESTORE.md).

### Audit log
**Audit Log** shows who did what and when. It cannot be edited.

---

## 8. Everyday tips

- Search is global: press `Ctrl+K` from anywhere.
- Never share logins. Every action is recorded under the signed-in user.
- Members with a balance show it in the member list; filter by "has balance" to follow up.
- Archive a member who left; do not look for a delete button, history must be kept.
- If something looks wrong, note the **error reference ID** shown on screen and report it.

## 9. Glossary

| Term | Meaning |
|---|---|
| Membership | A plan period bought by a member (start and end dates) |
| Charge | An amount the member owes |
| Payment | Money received; can be partial |
| Balance | Charges not yet covered by payments |
| Reversal / refund | A recorded correction that keeps the original visible |
| Override | Allowing something normally blocked, with a reason, by an authorized person |
| Freeze | Pausing a membership and extending its end date by the paused days |
