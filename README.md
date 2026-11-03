# Timesheet Hub

A simple weekly timesheet web app for staff. It runs entirely in the browser and is hosted free on GitHub Pages. There's no server and no login.

Staff fill in their week (they can save it and come back during the week), publish it, and it downloads as a filled-in Excel timesheet ready to email. Every published sheet is kept in a library on that device, so it can be downloaded again, re-sent, or revised.

## Features

- **My details:** name, staff number and base are entered once and added to every timesheet. The signature can be done three ways:
  - **Draw** it with a finger or mouse.
  - **Upload** a photo or scan. The paper background is removed automatically.
  - **Type** it and pick a font: Dancing Script, Great Vibes, Caveat, Homemade Apple, or plain Arial.

  Whichever you choose, the signature is placed as an image in the Employee Signature box.
- **My roster:** in My details, pick a **base roster** and a **starting week** (a week-commencing Monday, and which line that week is). The app counts the 16-week rotation forwards and backwards from there, and shows this week's and next week's line as a check.
  - **New timesheets fill themselves in:** each shift shows as worked as rostered (Day / Night / Road), and the first shift opens ready to check.
  - **Rest days** stay as one slim line, for example "Wednesday · Rest Day — confirm? [✓ Rest day] [Worked]". Confirm each as the week goes on, or tap **Worked** (or the line itself) to open it and enter times and overtime. **Done – next day** skips over rest days. Any still unconfirmed at publish are recorded as Rest Day after one prompt.
  - **Built in:** *Clinical Hub 16week*. Day 07–19, Night 19–07, Road 07–19.
  - **Road shifts** are worked from **Sligo, Manorhamilton or Ballyshannon**. Set a *usual road base* in My roster to fill it in automatically, or leave it on *Ask each time*: each Road day then asks, and can't be marked Done or published until a station is chosen. More rosters can be added to `ROSTERS` in `app.js`.
- **Quick fill:** tap several days, choose the rostered shift (or *Keep rostered shift*), then choose the Actual (worked as rostered, or a leave type), and apply it to all of them at once. For example, Annual Leave across three rostered nights.
  - The shift list follows the station's rules:
    - NEOC and Ballyshannon: 07:00 / 19:00
    - Carrick on Shannon and Manorhamilton: 08:00 / 20:00
    - Sligo: any listed shift
  - "Other" takes a start time plus either a finish time or a number of hours. The finish time is calculated, so 20:00 + 12 hours gives 08:00.
- **Per-day editing:** set the rostered shift (Rest Day, a shift, or Other times), then choose what actually happened under **Actual**. Leave goes under Actual, so the Roster row keeps the shift times, for example Roster 19:00–07:00 / Actual "Annual Leave". The options are:
  - **Finished as rostered.**
  - **Finished early:** pick how long, in 15-minute steps. The app works out the finish time and hours worked, and asks why: Certified Sick Leave, Self-Certified Sick Leave, Force Majeure – Family Emergency, or Other (with a note). The reason goes in column M on that day's row, for example "Finished early 16:15 – Certified Sick Leave".
  - **Extended duty:** pick how long. The actual finish and the overtime (rostered finish → new finish) are filled in for you. Enter the incident number, which goes on the sheet as **"Ext Duty 1234567"**.
  - **Comp rest / late start:** pick how much later you started. The finish stays as rostered and the hours are worked out. Then choose **Compensatory Rest** or **Late Start** (with an optional note). Column M shows "Comp rest – start 10:00" or "Late start 08:30 – previous call".
  - **Leave + part shift / meeting** (in the Leave list): for example you were rostered on a 19:00–07:00 night, took leave, but worked a 1-hour meeting. Choose the leave type and the time you worked; it can be outside the shift hours (e.g. a 10:00–11:00 meeting). An optional note such as "Meeting" can be added. The app works out the leave: 12h − 1h = **11h**.
    - **By default** the Roster row keeps the shift times (19:00–07:00), so the length of the shift is clear. The Actual row shows the hour worked (10:00–11:00), and column M reads "Annual Leave 11h – Meeting 10:00–11:00".
    - **"Show the leave in the Roster row"** (tick box): the Roster row shows **Annual Leave** instead, and the note records the shift times: "Annual Leave 11h (rostered 19:00–07:00) – Meeting 10:00–11:00".
  - **Leave:** Annual Leave, Parental Leave, Self-Certified or Certified Sick Leave, Force Majeure, Study Leave or Shift Swap. The leave type goes in the Actual row.
  - **Standard-day leave** (e.g. Interview Leave, Marriage Leave): only a standard day is paid (7h 48m by default), so on a 12h shift the app asks how the other **4h 12m** is covered:
    - **Annual Leave** → note "Interview Leave 7h 48m + Annual Leave 4h 12m"
    - **TOIL** → note "Interview Leave 7h 48m + TOIL 4h 12m"
    - **Worked the rest** → the Actual row shows the worked times (pre-filled as the end of the shift, e.g. 14:48–19:00), and the note reads "Interview Leave 7h 48m – worked 14:48–19:00 (4h 12m)"

    Which leave types count, and the standard day length, are set in **My details → Leave rules** (check with HR).
  - **Other times** or **Not worked**.
  - **Rest day worked:** tap **Worked (OT / TOIL)** on the rest day, then choose **Worked – Overtime** or **Worked – TOIL** and enter the times.
    - Overtime From/To always match the actual times. This includes a meeting or training on a rest day, for example 10:00–11:00. The reason box suggests Meeting, Training or Cover.
    - **Overtime:** the overtime columns are filled with the times worked, and a reason or incident number is required (e.g. "Meeting").
    - **TOIL:** the overtime columns are filled with the times worked as normal, and column M reads **"Bank TOIL"**, plus an optional note (e.g. "Bank TOIL – Cover"). No incident number is needed.
