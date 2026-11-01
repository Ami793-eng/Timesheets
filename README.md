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
  - **New timesheets fill themselves in:** each shift shows as worked as rostered (Day / Night / Road), and rest days are ticked off and folded into a single "Rest days: …" line.
  - **Rest days stay out of the way** unless you tap **Worked a rest day / swap?** to add overtime or a swap.
  - **Built in:** *Clinical Hub 16week*. Day 07–19, Night 19–07, Road 07–19.
  - **Road shifts** are worked from **Sligo, Manorhamilton or Ballyshannon**. Set a *usual road base* in My roster to fill it in automatically, or leave it on *Ask each time*: each Road day then asks, and can't be marked Done or published until a station is chosen. More rosters can be added to `ROSTERS` in `app.js`.
- **Quick fill:** tap several days, pick a shift or leave type, and apply it to all of them at once.
  - The shift list follows the station's rules:
    - NEOC and Ballyshannon: 07:00 / 19:00
    - Carrick on Shannon and Manorhamilton: 08:00 / 20:00
    - Sligo: any listed shift
  - "Other" takes a start time plus either a finish time or a number of hours. The finish time is calculated, so 20:00 + 12 hours gives 08:00.
- **Per-day editing:** set the rostered shift, then say how the shift ended:
  - **Finished as rostered.**
  - **Finished early:** pick how long, in 15-minute steps. The app works out the finish time and hours worked, and asks why: Certified Sick Leave, Self-Certified Sick Leave, Force Majeure – Family Emergency, or Other (with a note). The reason goes in column M on that day's row, for example "Finished early 16:15 – Certified Sick Leave".
  - **Extended duty:** pick how long. The actual finish and the overtime (rostered finish → new finish) are filled in for you, and an incident number is required.
  - **Comp rest / late start:** pick how much later you started. The finish stays as rostered and the hours are worked out. Then choose **Compensatory Rest** or **Late Start** (with an optional note). Column M shows "Comp rest – start 10:00" or "Late start 08:30 – previous call".
  - **Other times**, **Leave**, or **Not worked**.
- **Box off a day:** tap **✓ Done – next day** at the bottom of a day.
  - The app checks the day for anything missing (incident number, reasons, vehicle and so on).
  - The day folds to one line with a green tick, and the next unfinished day opens.
  - A progress bar shows "x/7 days done".
  - Tap a done day to reopen and change it.
  - Quick fill starts folded away once a timesheet has entries.
- **15-minute pickers:** every time and hours box scrolls in 15-minute steps.
- **Overtime:** the Yes/No is set automatically when you started at the rostered time but finished later. OT runs from the rostered finish to the actual finish. It can also be set by hand. An **incident number / reason is required** before you can publish.
- **Subsistence:** can be claimed on any day, with From, To, Rate, Location/Incident and **Vehicle**. The vehicle is required, and recent vehicles are remembered for quick picking. It goes into the Location & Incident No cell, for example "Galway / INC-901 – Vehicle SL-401".
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

How each day type is written:

- **Rest Day:** "Rest Day" in the roster From cell; the actual cells are left blank.
- **Leave:** the full leave name goes in both the roster From and actual From cells.
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
| `template.xlsx` | The NAS timesheet template the app fills in |
| `fonts/` | Handwriting fonts for typed signatures (open licences, see `fonts/LICENSES.txt`) |

## Making changes (cache busting)

Phones cache the site's files. To make sure everyone gets the new code together, bump the version in **both** of these places whenever you change `app.js` or `styles.css`:

- `index.html`: the `?v=` on `styles.css` and `app.js`
- `app.js`: `APP_VERSION`

The current version is shown at the bottom of **My details**.
