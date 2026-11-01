# Timesheet Hub

A simple weekly timesheet web app for staff. It runs entirely in the browser and is hosted free on GitHub Pages. There's no server and no login.

Staff fill in their week (they can save it and come back during the week), publish it, and it downloads as a filled-in Excel timesheet ready to email. Every published sheet is kept in a library on that device, so it can be downloaded again, re-sent, or revised.

## Features

- **My details:** name, staff number, base, and a signature (drawn with a finger or typed). These are entered once and added to every timesheet.
- **Quick fill:** tap several days, pick a shift or leave type, and apply it to all of them at once.
  - The shift list follows the station's rules:
    - NEOC and Ballyshannon: 07:00 / 19:00
    - Carrick on Shannon and Manorhamilton: 08:00 / 20:00
    - Sligo: any listed shift
  - "Other" takes a start time plus either a finish time or a number of hours. The finish time is calculated, so 20:00 + 12 hours gives 08:00.
- **Per-day editing:** set the rostered shift and the actual hours. Actual can be "worked as rostered", different times, a leave type, or not worked.
- **Overtime:** the Yes/No is set automatically when you started at the rostered time but finished later. OT runs from the rostered finish to the actual finish. It can also be set by hand. An **incident number / reason is required** before you can publish.
- **Subsistence:** can be claimed on any day, with From, To, Rate and Location/Incident.
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
- **Library:** search and filter your timesheets, download one again, or email/share it. On phones this opens the share sheet with the Excel file attached. On a computer the file downloads and an email draft opens, ready to attach it.
- **Revise:** creates version 2, 3, and so on of a published sheet. The older version is marked *superseded*, and each sheet keeps a history log.
- **Backup:** export or import a backup file in My details.

## Excel cell map

| What | Cells |
|---|---|
| Staff name / number | F2 / N2 |
| Week ending (dd/mm/yyyy) | G4 |
| Signature (image or typed) | C23 |
| Roster From / To (each day) | D / E on rows 8, 10, 12, 14, 16, 18, 20 (Mon–Sun) |
| Actual From / To (each day) | D / E on rows 9, 11, 13, 15, 17, 19, 21 |
| OT From / To / Reason | K / L / M on the roster row |
| Subsistence (each day: From, To, Rate, Location) | Mon G8:G11, Tue G12:G15, Wed G16:G19, Thu G20:G23, Fri G24:G27, Sat G28:G31, Sun G32:G35 |

How each day type is written:

- **Rest Day:** "Rest Day" in the roster From cell; the actual cells are left blank.
- **Leave:** the full leave name goes in both the roster From and actual From cells.
- **Shift Swap note:** goes into the M column as "Shift Swap: …".

These positions are set in `EXCEL` and `DAYS` at the top of `app.js`, so they're easy to change if the template moves.

## The Excel template

Put your real timesheet workbook in this folder, named exactly **`template.xlsx`**, next to `index.html`. The app fills the cells above on the **first worksheet** and keeps everything else as it is.

If there's no `template.xlsx`, the app makes a basic sheet that uses the same cell positions. The bottom of **My details** shows which one is in use.

> **Note:** ExcelJS keeps formatting, merged cells and formulas. Some advanced features may not survive, such as form controls or macros (`.xlsm`). Check one downloaded file against the original before rolling it out.

## Publishing on GitHub Pages

1. Upload these files to the repository:
   - `index.html`
   - `styles.css`
   - `app.js`
   - the `lib` folder
   - `template.xlsx`
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
| `lib/exceljs.min.js` | Excel library (ExcelJS 4.4.0, MIT licence), bundled so there's no CDN dependency |
| `template.xlsx` | *Add this:* your real timesheet template |
