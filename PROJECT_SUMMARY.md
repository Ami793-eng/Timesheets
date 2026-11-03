# Timesheet Hub: project summary and handover

A single document to start a new project or session from. It covers what the app does, how it's built, the business rules that were agreed, and what's still open.

- **App:** Timesheet Hub, a weekly timesheet and HSE form app for NAS staff (NEOC / Clinical Hub and stations).
- **Owner:** Andrew Mitchell
- **Repo:** https://github.com/Ami793-eng/Timesheets (branch `main`)
- **Live site:** https://ami793-eng.github.io/Timesheets/ (GitHub Pages: Settings → Pages → `main`, `/ (root)`)
- **State at handover:** app version `2026.11.03-4`, 37 commits, all pushed.

---

## 1. What it is

A static web app (no server, no login) that staff use on their phone:

1. **Timesheet:** fill in the week with roster pre-fill. It produces the official **NAS timesheet** (from `template.xlsx`) as a **PDF**, which is emailed to managers.
2. **Library:** every published timesheet with its history, who it was emailed to and when, and amended versions.
3. **Leave:** request leave by email, put it on the timesheets and calendar, and track annual leave hours.
4. **Forms:** fill in official **HSE HR forms** (fillable PDFs such as the HR 108 leave forms) with saved details and signature.
5. **My details:** profile, signature, roster, email recipients, leave rules, appearance and backup.

It installs to the home screen (PWA) and works offline. All data stays **on the device**.

### Where it came from
- **Original plan** (ChatGPT, PDF "Timesheet Management Web App"): Microsoft Lists / Power Apps / Power Automate with a staff register, a manager approval workflow and an archive. **Not used** for the build, but its later phases (approval workflow, shared archive, payroll export, reminders, Power BI) are still possible future directions.
- **Concrete spec** (Word doc "GitHub Timesheet Builder Conversation"): GitHub Pages app, Excel cell mapping, overtime and subsistence rules. **This is what was built**, then refined over many rounds of feedback.

---

## 2. Tech and files

| File | Purpose |
|---|---|
| `index.html` | All screens (tabs: Timesheet, Library, Forms, My details), dialogs, early theme script |
| `styles.css` | Mobile-first styling, colour themes, dark mode (`html.dark` class) |
| `app.js` | Everything except Forms: state, roster, day logic, validation, Excel fill, PDF render, email, library, appearance, PWA |
| `leave.js` | Leave tab: leave requests, timesheet pre-fill, calendar file, annual leave tracker |
| `forms.js` | Forms tab: reads and fills fillable PDFs, built-in and uploaded forms |
| `form-profiles.js`, `forms/` | Setups for each HSE form, and the bundled blank PDFs |
| `sw.js`, `manifest.webmanifest`, `icons/` | Installable app and offline support (network-first service worker) |
| `template.xlsx` | Official NAS timesheet (*New_Timesheet_Template_2025*); filled in for Excel and PDF |
| `lib/exceljs.min.js` | ExcelJS 4.4.0: reads and writes the template |
| `lib/jspdf.umd.min.js` | jsPDF 2.5.2: draws the timesheet PDF |
| `lib/pdf-lib.min.js` | pdf-lib 1.17.1: fills HSE PDF forms (loaded on demand) |
| `fonts/` | Handwriting fonts for typed signatures (open licences) |

**Storage:**
- **localStorage**, key `timesheetHub_v1`: `{ profile, currentId, sheets[], forms[] }`. Each sheet has `days[7]`, `history`, `sends`, `version`, `staff` snapshot and `rosterLine`.
- **IndexedDB** `timesheetHubForms` / `templates`: uploaded blank PDF forms.
- **Backup:** export/import JSON in My details (data is per device and browser).

**Releases:** bump the version in **both** `app.js` (`APP_VERSION`) and `index.html` (`?v=` on `styles.css`, `app.js` and `forms.js`). Otherwise phones mix cached old and new files. The version shows at the bottom of My details.

