# Branding and Bundled Assets — Empire Fitness

This document tells the development agent which images to use, **where each one goes**, and how the gym logo must appear on **every invoice and receipt**. The image files are in `assets/branding/`. Copy them into the application (see section 6); do not re-draw, recolor, or substitute them.

## 1. Gym identity (default values)

| Field | Value |
|---|---|
| Gym name | **Empire Fitness** |
| Address | Hassan Trade Building, Last Floor, Near Kabal Tehsil |
| Phone, email, city | Not provided. Leave blank; the owner enters them in the setup wizard |
| Currency | PKR (configurable) |

These are **pre-filled defaults** in the first-run wizard and in Settings → Gym. The owner can edit them. The bundled logo is the default; the owner can replace it in Settings → Gym (the replacement is stored in the data directory, never inside the program folder).

## 2. Asset inventory

All files are in `assets/branding/`.

| File | What it is | Use |
|---|---|---|
| `logo-dark-transparent.png` | Dark logo (emblem + "EMPIRE FITNESS") on transparent background | **Invoices, receipts, A4 reports, member cards, anything printed on white paper**; light UI surfaces |
| `logo-light-transparent.png` | White logo on transparent background | Dark UI surfaces: sidebar, login screen, splash |
| `logo-mark-dark-transparent.png` | Emblem only, dark | Small spaces on white: receipt header on narrow paper, favicon-style uses, watermark |
| `logo-mark-light-transparent.png` | Emblem only, white | Collapsed sidebar icon rail, dark small spaces |
| `logo-dark-bg.png` | Original logo on its dark background (black bars removed) | Splash/login background where the original look is wanted |
| `app-icon.ico`, `app-icon-512.png`, `app-icon-1024.png` | Emblem on near-black square | Windows app icon, installer/uninstaller icon, taskbar, window icon |
| `welcome-banner.jpg` | "Welcome to Empire Fitness" banner, 1280×720 | Login screen hero, first-run wizard welcome step |
| `trainer-photo.jpg` | Trainer portrait, 720×720 | Trainer profile photo (see section 4) |
| `source/` | Untouched originals as supplied (`logo.jpeg`, `tranner.jpeg`, `welcome.jpeg`) | Archive only. **Do not ship or reference them in the UI** |

**Quality note.** The supplied logo is a screenshot, so the artwork is only about 430 px wide. The transparent versions were rebuilt from it and upscaled 2×. They look sharp at normal sizes, but they do **not** gain real resolution. On A4 print keep the logo at most about **45 mm wide**; larger will look soft. Ask the owner for the original vector file (SVG/AI/PDF) or a high-resolution PNG, and drop it in as a replacement later (section 7).

## 3. Where the logo must appear

| Place | Variant | Requirement |
|---|---|---|
| **Invoices** | `logo-dark-transparent.png` | **Mandatory** on every invoice, top-left of the header (section 5) |
| **Payment receipts** (including reprints marked COPY) | dark | **Mandatory**, same header (section 5) |
| Refund / reversal slips | dark | Mandatory |
| Daily cash closing report | dark | Mandatory |
| All A4 report printouts and PDF exports | dark | Mandatory in the page header |
| Member card (printable) | dark or white-on-dark, per card design | Mandatory |
| App window title bar, taskbar, Start Menu, shortcuts | `app-icon.ico` | Mandatory |
| Installer and uninstaller | `app-icon.ico` (+ logo on installer header if supported) | Mandatory |
| Sidebar header (expanded) | `logo-light-transparent.png` | Mandatory |
| Sidebar header (collapsed icon rail) | `logo-mark-light-transparent.png` | Mandatory |
| Login screen | `logo-light-transparent.png` over a dark panel | Mandatory |
| First-run wizard (header) | light, on dark header | Mandatory |
| Help → About | dark or light, per theme | Mandatory |
| Exported support report | none (keep it plain and small) | Not needed |

## 4. Where the photos go

**`welcome-banner.jpg`**
- **Login screen:** hero image on the left half (about 55% width) with the sign-in form on the right. Keep the image's own "WELCOME TO EMPIRE FITNESS" text; do not overlay more text on it. On small windows (under about 1100 px wide) hide the hero and show only the form with the logo.
- **First-run wizard:** welcome step (step 1) uses the banner at the top.
- Not used on the dashboard, tables, or printouts.

**`trainer-photo.jpg`**
- **Trainers module:** default profile photo for the lead trainer's profile, cropped to a circle in lists and a rounded square on the profile page.
- If the owner confirms who the person is, the agent seeds one trainer profile with this photo. **The agent must not guess or invent the person's name**; the name stays blank for the owner to enter.
- Do **not** use it as a generic placeholder avatar for members or other staff. Members and staff without a photo get a neutral initials avatar.
- Optional: "Our team" card on Help → About, only if the owner asks.