- **Box off a day:** tap **✓ Done – next day** at the bottom of a day.
  - The app checks the day for anything missing (incident number, reasons, vehicle and so on).
  - The day folds to one line with a green tick, and the next unfinished day opens.
  - A progress bar shows "x/7 days done".
  - Tap a done day to reopen and change it.
  - Quick fill starts folded away once a timesheet has entries.
- **15-minute pickers:** every time and hours box scrolls in 15-minute steps.
- **Overtime:** the Yes/No is set automatically when you started at the rostered time but finished later. OT runs from the rostered finish to the actual finish. It can also be set by hand. An **incident number / reason is required** before you can publish.
- **Subsistence:** can be claimed on any day, with From, To, Rate, Location and an optional **Callsign** (any vehicle callsign, for notes). Callsigns you have used are suggested as you type. The sheet shows the location as typed, plus " - <callsign>" if one is entered.
- **Leave types:**
  - Annual Leave
  - Parental Leave
  - Self-Certified Sick Leave
  - Certified Sick Leave
  - Force Majeure
  - Study Leave
  - Shift Swap, which takes an optional note
- **Rest days:** days left blank are recorded as **Rest Day** when you publish. You're asked to confirm this first.
- **Drafts:** these autosave as you type.
- **Publish = locked PDF:** publishing creates a **PDF only**. It is drawn straight from the filled-in Excel template, using the template's own colours, column widths, merged cells, borders, fonts, logo and notes. The PDF is **locked**: it opens without a password and can be **printed and signed**, but normal PDF readers won't let the timesheet's content be edited or copied. For example, a manager can add a signature in the Line Manager box with Adobe Fill & Sign, or print it and sign by hand. This is a strong deterrent rather than unbreakable protection.
  - **Preview PDF** on a draft lets you check it first.
  - **Revise** in the Library makes a corrected version (AMENDED 1, 2, …).
  - **Excel:** the Library card's **More → Export as Excel** gives an editable copy for your own records. Only the locked PDF is emailed.
- **Attachments:** on phones, **Email with PDF attached** opens your phone's share sheet with the PDF already attached. Pick your email app, then paste the copied addresses into To. **Open email** fills in the addresses and subject, but the PDF has to be attached by hand from Downloads, because browsers can't attach files to an email draft themselves.
- **Email recipients:** set them up in My details, under the signature.
  - **ORM** (Operational Resource Manager), **DCM** (Duty Control Manager) and **Supervisors:** add as many as you need, each with a name and email. Tick *Default* on the people usually sent to.
  - **Me:** your own email, sent as *CC*.
- **Sending:** after publishing, or from the Library, everyone is listed under ORM, DCM, Supervisor and Me. Tick exactly who should get it this time and check the preview. Your email app then opens with everything filled in, and the Excel file is downloaded for you to attach. On phones there is also *Share file*, which attaches the file directly and copies the addresses so you can paste them in.
- **Email template:**
  ```
  Subject: <Name> Timesheet <week ending>

  Hello <first names of the people ticked, e.g. John and Paul>

  Please find timesheet attached

  Kind Regards
  <Name>
  ```
- **Amendments:** after publishing, use **Revise** to make changes. Each revision is numbered **AMENDED 1, 2, 3…**, and the number is added to:
  - the subject: `Andrew Mitchell Timesheet 24/05/2026 AMENDED 1`
  - the body: `Please find timesheet attached - AMENDED 1`
  - the file name: `…_AMENDED1.xlsx`
  - the app's labels

  The earlier version is marked *superseded*.