**Testing:** done with headless Chromium (Playwright) scripts at a phone viewport. They drive the app and check Excel cells (openpyxl) and PDF text and renders. The scripts lived in the session scratchpad and are **not in the repo**; worth adding a `tests/` folder in the new project.

---

## 3. Official timesheet: cell mapping (template.xlsx, sheet 1)

| What | Cell(s) |
|---|---|
| Name / Personnel Number | F2 / N2 |
| Date Week Ending (dd/mm/yyyy) | G4 |
| Station (header) | M4 |
| Employee signature (image) | C23 |
| Day rows | Roster rows 8, 10, 12, 14, 16, 18, 20 (Mon–Sun); Actual rows 9…21 |
| Date | B (roster row; real date, `dd/mm/yy`) |
| Time From / To | D / E (roster row and actual row) |
| Station Worked from | F (roster row; only on worked days) |
| Subsistence From / To / 5/10 hr / Location | G / H / I / J (roster row) |
| Overtime From / To / Reason / Notes | K / L / M (roster row) |
| On-call (N–P) | not used |

- **Words in time boxes are split:** the first word goes in From, the rest in To ("Rest | Day", "Annual | Leave", "Self-Certified | Sick Leave"). These cells shrink to fit.
- **Column M is the general notes column:** overtime reason, early-finish or late-start reasons, leave notes, Bank TOIL and shift-swap notes all go there.

---

## 4. Business rules agreed

### Roster
- **Built-in roster "Clinical Hub 16week"** (16 lines): Day 07–19, Night 19–07, Road 07–19, Rest.
- **Setting it up:** in My details, choose the base roster and a **starting week** (a week-commencing Monday) plus its line. The line for any week is calculated from that, wrapping round after line 16.
- **Road shifts** are from **Sligo, Manorhamilton or Ballyshannon**, with a "usual road base" setting or *ask each time*. Day and Night are NEOC.
- **New timesheets pre-fill** from the roster: shifts are "finished as rostered", and rest days show as a slim **"Rest Day — confirm?"** row with [✓ Rest day] [Worked (OT / TOIL)] buttons.
- **Stations and shift rules:** Sligo (any listed shift), Ballyshannon and NEOC (07/19 starts), Manorhamilton and Carrick on Shannon (08/20 starts), Other. Road shifts ignore the station start rules.

### What happened on a day (Actual)
- **Finished as rostered.**
- **Finished early:** pick how long, then a reason (Certified Sick Leave, Self-Certified Sick Leave, Force Majeure – Family Emergency, Other + note). Note in M: "Finished early 16:15 – …".
- **Extended duty:** pick how long. Overtime is filled in automatically from the rostered finish to the new finish, and the incident number is required. M: **"Ext Duty 1234567"**.
- **Comp rest / late start:** pick how long, then *Compensatory Rest* or *Late Start* (optional note). M: "Comp rest – start 10:00" or "Late start 08:30 – …".
- **Other times** and **Not worked**.
- **Leave goes under Actual, never under Rostered.** The Roster row keeps the shift times; the Actual row shows the leave. Leave types:
  - Annual Leave, Parental Leave, Self-Certified Sick Leave, Certified Sick Leave, Force Majeure
  - Study Leave, Examination Leave, Interview Leave, Marriage Leave
  - Shift Swap (note goes in M)
- **Leave + part shift / meeting:** leave type plus the time worked, which can be outside the shift. Leave hours = shift − worked. Roster shows the shift times (default), Actual shows the worked times, and M reads "Annual Leave 11h – Meeting 10:00–11:00". A tick box can show the leave in the Roster row instead.
- **Standard-day leave:** some leave pays only a standard day (default **7h 48m**). On a 12h shift the other **4h 12m** must be covered by **Annual Leave**, **TOIL** or **Worked** (default end of shift). Configurable in My details → Leave rules; Interview and Marriage leave are ticked by default. **To confirm with HR (parked).**
- **Rest day worked:** choose **Overtime** or **TOIL**.
  - **Both:** the Actual row shows the times worked, and **OT From/To always match the actual times**.
  - **Overtime:** a reason or incident number is required (e.g. "Meeting").
  - **TOIL:** M reads **"Bank TOIL"** (+ optional note).