**Privacy and rights.** The photos show real people and the logo is the gym's brand. Before shipping, confirm the owner has the right to use the logo and that the people shown agree to appear in the app. Photos are personal data; trainer photos should be replaceable and removable from the trainer profile.

## 5. Invoice and receipt layout (logo required)

### A4 invoice / receipt

```text
┌────────────────────────────────────────────────────────────────┐
│ [LOGO ≤ 45 mm wide]            INVOICE / PAYMENT RECEIPT       │
│                                No: RC-2026-000123   [COPY]     │
│ Empire Fitness                 Date: 16 Oct 2026, 06:42        │
│ Hassan Trade Building, Last Floor, Near Kabal Tehsil           │
│ Phone: <from settings>                                         │
│────────────────────────────────────────────────────────────────│
│ Member: Name (#M-000214)                                       │
│ Item                                  Qty   Amount             │
│ Monthly Plan                           1    Rs 5,000           │
│ Discount                                    − Rs 500           │
│ Paid (Cash)                                 Rs 3,000           │
│ Balance due                                 Rs 1,500           │
│────────────────────────────────────────────────────────────────│
│ Received by: Ayesha      Footer text / refund policy           │
└────────────────────────────────────────────────────────────────┘
```

Rules:
1. The **dark transparent logo** sits top-left in the header, with the gym name, address, and phone beneath or beside it. Keep a clear margin of at least 5 mm around it.
2. Do not stretch or recolor the logo. Preserve aspect ratio.
3. The logo appears on **every page** of multi-page reports, and on every reprint (the COPY mark is added, the logo stays).
4. The logo is embedded in the generated PDF, so a saved or emailed PDF still shows it with no internet.
5. Print must wait until the logo image has fully loaded before calling print or print-to-PDF. A receipt must never print with a missing or half-loaded logo.
6. **Fallback:** if the logo file is missing or corrupt, the receipt still prints with the gym name as text and a warning is logged. A missing logo must **never** block recording a payment or printing a receipt.
7. Address and phone come from Settings → Gym; the logo comes from Settings (custom) or the bundled default.

### Thermal (narrow-roll) receipt, if enabled

- Use `logo-mark-dark-transparent.png`, or the full logo scaled to the paper width.
- Convert to a **1-bit monochrome** bitmap with a threshold (no gray shades), at the printer's dot width (for example 384 or 576 px), centered at the top.
- Gym name and address below, in plain text.

### Tests required

- A receipt/invoice render test asserts the logo `<img>` is present and its file resolves.
- A fallback test removes the logo and asserts the receipt still renders with the gym name and no error shown to the user.
- A snapshot or visual check of the A4 receipt at 100% scale.

## 6. Where files live in the application

| In the repository | Used for |
|---|---|
| `public/branding/` (copy all PNG/JPG files from `assets/branding/` except `source/`) | UI images: sidebar, login, wizard, trainer, receipts and reports (served by the app) |
| `build/icon.ico` (copy of `app-icon.ico`) and `build/icon.png` (copy of `app-icon-512.png`) | `electron-builder` icon for the installer and the executable; Electron window icon |
| `assets/branding/source/` | Stays in the repository as an archive only |

At runtime:
- The **bundled default logo** is read-only, shipped inside the app.
- A **custom logo** uploaded in Settings is stored under `%LOCALAPPDATA%\GymManagementSystem\uploads\branding\`. Accept PNG, JPG, or SVG; limit size (for example 5 MB); validate it is a real image; never execute or inline untrusted SVG scripts (sanitize or rasterize SVG).
- If a custom logo is set it overrides the default everywhere; removing it restores the default.
- Backups include the custom logo (it is in `uploads/`).
- Logo and photos are bundled locally. **Nothing is loaded from the internet.**

## 7. Replacing the artwork later

1. Put the new files in `assets/branding/` with the same names.
2. Keep the transparent-background versions in sync (dark, light, mark-only).
3. Regenerate `app-icon.ico` (multi-size: 16, 24, 32, 48, 64, 128, 256 px).
4. Rebuild; check the receipt, sidebar, login, installer icon, and the Start Menu icon.
5. Record the change in `CHANGELOG.md`.

## 8. Brand look for the UI

Derived from the supplied images: a near-black base, white and silver type, and the electric-blue accent seen in the welcome banner.

| Token | Value | Use |
|---|---|---|
| `--brand-black` | `#0E1014` | Sidebar, login panel, app icon background |
| `--brand-white` | `#FFFFFF` | Logo on dark, text on dark |
| `--brand-silver` | `#C9CED6` | Secondary text on dark, dividers on dark |
| `--accent` | `#1F5FBF` | Primary buttons and links (matches the blue in the welcome banner; keep AA contrast) |

The wordmark is a wide, geometric sans-serif. The app text font stays `Segoe UI` for readability and offline use. Do not add the logo's typeface as a web font.