- **Sent log:** each timesheet records **"Sent by email to John Campbell (ORM), Joe Bloggs (DCM), Me · date and time"**. It's shown on the library card and in the History with the full addresses. The time is recorded when you open the email from the app; the app can't see whether you then pressed Send in your mail app.
- **Library:** search and filter your timesheets (including by who they were sent to), download one again, or email it again.
- **History:** each sheet keeps a log of what happened to it and when.
- **Add to Home Screen:** a button in the header installs the app with its own icon, and it opens full screen.
  - **Android / Chrome:** installs in one tap.
  - **iPhone:** shows the steps (Safari → Share → Add to Home Screen).
  - **Offline:** it also opens with no signal, using the last version it saw online.
- **Forms:** a separate tab for filling in official HSE forms, such as the HR 108 leave forms.
  - **Built-in forms:** 18 HSE forms are bundled in the `forms/` folder and listed at the top of the tab. Tap one to fill it in; nothing to download. They are: HR 108 (a) Adoptive, (c) Carer's, (d) Bereavement, (e) Examination, (f) Force Majeure, (g) Health & Safety, (h) Jury Service, (i) Maternity, (j) Parental, (k) Paternity, (m) Serious Physical Assault, (n) Marriage, (p) Study, (q) Trade Union, (r) Carry-over of Annual Leave, (s) Interview, (t) Parent's and (u) Unpaid Leave for Medical Care.
    - **HSE ↗** beside each opens that form on the HSE site, to check for a newer version. If there is one, download it and tap **Add a form**: the app recognises it and uses your copy instead of the built-in one.
  - **From a leave day:** a day of Study, Examination, Interview, Marriage, Parental or Force Majeure leave shows a **Fill in the form** button with the matching HSE form. The leave's from / to dates and number of days are filled in (consecutive leave days count as one stretch; rest days in between don't break it). Once made, the day shows *Filled in* or *Sent dd/mm* and the button reopens that form.
  - **Long leave onto timesheets:** saving a **Maternity Leave** (HR 108i) or **Parental Leave** (HR 108j) form puts its dates on your timesheets. Every rostered shift in those dates is marked as *Maternity Leave*, *Additional Maternity Leave* or *Parental Leave*: on draft timesheets straight away, and on timesheets you start later for those weeks. Rest days stay rest days, days you've already changed by hand are left alone, and published timesheets are never changed (the app lists them so you can **Revise**). Postponed maternity dates and the agreed parental dates (when those sections are ticked) are used instead of the originals. The filled form shows "On your timesheets: …" with **Remove**, and deleting the form also takes its leave off.
  - **Other forms:** links to forms that aren't built in (HR 108(b), (l), (o), HR 110, HR 117) are under *Other HSE forms*. Download a fillable PDF and tap **Add a form**. It stays on the device (IndexedDB) for reuse.
  - **Fill it in:** the app reads the form's fillable boxes in page order. It pre-fills name (or first name and surname), personnel number, grade, department, work location, email, phone and today's date from My details. You fill in the rest; date boxes have a date picker. Manager and HR sections are grouped separately and left blank.
  - **Signature:** your signature is placed in the employee signature box. Manager signature boxes are left blank.
  - **Send it:** tap **Save & make PDF**, then **Email with PDF attached** (share sheet; addresses copied) or **Download PDF**. Filled forms are kept under *Filled forms* to reopen and resend.
  - **Made-to-measure setups:** every built-in form has a setup in `FORM_PROFILES` (in `form-profiles.js`): proper labels for every box, manager and HR boxes kept blank, a signature position where the form has no signature box, and decoration boxes hidden.
    - **Optional sections** (e.g. Maternity Leave postponement, the Parental and Carer's Leave *Confirmation Agreement* page) are folded away and only written to the PDF when you tick **Include this section on the form**.
    - **Square-per-character boxes** (e.g. Carer's Leave) take one value, such as a date or PPS number, and spread it across the squares.
    - **Radio buttons** show readable choices (e.g. "the qualifying adopter of the child").
  - **Character-limited boxes** (e.g. 8 squares for a date) are filled to fit: dates become ddmmyyyy, and PPS is split into digits and letters. If something still doesn't fit, the app says so.
  - **Safer guessing on other forms:** each of your details only goes in the first matching box (e.g. "Name", not a manager's "Name1").
  - **Forms that aren't fillable** (no boxes in the PDF) can't be filled automatically yet; a layout has to be added for them.
- **Appearance:** set in My details. Choose a colour (Teal, NAS Green, Navy, Plum or Slate) and Light, Dark or Match phone.
- **Backup:** export or import a backup file in My details.

## Excel cell map

These positions match `New_Timesheet_Template_2025.xlsx`, which is included as `template.xlsx`.

| What | Cells |
|---|---|
| Name / Personnel Number | F2 / N2 |
| Date Week Ending (dd/mm/yyyy) | G4 |
| Station (your base) | M4 |
| Employee Signature (image) | C23 |
| Day rows (Mon–Sun) | Roster rows 8, 10, 12, 14, 16, 18, 20; Actual rows 9, 11, 13, 15, 17, 19, 21 |
| Date | B, on the roster row (a real date, shown as dd/mm/yy) |
| Time From / To | D / E, on the roster row and on the actual row |
| Station Worked from | F, on the roster row (only on days worked) |
| Subsistence From / To / 5/10 hr / Location & Incident No (+ Vehicle) | G / H / I / J, on the roster row |
| Overtime From / To / Reason for O/T Incident No. | K / L / M, on the roster row |
| On-Call (N–P) | Not used |

How each day type is written (words are split across the From and To boxes, first word in From, the rest in To; long words shrink to fit):

- **Rest Day:** "Rest | Day" in both the Roster row and the Actual row.
- **Leave:** the Roster row keeps the shift times, and the Actual row shows the leave split across the boxes, for example "Annual | Leave", "Self-Certified | Sick Leave" or "Force | Majeure".
- **Shift Swap note:** goes into the M column as "Shift Swap: …".

These positions are set in `EXCEL` and `DAYS` at the top of `app.js`, so they're easy to change if the template moves.

> The very first cell map in the planning conversation stacked subsistence down column G (G8:G35). The real template has one subsistence row per day across G–J, so the app follows the template.

## The Excel template

`template.xlsx` is the NAS 2025 timesheet. The app fills the cells above on the **first worksheet** and keeps everything else as it is: formatting, logo and notes. To use a newer template, replace the file and keep the same name. If the layout changes, update `EXCEL` / `DAYS` in `app.js`.

If there's no `template.xlsx`, the app makes a basic sheet that uses the same cell positions. The bottom of **My details** shows which one is in use.

> **Note:** ExcelJS keeps formatting, merged cells and formulas. Some advanced features may not survive, such as form controls or macros (`.xlsm`). Check one downloaded file against the original before rolling it out.

## Publishing on GitHub Pages

1. Upload these files to the repository:
   - `index.html`
   - `styles.css`
   - `app.js`
   - the `lib` folder
   - `template.xlsx`
   - the `fonts` folder
   - the `icons` folder
   - `manifest.webmanifest` and `sw.js`
   - `README.md`
2. In the repository, go to **Settings → Pages**.
3. Under *Build and deployment*, choose **Deploy from a branch**. Pick `main` and `/ (root)`, then click **Save**.
4. After a minute the app is live at `https://<your-github-username>.github.io/timesheets/`.

## Testing on your own computer

Opening `index.html` directly works, but the template can't be loaded from a file on disk, so the built-in layout is used. To test with your template, serve the folder instead:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Important limitations

- **Data stays on the device.** Drafts and the library are stored in that browser on that phone or PC (`localStorage`). They are not shared between devices or with managers. Clearing browser data, or using private browsing, will lose them. Use **Export backup** regularly.
- **There's no manager approval step yet.** Timesheets are published and emailed, which matches the current paper/Excel process. A manager approval workflow, a shared archive, and payroll exports would need a backend. That could be Microsoft Lists/SharePoint with Power Automate (as in the original plan), or a small hosted database.
- **The app doesn't check overtime against the roster or the rules.** It only applies the rule *same start, later finish = overtime*.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page structure: tabs, forms, buttons |
| `styles.css` | Look and layout (mobile-first, supports dark mode) |
| `app.js` | All behaviour: saving, shift rules, overtime, Excel export, library |
| `manifest.webmanifest`, `sw.js`, `icons/` | Add to Home Screen, app icon and offline support |
| `lib/exceljs.min.js` | Excel library (ExcelJS 4.4.0, MIT licence), bundled so there's no CDN dependency |
| `lib/jspdf.umd.min.js` | PDF library (jsPDF 2.5.2, MIT licence) |
| `forms.js`, `lib/pdf-lib.min.js` | Forms tab: fills official fillable PDFs (pdf-lib 1.17.1, MIT licence) |
| `form-profiles.js` | Setups for each HSE form (labels, pre-fill, manager boxes, signature position) |
| `forms/` | Blank official HSE forms, built into the app |
| `template.xlsx` | The NAS timesheet template the app fills in |
| `fonts/` | Handwriting fonts for typed signatures (open licences, see `fonts/LICENSES.txt`) |

## Making changes (cache busting)

Phones cache the site's files. To make sure everyone gets the new code together, bump the version in **both** of these places whenever you change `app.js` or `styles.css`:

- `index.html`: the `?v=` on `styles.css` and `app.js`
- `app.js`: `APP_VERSION`

The current version is shown at the bottom of **My details**.
