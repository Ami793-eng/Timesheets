# Timesheet Hub: project summary and handover

A single document to start a new project or session from. It covers what the app does, how it's built, the business rules that were agreed, and what's still open.

- **App:** Timesheet Hub, a weekly timesheet, leave and HSE form app for NAS staff (NEOC / Clinical Hub and stations).
- **Owner:** Andrew Mitchell
- **Repo:** https://github.com/Ami793-eng/Timesheets (branch `main`)
- **Live site:** https://ami793-eng.github.io/Timesheets/ (GitHub Pages: Settings → Pages → `main`, `/ (root)`)
- **State at handover:** app version `2026.11.08-1` (pull requests #1–#5 merged and live; #6 adds Parent's Leave week blocks, shift swaps and the Records tab).
- **Videos:** a **30-second highlight reel** [`media/timesheet-hub-highlights.mp4`](media/timesheet-hub-highlights.mp4) and the **2½-minute explainer** [`media/timesheet-hub-explainer.mp4`](media/timesheet-hub-explainer.mp4), both on the live site under https://ami793-eng.github.io/Timesheets/media/ (see section 6).

---

## Highlights

The five things that make the app more than a timesheet form:

### 1. Timesheets that fill themselves in from your roster
- **Fixed rolling roster:** pick *Clinical Hub 16week*, a starting week and its line once. Every new timesheet arrives with the week's shifts already in (Day 07–19, Night 19–07, Road 07–19) and rest days ready to confirm with one tap.
- **Non-rostered staff:** choose how often you get shifts (**1, 2, 4 or 8 weeks**) and enter them when they arrive: station first, then a shift from **that station's own list** (e.g. Sligo nights 19:00, 20:00 or 21:00). When the entered shifts run out, the app asks for the next lot before you start a timesheet.
- **Leave is already on it:** annual leave you've booked and leave from maternity / parental forms is put on the timesheet automatically, by date.
- You still confirm what actually happened each day (finished early, extended duty, overtime, subsistence…).

### 2. Forms linked to the dates in your timesheets — both ways
- **Timesheet → form:** a day of Study, Examination, Interview, Marriage, Parental, Parent's or Force Majeure leave shows **"Fill in the form"** with the right HSE form. It opens with your details, the leave's **from / to dates and number of days** already filled in (consecutive leave days count as one stretch; **Parent's Leave is a week block**, so HR 108(t) gets the whole 7 days in *Week one*). Afterwards the day shows *Filled in* or *Sent dd/mm*, and the button reopens that form.
- **Form → timesheets:** saving an **HR 108(i) Maternity**, **HR 108(j) Parental** or **HR 108(t) Parent's Leave** form (each week) puts its dates on your timesheets: every rostered shift in them becomes *Maternity Leave*, *Additional Maternity Leave*, *Parental Leave* or *Parent's Leave*, on drafts now and on timesheets you start later.
- **18 official HSE forms built in**, each set up box by box, signed with your signature.

### 3. Annual leave tracker
- Follows NAS policy **NASPO36**: leave year 1 April – 31 March; entitlement = **179.4h** annual leave (187.2h for some pre-2007 staff) + **78h** for 10 bank holidays (incl. St Brigid's Day) + hours carried over.
- Shows **taken, booked, left and waiting for approval**, with a bar.
- **Structured leave blocks:** Summer 2 weeks, Autumn 1 week, Spring 1 week. A block week is any 7 days in a row (Mon–Sun, Fri–Thu…) with every rostered shift on annual leave; summer's weeks can be separate. Blocks show *Apply now*, *Done*, *Overdue*…
- **Reminders:** a red dot on the Leave tab and a "Book your … leave" card while a block's application window is open (Summer 1 Jan – 28 Feb, Autumn 1 Jul – 31 Aug, Spring 1 Oct – 30 Nov).

### 4. Leave booker
- **Request leave** in the app: type, dates, note. It lists your rostered shifts and works out the hours (non-rostered staff without shifts yet: each day counts as a fixed **12h leave day**).
- One tap opens a **pre-written email** to workforce planning, and the leave goes **onto your timesheets** for those weeks.
- Mark it **Approved** or **Declined**; **Cancel leave** sends a cancellation email and takes it off; **Add to calendar** gives a calendar file.

### 5. The email system: pre-written emails
Every email is written for you; you just send it.

| Email | Subject | Body |
|---|---|---|
| **Timesheet** | `Andrew Mitchell Timesheet 15/11/2026` (+ ` AMENDED n`) | Hello <first names> / Please find timesheet attached / Kind Regards / <Name> |
| **Leave request** | `Andrew Mitchell Annual Leave 12/12/2026` (or a date range) | Hello / I would like to request Annual Leave for the following: / each shift with times and hours / Total: 36h / note / Kind Regards / <Name> / Personnel No |
| **Leave cancellation** | same, ending ` - CANCELLATION` | I would like to cancel my Annual Leave for the following: … |
| **HSE form** | `Andrew Mitchell Parent's Leave Nov 26` (month the leave starts) | Hello / Please find Parent's Leave application attached for 9/11/26 – 15/11/26. / Regards / <Name> |

- Timesheets and forms go through the phone's **share sheet with the PDF attached**; recipients (ORM, DCM, Supervisor, Me) are copied ready to paste. Leave emails open the mail app with **To, CC, subject and body filled in**.
- Every send is logged (Records history, filled forms, leave requests).

---

## 1. What it is

A static web app (no server, no login) that staff use on their phone:

1. **Timesheet:** the week, pre-filled from the roster. Produces the official **NAS timesheet** (from `template.xlsx`) as a locked **PDF**, emailed to managers.
2. **Records** (was Library): **Timesheets** (published timesheets, history, sends, amended versions), **Forms** (filled HSE forms) and **Swaps** (I owe / Owed to me / completed), with a badge for open swaps.
3. **Leave:** book leave by email, put it on the timesheets and calendar, track annual leave hours and the structured leave blocks.
4. **Forms:** the official **HSE HR forms** (18 built in), filled with saved details and signature, linked to timesheet leave.
5. **My details:** profile, signature, roster (fixed or non-rostered), email recipients, leave rules, appearance and backup.

It installs to the home screen (PWA) and works offline. All data stays **on the device**.

### Where it came from
- **Original plan** (ChatGPT, PDF "Timesheet Management Web App"): Microsoft Lists / Power Apps / Power Automate with a staff register, a manager approval workflow and an archive. **Not used** for the build, but its later phases (approval workflow, shared archive, payroll export, reminders, Power BI) are still possible future directions.
- **Concrete spec** (Word doc "GitHub Timesheet Builder Conversation"): GitHub Pages app, Excel cell mapping, overtime and subsistence rules. **This is what was built**, then refined over many rounds of feedback.
- **NAS policy NASPO36** (Structured Leave & Entitlements) supplied for the leave tracker.

---

## 2. Tech and files

| File | Purpose |
|---|---|
| `index.html` | All screens (tabs: Timesheet, Records, Leave, Forms, My details), dialogs, early theme script |
| `styles.css` | Mobile-first styling, colour themes, dark mode (`html.dark` class) |
| `app.js` | State, roster, day logic, validation, Excel fill, PDF render, timesheet email, library, leave periods, appearance, PWA |
| `roster-entry.js` | Non-rostered staff: entering shifts (station + shift) every 1, 2, 4 or 8 weeks |
| `swaps.js` | Shift swaps: the swap record, putting halves on timesheets, the swap dialog, Records views and badge |
| `leave.js` | Leave tab: requests and emails, timesheet pre-fill, calendar file, annual leave tracker, NASPO36 blocks and reminders |
| `forms.js` | Forms tab: reads and fills fillable PDFs, built-in and uploaded forms, form emails, form ↔ timesheet links |
| `form-profiles.js`, `forms/` | Setups for each HSE form (`FORM_PROFILES`), and the bundled blank PDFs |
| `media/` | The highlight reel, the explainer video and the script that records both |
| `sw.js`, `manifest.webmanifest`, `icons/` | Installable app and offline support (network-first service worker) |
| `template.xlsx` | Official NAS timesheet (*New_Timesheet_Template_2025*); filled in for Excel and PDF |
| `lib/exceljs.min.js` | ExcelJS 4.4.0: reads and writes the template |
| `lib/jspdf.umd.min.js` | jsPDF 2.5.2: draws the timesheet PDF |
| `lib/pdf-lib.min.js` | pdf-lib 1.17.1: fills HSE PDF forms (loaded on demand) |
| `fonts/` | Handwriting fonts for typed signatures (open licences) |

**Storage:**
- **localStorage**, key `timesheetHub_v1`: `{ profile, currentId, sheets[], forms[], leavePeriods[], leaveRequests[], swaps[] }` (older saved data simply has no `swaps` yet and starts with none).
  - Each sheet has `days[7]`, `history`, `sends`, `version`, `staff` snapshot and `rosterLine`.
  - `profile` also holds the roster (`rosterId`, `rosterAnchor`, `rosterAnchorLine`, or `rosterId: "entered"` with `rosterWeeks` and `rosterDays`) and `profile.leave` (workforce planning email, entitlement hours, leave year start).
  - `leavePeriods`: `{ id, formId, type, from, to, source, kind: "form" | "request", days? }` — leave put on timesheets by date.
  - `forms`: filled forms (values, sends, and `link` to the timesheet leave they were made from).
- **IndexedDB** `timesheetHubForms` / `templates`: uploaded blank PDF forms.
- **Backup:** export/import JSON in My details (data is per device and browser).

**Releases:** bump the version in **both** `app.js` (`APP_VERSION`) and `index.html` (every `?v=`). Otherwise phones mix cached old and new files. The version shows at the bottom of My details.

**Testing:** headless Chromium (Playwright) scripts at a phone viewport drive the app, check Excel cells and PDF output, and use a fixed clock for date-based features (reminders, blocks). The scripts lived in the session scratchpad and are **not in the repo** yet (see open items).

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

- **Words in time boxes are split:** the first word goes in From, the rest in To ("Rest | Day", "Annual | Leave", "Additional | Maternity Leave"). These cells shrink to fit.
- **Column M is the general notes column:** overtime reason, early-finish or late-start reasons, leave notes, Bank TOIL and shift-swap notes all go there.

---

## 4. Business rules agreed

### Roster
- **Roster list** in My details: *No roster*; **Fixed roster** → *Clinical Hub 16week*; **Non-rostered** → *1 week, 2 weeks, 4 weeks, 8 weeks*.
- **Fixed roster** (16 lines: Day 07–19, Night 19–07, Road 07–19, Rest): choose a **starting week** (week-commencing Monday) and its line; the line for any week wraps round after line 16. Road shifts use the *usual road base* (Sligo, Manorhamilton or Ballyshannon) or ask each time.
- **Non-rostered** (`roster-entry.js`): no normal base — **every shift has its own station**. Each day: station, then a shift from that station's list, or Rest, Road (road stations) or Other times. "All shifts this week at" and "Same as week n" speed it up; changing a station moves a shift it doesn't allow to the nearest one. It only builds the roster; the timesheet confirms what was worked. Stored by date in `profile.rosterDays` (`{ code, from, to, station }`), read by `rosterWeek()` like a roster line. The Start card warns when shifts run out (within a week); starting a week with none entered opens the entry first (or skip).
- **Stations and shift rules:** Sligo (any listed shift: days 07/08/09/10, nights 19/20/21), Ballyshannon and NEOC (07/19), Manorhamilton and Carrick on Shannon (08/20), Other. Road shifts are 07–19 and ignore the station rules.
- **New timesheets pre-fill** from the roster: shifts are "finished as rostered"; rest days show as a slim **"Rest Day — confirm?"** row with [✓ Rest day] [Worked (OT / TOIL)]. Leave periods are then applied on top.

### What happened on a day (Actual)
- **Finished as rostered.**
- **Finished early:** pick how long, then a reason (Certified Sick Leave, Self-Certified Sick Leave, Force Majeure – Family Emergency, Other + note). Note in M: "Finished early 16:15 – …".
- **Extended duty:** pick how long. Overtime is filled in from the rostered finish to the new finish; the incident number is required. M: **"Ext Duty 1234567"**.
- **Comp rest / late start:** pick how long, then *Compensatory Rest* or *Late Start* (optional note).
- **Other times** and **Not worked**.
- **Leave goes under Actual, never under Rostered.** The Roster row keeps the shift times; the Actual row shows the leave. (Exception: a non-rostered fixed leave day with no shift known goes in both rows.) Leave types: Annual, Parental, Parent's, Self-Certified Sick, Certified Sick, Force Majeure, Study, Examination, Interview, Marriage, Maternity, Additional Maternity; Shift Swap (note in M).
- **Leave + part shift / meeting:** leave type plus the time worked; leave hours = shift − worked; M reads "Annual Leave 11h – Meeting 10:00–11:00".
- **Standard-day leave:** some leave pays only a standard day (default **7h 48m**); the rest of a 12h shift is covered by Annual Leave, TOIL or Worked. Configurable in My details → Leave rules. **To confirm with HR (parked).**
- **Rest day worked:** **Overtime** (reason / incident required) or **TOIL** (M reads "Bank TOIL"); OT From/To always match the actual times.
- **Subsistence:** From/To, Rate (5 hr / 10 hr), Location (required), Callsign (optional). J reads "Location - CALLSIGN".
- **15-minute pickers**; **"✓ Done – next day"** folds a day and opens the next; unconfirmed days become Rest Day at publish after one prompt.

### Leave (Leave tab, `leave.js`)
- **Request:** type (Annual, Parental, Parent's, Force Majeure, Study, Examination, Interview, Marriage), dates, note; hours from the rostered shifts (editable). Non-rostered with no shifts yet: each day = fixed 12h leave day (untick days; no station); these stay leave when shifts are entered (shown as *booked*).
- **On send:** pre-written email (To workforce planning, CC me), request saved as *Requested*, and a leave period put on the timesheets. Published weeks aren't changed (listed to revise). Approved / Declined / Cancel (cancellation email) / Add to calendar (.ics).
- **Tracker (NASPO36):** leave year 1 Apr – 31 Mar; 179.4h + 78h bank holidays + carried over (carry-over > 39h flagged); taken / booked / left / waiting; annual leave on published timesheets that wasn't booked here also counts.
- **Structured blocks (NASPO36 §9):** Summer 2 weeks, Autumn 1, Spring 1; block week = any 7 consecutive days with every rostered shift on annual leave (`weeksOff`); statuses Apply now / Done / Not yet / Overdue / Short / No record; reminder dot and card while a window is open. The request shows whether it makes a full block week. Notice warnings: under 48 hours; two weeks normal for single days (NASPO36 §10.2).

### Forms (HSE HR forms)
- **Built in** (`forms/`, `FORM_PROFILES`): HR 108 a Adoptive, c Carer's, d Bereavement, e Examination, f Force Majeure, g Health & Safety, h Jury Service, i Maternity, j Parental, k Paternity, m Serious Physical Assault, n Marriage, p Study, q Trade Union, r Carry-over of Annual Leave, s Interview, t Parent's, u Unpaid Leave for Medical Care. Each: a label for every box, pre-fill from My details, manager/HR boxes kept blank, employee signature position, **HSE ↗** link to check for a newer version (an uploaded copy is recognised and used instead).
- **Profile features:** `hide`, `combos` (one value over one-character squares, e.g. HR 108(c)), `groups` (optional sections written only when ticked, e.g. Maternity postponement, Confirmation Agreement), `options` (readable radio choices), `long` (multi-line box), `leaveType` / `leaveFill` (timesheet → form), `leaveWeek` (week-block leave: the form gets the whole 7 days), `leaveRanges` (form → timesheets).
- **Links to the timesheet:** see Highlights §2. Leave across two timesheet weeks gives one form per week for now.
- **Uploaded forms:** any fillable PDF can be added; boxes listed in page order and pre-filled by guessing.
- **Not built in:** HR 108(b), 108(o), HR 110 (not needed for now); HR 108(l) (no fillable boxes); HR 117 (Word document).

### Shift swaps (`swaps.js`)
- **Personal only:** no link to anyone else's data; the colleague's name is a label.
- **Record:** `state.swaps` = `{ id, direction: "off" | "on", colleague, note, first: { date, station, from, to }, second: same | null }`. `first` is the half it was logged from (the swap's direction); `second` is the other half (the opposite direction), blank until known.
- **Owed:** open swap with direction *off* = **I owe**; with direction *on* = **Owed to me**; both halves recorded = **complete**.
- **Entry points:** What happened → *Swapped off* (rostered shift); *⇄ Swapped on* on a rest day; *⇄ Record a shift swap* under any day; *＋ Record a swap* in Records → Swaps. A swap off fills in the rostered shift for that date; a swap on picks station + that station's shift (or other times).
- **On timesheets** (`syncSwapsForSheet`, run whenever a week is shown and after every swap change): a swapped-off day keeps the rostered shift in the Roster row and records *Shift Swap* under Actual; a swapped-on day gets the colleague's shift (label "Swap"). Each such day has `d.swap = { id, half, sig }`, and the notes column (M) reads "Shift Swap: Swapped off – Pat Murphy (on 18/11)". A half that's removed or moved puts the day back from the roster (`fillDayFromRoster`). Published timesheets aren't changed; the app names them to revise.
- The old free-text *Shift Swap* leave choice is no longer offered (old days that used it still show as before).

### Publishing, PDF and email
- **Publish = locked PDF** drawn from the filled template, with a footer (publish time, AMENDED n, roster line). Print and annotate allowed; editing and copying blocked (a deterrent).
- **Excel copy** under Records → Timesheets → More → *Export as Excel*.
- **Recipients:** ORM, DCM and Supervisor contacts (name + email + default tick), plus **Me** in CC.
- **Emails:** see Highlights §5. A website can't fill To/CC in the share sheet, so addresses are copied to paste; "Open email" (mailto) fills them but the PDF is attached by hand.
- **Amendments:** *Revise* makes AMENDED 1, 2, 3… (subject, body, file name, labels); the previous version is marked *superseded*.

### Look and feel
- **Tabs:** Timesheet / Records / Leave / Forms / My details (fit on one line down to 360px). The Records tab keeps its internal id `library`, so saved data and links carry over.
- **Week strip**, **day cards** with colour chips (Day amber, Night indigo, Road teal, Rest grey, Leave purple, OT orange, Subsistence blue, problems red), folded shift details, bottom bar "x/7 days done · Review & publish".
- **Themes:** Teal, Green, Navy, Plum, Slate, each in Light, Dark or Match phone.

---

## 5. Open items / next steps

1. **Standard-day leave hours:** confirm with HR which leave types pay 7.8h (parked).
2. **Confirm locally:** the structured-block rule (any 7 consecutive days with every rostered shift on leave; summer weeks can be separate); the 12h value for leave days booked before shifts are known.
3. **Payroll confirmations:** leave on a part day (Roster row shift times vs "Annual Leave"); notes in column M; AMENDED wording and position.
4. **Real-phone checks:** share-sheet attachment on iPhone and Android mail apps; install to home screen; the leave request mailto with To/CC filled.
5. **Forms:** check filled forms with HR; HR 108(l) could be filled by placing text by position if ever needed.
6. **Leave forms across two weeks:** one form per timesheet week for now; could merge into one.
7. **No backend:** data is on the device only (manual backup). A shared archive, manager approval or rostering link would need a backend (e.g. Microsoft Lists / Power Automate, as in the original plan).
8. **Automated tests in the repo:** move the Playwright scripts into a `tests/` folder.

---

## 6. Videos

Phone-size screen recordings with captions, using a made-up person ("Alex Sample"). Both use **week blocks** of leave: a week of Parent's Leave, and an annual leave week.

### Highlight reel (30 seconds)
- **File:** [`media/timesheet-hub-highlights.mp4`](media/timesheet-hub-highlights.mp4) — https://ami793-eng.github.io/Timesheets/media/timesheet-hub-highlights.mp4 (31 s, about 0.6 MB).
- **Shows:** the week pre-filled from the roster → a **week of Parent's Leave** (Quick fill) → HR 108(t) opening with **Week one 09/11 – 15/11** filled in → its **pre-written email** → the **annual leave tracker** → booking an **annual leave week** and its **pre-written email** → publishing the timesheet and its **pre-written email**.

### Full explainer (2½ minutes)
- **File:** [`media/timesheet-hub-explainer.mp4`](media/timesheet-hub-explainer.mp4) — https://ami793-eng.github.io/Timesheets/media/timesheet-hub-explainer.mp4 (2 min 27 s, about 1.6 MB).
- **What it shows, in order:**
  1. Setting the roster once, and a new timesheet arriving **pre-filled from the roster**.
  2. A **week of Parent's Leave** with Quick fill; the leave offering **"Fill in the form"**; HR 108(t) opening with **Week one (09/11 – 15/11) already filled in**; its **pre-written email**; the timesheet showing the form is done.
  3. Saving a **Maternity Leave form** putting the leave **onto the timesheets**.
  4. The **annual leave tracker**: entitlement, hours left, the Summer / Autumn / Spring blocks and the "Book your … leave" reminder.
  5. **Booking an annual leave week** (Fri–Thu): shifts and hours worked out, the **pre-written email** to workforce planning, and the leave appearing on that week's timesheet.
  6. **Non-rostered** staff entering their shifts by station.
  7. Publishing the timesheet and its **pre-written email**.

### Re-recording
After big UI changes, use `media/record-explainer.js` (Playwright drives the app at phone size, with a fixed date of 9 Nov 2026 and caption overlays):
1. In the repo: `python3 -m http.server 8123`
2. Full explainer: `node media/record-explainer.js <output folder>`, then `ffmpeg -i in.webm -vf scale=540:-2 -c:v libx264 -pix_fmt yuv420p -crf 27 -movflags +faststart -an media/timesheet-hub-explainer.mp4`
3. Highlight reel: `node media/record-explainer.js <output folder> --short`, then `ffmpeg -i in.webm -vf "setpts=PTS/1.55,scale=540:-2" -r 30 -c:v libx264 -pix_fmt yuv420p -crf 27 -movflags +faststart -an media/timesheet-hub-highlights.mp4`

---

## 7. How to work on it

- **Run locally:** `python3 -m http.server 8000` in the repo, then open http://localhost:8000. Opening the file directly works but can't load the template.
- **Releases:** bump the version (section 2), commit on a branch and merge to `main` with a pull request. GitHub Pages deploys in about a minute; phones refresh to pick it up.
- **Key places in the code:**
  - `excelCells()` decides what goes in each cell for a day; `fillWorksheet()` writes the template; `renderWorksheetPdf()` draws the PDF; `dayErrors()` holds the validation rules.
  - `ROSTERS` / `ROSTER_SHIFTS` / `ROAD_STATIONS` / `STATION_SHIFTS` / `SHIFTS` hold the roster data; `rosterWeek()` / `applyRoster()` fill a timesheet; `roster-entry.js` handles non-rostered shifts.
  - `applyLeavePeriods()` / `setFormLeavePeriods()` put leave on timesheets by date.
  - `LEAVE_TYPES`, `EARLY_REASONS`, `LATE_REASONS` hold the dropdown lists.
  - `leave.js`: `STRUCTURED_BLOCKS`, `leaveTotals()`, `weeksOff()`, `requestEmail()`.
  - `form-profiles.js`: `FORM_PROFILES`; `forms.js`: `formEmail()`, `openLeaveForm()`, `putLeaveOnTimesheets()`.
  - Timesheet email: `emailText()` and `openSendDialog()` in `app.js` (subject `<Name> Timesheet <dd/mm/yyyy>`).