- **Subsistence:** From/To (15-min steps), Rate (5 hr / 10 hr), Location (required), Callsign (optional, any). J reads "Location - CALLSIGN".
- **Overtime rule (general):** same start and later finish means OT from the rostered finish to the actual finish. Every overtime needs a reason or incident number, except TOIL.
- **15-minute pickers** for all times and durations.
- **"✓ Done – next day"** checks a day, folds it and opens the next shift.
- **Publishing:** unentered or unconfirmed days are recorded as Rest Day after one prompt.

### Publishing, PDF and email
- **Publish = PDF only**, a **locked** PDF:
  - It's drawn **from the filled template** (same colours, layout, logo and notes), with a small footer showing publish time, AMENDED n and roster line.
  - Lock settings: print and sign/annotate allowed; editing and copying blocked. It's a deterrent only.
- **Excel copy:** available under Library → More → *Export as Excel* (editable copy for the user's own records).
- **Recipients:** lists of **ORM**, **DCM** and **Supervisor** contacts (name + email + default tick), plus **Me** in CC.
- **Email template:**
  - Subject: `<Name> Timesheet <dd/mm/yyyy>` (+ ` AMENDED n`)
  - Body: `Hello <first names>` / `Please find timesheet attached` (+ ` - AMENDED n`) / `Kind Regards` / `<Name>`
- **Sending:**
  - **"Email with PDF attached"** uses the phone's share sheet. The PDF is pre-built when the send box opens, so the share is called directly from the tap.
  - **To/CC can't be filled by a website**, so the addresses are **copied** for the user to paste (press and hold To → Paste). There's also a "Copy addresses" button.
  - **"Open email"** (mailto) fills in the addresses but the PDF has to be attached by hand.
- **Sent log:** "Sent by email to … · date/time" on each Library card and in its History.
- **Amendments:** *Revise* makes **AMENDED 1, 2, 3…** (in the subject, body, file name and labels). The previous version is marked *superseded*.

### Forms (HSE HR forms)
- **General approach:** add any fillable PDF. Boxes are listed in page order and pre-filled from My details (surname, first name, name, personnel no, grade, department, location, email, phone, PPS, today). Each detail goes only in the **first** matching box. Manager and HR sections are grouped and left blank.
- **Signature:** drawn into the employee signature box.
- **Character limits:** values are fitted to comb boxes (dates → ddmmyyyy; PPS split into 7 digits + 2 letters), with a warning if anything doesn't fit.
- **Built-in forms** (`forms/`, set up in `FORM_PROFILES` in `form-profiles.js`): HR 108 a, c, d, e, f, g, h, i, j, k, m, n, p, q, r, s, t, u. Each has labels for every box, pre-fill, manager/HR boxes kept blank, and an employee signature position. Each lists its HSE link ("HSE ↗") to check for a newer version; an uploaded copy is recognised (by box names or PDF title) and replaces the bundled one.
- **Profile features:** `hide` (decoration boxes), `combos` (one value spread over one-character squares, e.g. HR 108(c)), `groups` (optional sections such as Maternity postponement or the Confirmation Agreement page, written only when ticked), `options` (readable radio choices), `long` (multi-line box). Auto-sized text boxes are given a normal font size.
- **Not built in yet:** HR 108(b) Anticipation of Annual Leave, HR 108(o) Special Unpaid Leave and HR 110 Nominal Pay (PDFs not supplied yet; the sandbox can't reach hse.ie); HR 108(l) Reserve Defence Forces (the PDF has no fillable boxes); HR 117 Breastfeeding Breaks (Word document).

### Look and feel
- **Tabs:** Timesheet / Library / Forms / My details.
- **Week strip:** 7 tappable day tiles (done / to do / rest / leave / needs attention).
- **Day cards:** date block and colour chips (Day amber, Night indigo, Road teal, Rest grey, Leave purple, OT orange, Subsistence blue, problems red).
- **Folded shift details:** "NEOC · Day 07:00–19:00 · 12h · Change".
- **Bottom bar:** "x/7 days done · Review & publish".
- **Themes:** Teal, NAS Green, Navy, Plum, Slate, each in Light, Dark or Match phone.

---

## 5. Open items / next steps

1. **Standard-day leave hours:** confirm with HR which leave types pay 7.8h and whether that's right (parked: "we'll come back to the hours").
2. **HSE forms:** 18 forms are built in. Still to do: get the PDFs for HR 108(b), 108(o) and HR 110 and add setups; HR 108(l) needs text placed by position (no fillable boxes); HR 117 needs a fillable PDF version. Check the filled forms on a real phone and with HR.
3. **Leave tab (`leave.js`):** request leave by email (to the workforce planning address in Leave settings), put it on the timesheets (a leave period with `kind: "request"`), add it to the calendar (.ics), and track annual leave hours per leave year (entitlement, carried over, taken, booked, left). Requests are in `state.leaveRequests`. Structured leave per **NASPO36** (`STRUCTURED_BLOCKS` in `leave.js`): leave year 1 Apr – 31 Mar; 179.4h + 78h bank holidays (10, incl. St Brigid's Day); blocks Summer 78h / Autumn 39h / Spring 39h with application windows (1 Jan – 28 Feb, 1 Jul – 31 Aug, 1 Oct – 30 Nov) and reminders; all annual leave in a season counts and a block is done at 90% (staff don't keep exactly to 39/78h). To confirm locally: the 90% rule, and whether a block must be one continuous week.
4. **Link leave days to forms:** done for Study, Examination, Interview, Marriage, Parental and Force Majeure leave (dates and days pre-filled; `leaveType` / `leaveFill` in each form setup). Leave that runs across two timesheets gives one form per week for now.
   - **The other way round:** saving an HR 108(i) Maternity or HR 108(j) Parental form records `state.leavePeriods` (`leaveRanges` in the form setup) and marks rostered shifts in those dates as leave on draft and future timesheets (`applyLeavePeriods`, `setFormLeavePeriods` in `app.js`). Leave types *Maternity Leave* and *Additional Maternity Leave* were added.
5. **Payroll confirmations:**
   - Leave on a part day: Roster row as shift times vs "Annual Leave" (currently shift times).
   - Where early-finish / late-start / leave notes go (currently column M).
   - The AMENDED wording and its position (end of subject).
6. **Real-phone checks:** the share-sheet attachment on iPhone and Android mail apps, and install to home screen.
7. **No backend:** data is on the device only (backup/export is manual). A shared archive or **manager approval workflow** would need a backend (e.g. Microsoft Lists / Power Automate, as in the original plan).
8. **Add automated tests to the repo** (Playwright scripts like those used during the build).
9. **Explainer video:** a 1m46s MP4 was made for friends (made-up person "Alex Sample"). Re-record it after big UI changes.

---

## 6. How to work on it

- **Run locally:** `python3 -m http.server 8000` in the repo, then open http://localhost:8000. Opening the file directly works but can't load the template.
- **Releases:** after changes, **bump the version** (see section 2), commit and push to `main`. GitHub Pages updates in about a minute; phones refresh to pick it up.
- **Key places in the code:**
  - `excelCells()` decides what goes in each cell for a day.
  - `fillWorksheet()` writes the template.
  - `renderWorksheetPdf()` draws the PDF.
  - `dayErrors()` holds the validation rules.
  - `ROSTERS` / `ROSTER_SHIFTS` / `ROAD_STATIONS` hold the roster data.
  - `LEAVE_TYPES`, `EARLY_REASONS`, `LATE_REASONS` hold the dropdown lists.
  - `FORM_PROFILES` holds per-form setups.
