/* Timesheet Hub — app.js
 * Static, browser-only timesheet builder for GitHub Pages.
 * Drafts + library are stored in localStorage; Excel export uses ExcelJS
 * and fills template.xlsx (or a built-in layout if no template is present).
 */
"use strict";

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = "timesheetHub_v1";
// Bump together with the ?v= numbers in index.html on every release, so phones
// never mix a new page with an old cached app.js / styles.css.
const APP_VERSION = "2026.11.05-2";

// Excel row layout, confirmed in the requirements.
const DAYS = [
  { name: "Monday",    short: "Mon", rosterRow: 8,  actualRow: 9 },
  { name: "Tuesday",   short: "Tue", rosterRow: 10, actualRow: 11 },
  { name: "Wednesday", short: "Wed", rosterRow: 12, actualRow: 13 },
  { name: "Thursday",  short: "Thu", rosterRow: 14, actualRow: 15 },
  { name: "Friday",    short: "Fri", rosterRow: 16, actualRow: 17 },
  { name: "Saturday",  short: "Sat", rosterRow: 18, actualRow: 19 },
  { name: "Sunday",    short: "Sun", rosterRow: 20, actualRow: 21 }
];

const EXCEL = {
  staffName: "F2",
  staffNumber: "N2",
  weekEnding: "G4",
  station: "M4",      // header "Station:" (merged M4:P4)
  signature: "C23",
  dateCol: "B",       // merged across roster + actual rows
  stationCol: "F",    // "Station Worked from", merged across both rows
  fromCol: "D",       // roster row = rostered, actual row = actual
  toCol: "E",
  otFromCol: "K",     // on the roster row
  otToCol: "L",
  otReasonCol: "M",
  // Subsistence sits on the roster row: From, To, 5/10 hr, Location & Incident No
  subsCols: ["G", "H", "I", "J"]
};

const STATIONS = ["Sligo", "Ballyshannon", "NEOC", "Manorhamilton", "Carrick on Shannon", "Other"];

const SHIFTS = [
  { start: "07:00", finish: "19:00" },
  { start: "08:00", finish: "20:00" },
  { start: "09:00", finish: "21:00" },
  { start: "10:00", finish: "22:00" },
  { start: "19:00", finish: "07:00" },
  { start: "20:00", finish: "08:00" },
  { start: "21:00", finish: "09:00" }
];

// Allowed shift start times per station. null = every listed shift.
const STATION_SHIFTS = {
  "Sligo": null,
  "Ballyshannon": ["07:00", "19:00"],
  "NEOC": ["07:00", "19:00"],
  "Manorhamilton": ["08:00", "20:00"],
  "Carrick on Shannon": ["08:00", "20:00"],
  "Other": null
};

const LEAVE_TYPES = [
  "Annual Leave",
  "Parental Leave",
  "Self-Certified Sick Leave",
  "Certified Sick Leave",
  "Force Majeure",
  "Study Leave",
  "Examination Leave",
  "Interview Leave",
  "Marriage Leave",
  "Maternity Leave",
  "Additional Maternity Leave",
  "Shift Swap"
];

// Leave paid as a "standard day" (e.g. 7h 48m) rather than the full shift.
// The rest of a longer shift is topped up with Annual Leave, TOIL, or worked.
// Defaults only — the user can change both in My details → Leave rules.
const DEFAULT_STD_DAY_MINS = 468;                       // 7.8 hours = 7h 48m
const DEFAULT_STD_DAY_LEAVE = ["Interview Leave", "Marriage Leave"];
const TOP_UPS = [
  { id: "al",     label: "Annual Leave" },
  { id: "toil",   label: "TOIL" },
  { id: "worked", label: "Worked the rest" }
];

// Why someone finished a shift early.
const EARLY_REASONS = [
  "Certified Sick Leave",
  "Self-Certified Sick Leave",
  "Force Majeure – Family Emergency",
  "Other"
];

// Why someone started a shift late.
const LATE_REASONS = ["Compensatory Rest", "Late Start"];

/* Rotating rosters ---------------------------------------------------- */
// Shift codes used in the roster grids below.
const ROSTER_SHIFTS = {
  D: { label: "Day",   start: "07:00", finish: "19:00" },
  N: { label: "Night", start: "19:00", finish: "07:00" },
  X: { label: "Road",  start: "07:00", finish: "19:00" },   // station chosen from ROAD_STATIONS
  R: { label: "Rest Day" }
};
// Road shifts are worked from one of these bases.
const ROAD_STATIONS = ["Sligo", "Manorhamilton", "Ballyshannon"];
// Each line is one week, Monday → Sunday.
const ROSTERS = {
  "neoc-a": {
    name: "Clinical Hub 16week",
    station: "NEOC",
    lines: [
      "RNNNRRR", "RRRRXXX", "RRDDDRR", "DDRRRDD",
      "RRXXXRR", "RRRRRNN", "NRDDDRR", "DDRRRDD",
      "RRNNNRR", "RRRRXXX", "RRDDDRR", "DDRRRDD",
      "RRXXXRR", "RRRRRNN", "NRDDDRR", "DDRRRDD"
    ]
  }
};

const DECLARATION =
  "I confirm that the hours submitted are accurate and relate to duties undertaken during the stated period.";

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

let state = {
  profile: { name: "", number: "", base: "", baseOther: "",
    contacts: [],            // [{ id, role: "orm" | "sup", name, email, default }]
    meEmail: "", meDefault: true,
    signatureMode: "draw", signatureText: "", signatureFont: "dancing", signatureImage: "" },
  currentId: null,
  sheets: [],
  leavePeriods: [],          // [{ id, formId, type, from, to, source, kind }] — leave from a filled HSE form or a leave request
  leaveRequests: []          // leave requested in the Leave tab (leave.js)
};

const ui = {
  expanded: new Set(),       // indexes of expanded day cards
  shiftEdit: new Set(),      // day cards showing the full station/shift/time fields
  selectedDays: new Set(),   // quick-fill selection
  lastPublishedId: null
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state = {
        ...state,
        ...parsed,
        profile: { ...state.profile, ...(parsed.profile || {}) },
        sheets: Array.isArray(parsed.sheets) ? parsed.sheets : []
      };
      // Older versions had a single "send to" address: treat it as the ORM.
      migrateContacts(state.profile);
    }
  } catch (err) {
    console.error(err);
    toast("Saved data couldn't be read on this device.", true);
  }
}

let saveTimer = null;
function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    flashSaved();
  } catch (err) {
    console.error(err);
    toast("Couldn't save on this device (storage full or blocked). Export a backup.", true);
  }
}
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveState, 300);
}

function currentSheet() {
  return state.sheets.find(s => s.id === state.currentId) || null;
}

function touch(sheet, action) {
  sheet.updatedAt = new Date().toISOString();
  if (action) sheet.history.push({ action, at: sheet.updatedAt });
}

/* ------------------------------------------------------------------ */
/* Date & time helpers                                                 */
/* ------------------------------------------------------------------ */

function pad(n) { return String(n).padStart(2, "0"); }
function isoLocal(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function parseIso(iso) { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); }
function displayDate(iso) { const d = parseIso(iso); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; }
function shortDate(iso) { const d = parseIso(iso); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`; }

function nextSunday(from = new Date()) {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
  return d;
}
function weekDates(sundayIso) {
  const sun = parseIso(sundayIso);
  return DAYS.map((_, i) => {
    const d = new Date(sun);
    d.setDate(sun.getDate() - (6 - i));
    return isoLocal(d);
  });
}

function isTime(v) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(v || ""); }
function toMin(t) { const [h, m] = t.split(":").map(Number); return h * 60 + m; }
function fromMin(total) {
  const n = ((total % 1440) + 1440) % 1440;
  return `${pad(Math.floor(n / 60))}:${pad(n % 60)}`;
}
function addHours(start, hours) {
  const h = Number(hours);
  if (!isTime(start) || !isFinite(h) || h <= 0) return "";
  return fromMin(toMin(start) + Math.round(h * 60));
}
// Minutes from `start` to `t`, rolling over midnight (a finish at/before start = next day).
function minsAfter(start, t) {
  let m = toMin(t) - toMin(start);
  if (m <= 0) m += 1440;
  return m;
}

function fmtDur(mins) {
  const m = Math.round(Number(mins) || 0);
  const h = Math.floor(m / 60), r = m % 60;
  return h && r ? `${h}h ${r}m` : h ? `${h}h` : `${r}m`;
}
function shiftMins(from, to) { return isTime(from) && isTime(to) ? minsAfter(from, to) : 0; }

// <option>s for a time picker in 15-minute steps (keeps an existing off-grid value).
function timeOptions(value) {
  let html = opt("", "--:--", !value);
  if (value && toMin(value) % 15) html += opt(value, value, true);
  for (let m = 0; m < 1440; m += 15) { const t = fromMin(m); html += opt(t, t, t === value); }
  return html;
}
// <option>s for a duration picker in 15-minute steps, from 15 min up to `maxMins`.
function durOptions(value, maxMins, placeholder = "— Select —") {
  let html = opt("", placeholder, !value);
  for (let m = 15; m <= maxMins; m += 15) html += opt(String(m), fmtDur(m), Number(value) === m);
  return html;
}
function timeSelect(f, i, value) { return `<select data-f="${f}" data-i="${i}" class="time-select">${timeOptions(value)}</select>`; }

/* ------------------------------------------------------------------ */
/* Timesheet model                                                     */
/* ------------------------------------------------------------------ */

function blankDay(dateIso) {
  return {
    date: dateIso,
    station: "",
    roster: "",          // "" (not entered) | rest | times | leave
    rosterLeave: "",
    rosterFrom: "",
    rosterTo: "",
    rosterLabel: "",     // e.g. "Day" / "Night" / "Road" when filled from the roster
    actual: "same",      // same | early | extended | late | times | leave | none
    actualMins: 0,       // how long early / extended / late, in minutes (15-min steps)
    earlyReason: "",     // why finished early
    earlyNote: "",       // free text when reason is "Other"
    lateReason: "",      // why started late
    lateNote: "",
    partLeave: "",       // part leave / part worked: leave type
    partFrom: "",        //   …the part actually worked
    partTo: "",
    partNote: "",        //   …what it was (e.g. Meeting)
    topUp: "",           // standard-day leave on a longer shift: al | toil | worked
    topFrom: "",
    topTo: "",
    workType: "",        // rest day worked: "ot" (overtime) or "toil"
    toilNote: "",
    partRostered: false, //   ticked → Roster row shows the leave instead of the shift times
    actualLeave: "",
    actualFrom: "",
    actualTo: "",
    swapNote: "",
    ot: false,
    otAuto: true,        // false once the user sets overtime by hand
    otFrom: "",
    otTo: "",
    otReason: "",
    subs: false,
    subsFrom: "",
    subsTo: "",
    subsRate: "",
    subsLocation: "",
    subsVehicle: "",
    done: false          // "boxed off" by the user
  };
}

function newSheet(weekEndingIso) {
  const now = new Date().toISOString();
  return {
    id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)),
    status: "draft",
    version: 1,
    revisionOf: null,
    weekEnding: weekEndingIso,
    createdAt: now,
    updatedAt: now,
    publishedAt: "",
    days: weekDates(weekEndingIso).map(blankDay),
    history: [{ action: "Created", at: now }]
  };
}

// What actually ends up in the actual row, after resolving "same as roster".
function resolvedActual(d) {
  const roster = d.roster || "rest";
  if (d.actual === "same") {
    if (roster === "times") return { kind: "times", from: d.rosterFrom, to: d.rosterTo };
    if (roster === "leave") return { kind: "leave", label: d.rosterLeave };
    return { kind: "none" };
  }
  if ((d.actual === "early" || d.actual === "extended") && roster === "times") {
    const mins = Number(d.actualMins) || 0;
    const to = isTime(d.rosterTo) ? fromMin(toMin(d.rosterTo) + (d.actual === "early" ? -mins : mins)) : "";
    return { kind: "times", from: d.rosterFrom, to };
  }
  if (d.actual === "late" && roster === "times") {
    const from = isTime(d.rosterFrom) ? fromMin(toMin(d.rosterFrom) + (Number(d.actualMins) || 0)) : "";
    return { kind: "times", from, to: d.rosterTo };
  }
  if (d.actual === "partleave" && roster === "times") return { kind: "times", from: d.partFrom, to: d.partTo };
  if (d.actual === "times") return { kind: "times", from: d.actualFrom, to: d.actualTo };
  if (d.actual === "leave") return { kind: "leave", label: d.actualLeave };
  return { kind: "none" };
}

// Overtime rule from the spec: same start, later finish → OT from roster finish to actual finish.
function autoOvertime(d) {
  if (isRestWorked(d)) {
    // Rest day worked (Overtime or TOIL): overtime From/To always match the actual times.
    const ot = !!restWorkType(d) && isTime(d.actualFrom) && isTime(d.actualTo);
    d.ot = ot; d.otFrom = ot ? d.actualFrom : ""; d.otTo = ot ? d.actualTo : "";
    return;
  }
  if (!d.otAuto) return;
  if (d.actual === "partleave") { d.ot = false; d.otFrom = ""; d.otTo = ""; return; }
  if (isRestWorked(d)) {
    // Overtime and TOIL both fill the overtime columns; TOIL is marked "Bank TOIL" in the notes.
    const ot = !!restWorkType(d) && isTime(d.actualFrom) && isTime(d.actualTo);
    d.ot = ot; d.otFrom = ot ? d.actualFrom : ""; d.otTo = ot ? d.actualTo : "";
    return;
  }
  const a = resolvedActual(d);
  const ok = d.roster === "times" && a.kind === "times" &&
    [d.rosterFrom, d.rosterTo, a.from, a.to].every(isTime) &&
    d.rosterFrom === a.from &&
    minsAfter(a.from, a.to) > minsAfter(d.rosterFrom, d.rosterTo);
  if (ok) {
    d.ot = true;
    d.otFrom = d.rosterTo;
    d.otTo = a.to;
  } else {
    d.ot = false;
    d.otFrom = "";
    d.otTo = "";
  }
}

// "Ext Duty 1234567" → "1234567" (so the prefix is never doubled up).
function stripExtDuty(v) { return String(v || "").trim().replace(/^ext\.?\s*duty[:\s-]*/i, ""); }

// Standard-day leave (e.g. Interview Leave pays 7h 48m of a 12h shift).
function stdDayMins() { return Number(state.profile.stdDayMins) || DEFAULT_STD_DAY_MINS; }
function stdDayLeaveTypes() { return Array.isArray(state.profile.stdDayLeave) ? state.profile.stdDayLeave : DEFAULT_STD_DAY_LEAVE; }
// Minutes to top up (0 if this day doesn't need it).
function topUpMins(d) {
  if (d.roster !== "times" || d.actual !== "leave" || !stdDayLeaveTypes().includes(d.actualLeave)) return 0;
  return Math.max(0, shiftMins(d.rosterFrom, d.rosterTo) - stdDayMins());
}

// Rest day worked: overtime or TOIL ("" = not chosen yet; older saved days count as overtime).
function restWorkType(d) { return d.workType === undefined ? "ot" : d.workType; }
function isRestWorked(d) { return d.roster === "rest" && d.actual === "times"; }
function isBankToil(d) { return isRestWorked(d) && restWorkType(d) === "toil"; }

// Part leave / part worked: minutes of leave = rostered shift − time worked.
function partLeaveMins(d) {
  const shift = shiftMins(d.rosterFrom, d.rosterTo);
  const worked = shiftMins(d.partFrom, d.partTo);
  return shift && worked ? Math.max(0, shift - worked) : 0;
}

// The exact values written to the workbook for one day.
// Words like "Rest Day" / "Annual Leave" are split across the From and To boxes:
// first word in From, the rest in To ("Rest" | "Day", "Self-Certified" | "Sick Leave").
function splitLabel(label) {
  const t = String(label || "").trim();
  const k = t.indexOf(" ");
  return k < 0 ? [t, ""] : [t.slice(0, k), t.slice(k + 1)];
}

function excelCells(d) {
  const roster = d.roster || "rest";
  const c = { rFrom: "", rTo: "", aFrom: "", aTo: "", otFrom: "", otTo: "", otReason: "" };
  if (roster === "rest") [c.rFrom, c.rTo] = splitLabel("Rest Day");
  else if (roster === "leave") [c.rFrom, c.rTo] = splitLabel(d.rosterLeave);
  else if (d.actual === "partleave" && d.partRostered === true && d.partLeave) [c.rFrom, c.rTo] = splitLabel(d.partLeave);
  else { c.rFrom = d.rosterFrom; c.rTo = d.rosterTo; }

  const a = resolvedActual(d);
  if (a.kind === "times") { c.aFrom = a.from; c.aTo = a.to; }
  else if (a.kind === "leave") [c.aFrom, c.aTo] = splitLabel(a.label);
  const tu = topUpMins(d);
  if (tu && d.topUp === "worked" && isTime(d.topFrom) && isTime(d.topTo)) { c.aFrom = d.topFrom; c.aTo = d.topTo; }
  else if (roster === "rest") [c.aFrom, c.aTo] = splitLabel("Rest Day");   // rest day that stayed a rest day

  if (d.ot) {
    c.otFrom = d.otFrom;
    c.otTo = d.otTo;
    c.otReason = d.actual === "extended" && d.roster === "times" && d.otReason.trim()
      ? `Ext Duty ${stripExtDuty(d.otReason)}`
      : d.otReason.trim();
  }
  // Early finish: the template has no separate column, so the reason goes in the
  // O/T reason column (M) on that day's row (it's otherwise empty when there's no OT).
  if (d.actual === "early" && d.roster === "times" && d.earlyReason) {
    const why = d.earlyReason === "Other" ? (d.earlyNote.trim() || "Other") : d.earlyReason;
    const note = `Finished early ${c.aTo} – ${why}`;
    c.otReason = c.otReason ? `${c.otReason}; ${note}` : note;
  }
  if (d.actual === "partleave" && d.roster === "times" && d.partLeave && isTime(d.partFrom) && isTime(d.partTo)) {
    const shiftTxt = d.partRostered === true ? ` (rostered ${d.rosterFrom}–${d.rosterTo})` : "";
    const note = `${d.partLeave} ${fmtDur(partLeaveMins(d))}${shiftTxt} – ${d.partNote.trim() || "Worked"} ${d.partFrom}–${d.partTo}`;
    c.otReason = c.otReason ? `${c.otReason}; ${note}` : note;
  }
  if (tu && d.topUp) {
    const lv = `${d.actualLeave} ${fmtDur(stdDayMins())}`;
    const note = d.topUp === "worked"
      ? `${lv} – worked ${d.topFrom}–${d.topTo} (${fmtDur(shiftMins(d.topFrom, d.topTo))})`
      : `${lv} + ${d.topUp === "al" ? "Annual Leave" : "TOIL"} ${fmtDur(tu)}`;
    c.otReason = c.otReason ? `${c.otReason}; ${note}` : note;
  }
  if (isBankToil(d)) {
    c.otReason = `Bank TOIL${(d.toilNote || "").trim() ? ` – ${d.toilNote.trim()}` : ""}`;
  }
  if (d.actual === "late" && d.roster === "times" && d.lateReason) {
    const note = d.lateReason === "Compensatory Rest"
      ? `Comp rest – start ${c.aFrom}`
      : `Late start ${c.aFrom}${d.lateNote.trim() ? ` – ${d.lateNote.trim()}` : ""}`;
    c.otReason = c.otReason ? `${c.otReason}; ${note}` : note;
  }
  const isSwap = d.rosterLeave === "Shift Swap" || d.actualLeave === "Shift Swap";
  if (isSwap && d.swapNote.trim()) {
    const note = `Shift Swap: ${d.swapNote.trim()}`;
    c.otReason = c.otReason ? `${c.otReason}; ${note}` : note;
  }
  return c;
}

function daySummary(d) {
  const c = excelCells(d);
  if (!d.roster) return { text: "Not entered yet", cls: "is-empty" };
  if (d.roster === "rest" && resolvedActual(d).kind === "none") return { text: "Rest Day", cls: "is-rest" };
  const tag = d.rosterLabel === "Road" ? `Road (${d.station || "station?"}) ` : d.rosterLabel && d.rosterLabel !== "Rest Day" ? `${d.rosterLabel} ` : "";
  let text = d.roster === "times" ? `${tag}${d.rosterFrom}–${d.rosterTo}` : d.roster === "leave" ? d.rosterLeave : "Rest Day";
  const a = resolvedActual(d);
  if (d.actual === "early" && d.actualMins) {
    text += ` · finished ${a.to} (${fmtDur(d.actualMins)} early${d.earlyReason ? `, ${d.earlyReason === "Other" ? (d.earlyNote || "other") : d.earlyReason}` : ""})`;
  } else if (d.actual === "extended" && d.actualMins) {
    text += ` · extended to ${a.to} (+${fmtDur(d.actualMins)})`;
  } else if (d.actual === "partleave") {  // leave + part shift / meeting
    text += d.partLeave && isTime(d.partFrom) && isTime(d.partTo)
      ? ` · ${d.partLeave} ${fmtDur(partLeaveMins(d))}, worked ${d.partFrom}–${d.partTo}${d.partNote.trim() ? ` (${d.partNote.trim()})` : ""}`
      : " · part leave – details needed";
  } else if (d.actual === "late" && d.actualMins) {
    text += ` · started ${a.from} (${d.lateReason === "Compensatory Rest" ? "comp rest" : "late start"}, ${fmtDur(d.actualMins)})`;
  } else if (["early", "extended", "late"].includes(d.actual)) {
    text += ` · ${{ early: "finished early", extended: "extended", late: "comp rest / late start" }[d.actual]} – how long?`;
  } else if (d.actual !== "same") {
    if (a.kind === "times") text += ` · actual ${a.from}–${a.to}`;
    else if (a.kind === "leave") text += ` · ${a.label}`;
    else if (d.roster !== "rest") text += " · not worked";
  }
  return { text, cls: d.roster === "leave" ? "is-leave" : "" };
}

/* ------------------------------------------------------------------ */
/* DOM helpers                                                         */
/* ------------------------------------------------------------------ */

const $ = id => document.getElementById(id);
function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, ch =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}
function opt(value, label, selected) {
  return `<option value="${esc(value)}"${selected ? " selected" : ""}>${esc(label)}</option>`;
}

let toastTimer = null;
function toast(msg, isError = false) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.toggle("toast--error", isError);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, isError ? 6000 : 3000);
}

let savedTimer = null;
function flashSaved() {
  const el = $("savedIndicator");
  if (!el || !currentSheet()) return;
  const t = new Date();
  el.textContent = `Saved ${pad(t.getHours())}:${pad(t.getMinutes())}`;
  el.classList.add("saved--flash");
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => el.classList.remove("saved--flash"), 800);
}

function shiftsForStation(station) {
  const allowed = STATION_SHIFTS[station];
  return SHIFTS.filter(s => !allowed || allowed.includes(s.start));
}
function shiftLabel(s) { return `${s.start}–${s.finish}`; }

/* Roster dropdown value encoding: rest | shift:HH:MM | leave:Name | other */
function rosterOptions(station, current) {
  let html = opt("", "— Select —", current === "");
  html += opt("rest", "Rest Day", current === "rest");
  html += `<optgroup label="Day shifts">`;
  shiftsForStation(station).filter(s => toMin(s.start) < toMin(s.finish))
    .forEach(s => { html += opt(`shift:${s.start}`, shiftLabel(s), current === `shift:${s.start}`); });
  html += `</optgroup><optgroup label="Night shifts">`;
  shiftsForStation(station).filter(s => toMin(s.start) > toMin(s.finish))
    .forEach(s => { html += opt(`shift:${s.start}`, shiftLabel(s), current === `shift:${s.start}`); });
  html += `</optgroup>`;
  // Leave is recorded under Actual, not Rostered. (Older drafts may still have leave here.)
  if (current && current.startsWith("leave:")) html += opt(current, current.slice(6), true);
  html += opt("other", "Other (enter times)", current === "other");
  return html;
}

function rosterValue(d) {
  if (!d.roster) return "";
  if (d.roster === "rest") return "rest";
  if (d.roster === "leave") return `leave:${d.rosterLeave}`;
  const preset = SHIFTS.find(s => s.start === d.rosterFrom && s.finish === d.rosterTo);
  const st = d.rosterLabel === "Road" ? "Other" : (d.station || "Other");   // road shifts follow the roster, not station rules
  if (preset && shiftsForStation(st).includes(preset)) return `shift:${preset.start}`;
  return "other";
}

function applyRosterValue(d, value, otherStart, otherFinish) {
  d.rosterLabel = "";
  if (!value) { d.roster = ""; return; }
  if (value === "rest") {
    d.roster = "rest"; d.rosterLeave = ""; d.rosterFrom = ""; d.rosterTo = "";
    if (d.actual === "same" || d.actual === "leave") d.actual = "none";
  } else if (value.startsWith("leave:")) {
    d.roster = "leave"; d.rosterLeave = value.slice(6); d.rosterFrom = ""; d.rosterTo = "";
    d.actual = "same";
  } else if (value.startsWith("shift:")) {
    const s = SHIFTS.find(x => x.start === value.slice(6));
    d.roster = "times"; d.rosterLeave = ""; d.rosterFrom = s.start; d.rosterTo = s.finish;
    if (d.actual === "none" || d.actual === "leave") d.actual = "same";
  } else if (value === "other") {
    d.roster = "times"; d.rosterLeave = "";
    d.rosterFrom = otherStart ?? d.rosterFrom;
    d.rosterTo = otherFinish ?? d.rosterTo;
    if (d.actual === "none" || d.actual === "leave") d.actual = "same";
  }
}

/* ------------------------------------------------------------------ */
/* Navigation                                                          */
/* ------------------------------------------------------------------ */

function showTab(name) {
  document.querySelectorAll(".tab").forEach(t => t.setAttribute("aria-selected", String(t.dataset.tab === name)));
  document.body.classList.toggle("has-bar", name === "timesheet" && !!currentSheet());
  document.querySelectorAll(".panel").forEach(p => { p.hidden = p.id !== `tab-${name}`; });
  if (name === "library") renderLibrary();
  if (name === "forms" && typeof renderForms === "function") renderForms();
  if (name === "leave" && typeof renderLeave === "function") renderLeave();
  if (name === "timesheet") renderTimesheet();
  if (name === "profile") { renderProfile(); resizeSigPad(); }
  window.scrollTo({ top: 0 });
}

/* ------------------------------------------------------------------ */
/* Profile                                                             */
/* ------------------------------------------------------------------ */

function profileBase() {
  const p = state.profile;
  return p.base === "Other" ? (p.baseOther || "Other") : p.base;
}

function renderProfile() {
  const p = state.profile;
  $("pName").value = p.name;
  $("pGrade").value = p.grade || "";
  $("pDept").value = p.dept || "";
  $("pPhone").value = p.phone || "";
  $("pPps").value = p.pps || "";
  $("pNumber").value = p.number;
  $("pBase").innerHTML = opt("", "— Select —", !p.base) + STATIONS.map(s => opt(s, s, p.base === s)).join("");
  $("pBaseOther").value = p.baseOther;
  $("pBaseOtherWrap").hidden = p.base !== "Other";
  renderRosterSettings();
  renderLeaveRules();
  $("pMeEmail").value = p.meEmail || "";
  $("pMeDefault").checked = !!p.meDefault;
  renderContacts();
  $("pSigText").value = p.signatureText;
  $("pSigFont").value = p.signatureFont || SIG_FONTS[0].id;
  const mode = p.signatureMode || "draw";
  document.querySelector(`input[name="sigMode"][value="${mode}"]`).checked = true;
  setSigMode(mode, { keep: true });
  drawSignatureImage(p.signatureImage);
}

function renderRosterSettings() {
  const p = state.profile;
  $("pRoster").innerHTML = opt("", "No roster (fill in manually)", !p.rosterId) +
    Object.entries(ROSTERS).map(([id, r]) => opt(id, r.name, p.rosterId === id)).join("");
  $("pRosterWrap").hidden = !p.rosterId;
  if (!p.rosterId) return;
  $("pRoadBase").innerHTML = opt("", "Ask each time", !p.roadBase) + ROAD_STATIONS.map(s => opt(s, s, p.roadBase === s)).join("");
  $("pRosterStart").value = p.rosterAnchor || mondayOf(isoLocal(new Date()));
  $("pRosterLine").innerHTML = opt("", "— Select —", !p.rosterAnchorLine) +
    ROSTERS[p.rosterId].lines.map((l, k) => opt(String(k + 1), `Line ${k + 1}  (${describeCodes(l)})`, p.rosterAnchorLine === k + 1)).join("");
  const thisWE = isoLocal(nextSunday());
  const next = new Date(parseIso(thisWE)); next.setDate(next.getDate() + 7);
  const show = we => { const rw = rosterWeek(we); return rw ? `Line ${rw.line}: ${describeRosterWeek(rw)}` : ""; };
  $("pRosterPreview").innerHTML = p.rosterAnchorLine
    ? `<div><strong>This week</strong> ${esc(show(thisWE))}</div><div><strong>Next week</strong> ${esc(show(isoLocal(next)))}</div>`
    : `<span class="muted">Pick the starting week and its line.</span>`;
}

function describeCodes(line) {
  return line.split("").map(c => c === "R" ? "–" : c === "X" ? "Rd" : c).join(" ");
}

function renderLeaveRules() {
  const cur = stdDayMins();
  const choices = [450, 456, 468, 480];
  if (!choices.includes(cur)) choices.push(cur);
  $("pStdDay").innerHTML = choices.sort((a, b) => a - b).map(m => opt(String(m), `${fmtDur(m)}  (${(m / 60).toFixed(2).replace(/0$/, "")} hours)`, m === cur)).join("");
  const on = stdDayLeaveTypes();
  $("pStdDayLeave").innerHTML = LEAVE_TYPES.filter(l => l !== "Annual Leave" && l !== "Shift Swap").map(l => `
    <label class="check check--small"><input type="checkbox" value="${esc(l)}" ${on.includes(l) ? "checked" : ""}> <span>${esc(l)}</span></label>`).join("");
}

function onLeaveRulesChange() {
  state.profile.stdDayMins = Number($("pStdDay").value) || DEFAULT_STD_DAY_MINS;
  state.profile.stdDayLeave = [...document.querySelectorAll("#pStdDayLeave input:checked")].map(i => i.value);
  saveState();
  if (currentSheet()) renderDays(currentSheet());
  toast("Leave rules saved.");
}

function onRosterChange() {
  const p = state.profile;
  p.rosterId = $("pRoster").value;
  if (!p.rosterId) { p.rosterAnchor = ""; p.rosterAnchorLine = 0; }
  else {
    const start = $("pRosterStart").value || mondayOf(isoLocal(new Date()));
    if (parseIso(start).getDay() !== 1) toast(`Using the Monday of that week: ${displayDate(mondayOf(start))}.`);
    p.rosterAnchor = mondayOf(start);
    p.rosterAnchorLine = Number($("pRosterLine").value) || 0;
  }
  saveState();
  renderRosterSettings();
}

function saveProfile() {
  const p = state.profile;
  p.name = $("pName").value.trim();
  p.grade = $("pGrade").value.trim();
  p.dept = $("pDept").value.trim();
  p.phone = $("pPhone").value.trim();
  p.pps = $("pPps").value.replace(/\s+/g, "").toUpperCase();
  p.number = $("pNumber").value.trim();
  p.base = $("pBase").value;
  p.baseOther = $("pBaseOther").value.trim();
  p.meEmail = $("pMeEmail").value.trim();
  p.meDefault = $("pMeDefault").checked;
  p.contacts = p.contacts.filter(c => c.name || c.email);   // drop empty rows
  renderContacts();
  const bad = [
    ...p.contacts.filter(c => c.email && !isEmail(c.email)).map(c => c.name || ROLE_LABEL[c.role]),
    ...(p.meEmail && !isEmail(p.meEmail) ? ["your own"] : [])
  ];
  storeSignature();
  saveState();
  if (bad.length) return toast(`Check the ${bad.join(" and ")} email address — it doesn't look right.`, true);
  toast("Details saved.");
}

/* Signature ------------------------------------------------------------ */
// Three ways to sign: draw, upload a picture, or type with a chosen font.
// All three end up as the same PNG on the canvas, which goes into C23.

const SIG_FONTS = [
  { id: "dancing", label: "Dancing Script", family: "Dancing Script", size: 84 },
  { id: "vibes",   label: "Great Vibes",    family: "Great Vibes",    size: 92 },
  { id: "caveat",  label: "Caveat",         family: "Caveat",         size: 92 },
  { id: "apple",   label: "Homemade Apple", family: "Homemade Apple", size: 60 },
  { id: "plain",   label: "Plain (Arial)",  family: "Arial, Helvetica, sans-serif", size: 64, italic: true }
];

const sig = { mode: "draw", drawing: false, empty: true, last: null };

function sigCtx() {
  const ctx = $("sigPad").getContext("2d");
  ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.strokeStyle = "#111"; ctx.fillStyle = "#111";
  return ctx;
}
function clearSig() {
  const c = $("sigPad");
  sigCtx().clearRect(0, 0, c.width, c.height);
  sig.empty = true;
}

// Save the current signature into the profile straight away (no need to press Save).
function storeSignature() {
  const p = state.profile;
  p.signatureMode = sig.mode;
  p.signatureText = $("pSigText").value.trim();
  p.signatureFont = $("pSigFont").value;
  p.signatureImage = sig.empty ? "" : trimmedSignature();
}
function storeSignatureAndSave() { storeSignature(); saveState(); }

// Crop transparent margins so the image fills the Excel signature box nicely.
function trimmedSignature() {
  const c = $("sigPad");
  const { data, width, height } = c.getContext("2d").getImageData(0, 0, c.width, c.height);
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 10) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return "";
  const padPx = 6;
  x0 = Math.max(0, x0 - padPx); y0 = Math.max(0, y0 - padPx);
  x1 = Math.min(width - 1, x1 + padPx); y1 = Math.min(height - 1, y1 + padPx);
  const out = document.createElement("canvas");
  out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
  out.getContext("2d").drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL("image/png");
}

function setSigMode(mode, { keep = false } = {}) {
  sig.mode = mode;
  $("sigTypeOpts").hidden = mode !== "type";
  $("sigUploadOpts").hidden = mode !== "upload";
  $("sigPad").classList.toggle("sig-pad--draw", mode === "draw");
  $("sigHint").textContent = {
    draw: "Sign with your finger or mouse",
    upload: "Preview of your uploaded signature",
    type: "Preview of your typed signature"
  }[mode];
  if (keep) return;
  clearSig();
  if (mode === "type") renderTypedSig();
  else storeSignatureAndSave();
}

async function renderTypedSig() {
  const text = $("pSigText").value.trim() || $("pName").value.trim();
  const font = SIG_FONTS.find(f => f.id === $("pSigFont").value) || SIG_FONTS[0];
  const fontCss = size => `${font.italic ? "italic " : ""}${size}px ${font.family.includes(",") ? font.family : `"${font.family}"`}`;
  try { await document.fonts.load(fontCss(font.size), text || "A"); } catch { /* fall back to whatever is available */ }
  if (sig.mode !== "type") return;
  clearSig();
  if (!text) { storeSignatureAndSave(); return; }
  const c = $("sigPad");
  const ctx = sigCtx();
  let size = font.size;
  ctx.font = fontCss(size);
  while (ctx.measureText(text).width > c.width - 40 && size > 20) { size -= 2; ctx.font = fontCss(size); }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, c.width / 2, c.height / 2 + 4);
  sig.empty = false;
  storeSignatureAndSave();
}

function loadSigUpload(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) return toast("Please choose an image file (PNG or JPG).", true);
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const c = $("sigPad");
      clearSig();
      const ctx = sigCtx();
      const scale = Math.min((c.width - 20) / img.width, (c.height - 20) / img.height);
      const w = img.width * scale, h = img.height * scale;
      ctx.drawImage(img, (c.width - w) / 2, (c.height - h) / 2, w, h);
      // Make the paper background transparent and darken the ink.
      const pix = ctx.getImageData(0, 0, c.width, c.height);
      const d = pix.data;
      for (let k = 0; k < d.length; k += 4) {
        if (d[k + 3] === 0) continue;
        const lum = 0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2];
        if (lum > 190) d[k + 3] = 0;
        else if (lum > 140) d[k + 3] = Math.round(d[k + 3] * (190 - lum) / 50);
      }
      ctx.putImageData(pix, 0, 0);
      sig.empty = false;
      storeSignatureAndSave();
      toast("Signature image added.");
    };
    img.onerror = () => toast("That image couldn't be opened.", true);
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function initSigPad() {
  const c = $("sigPad");
  $("pSigFont").innerHTML = SIG_FONTS.map(f => `<option value="${f.id}" style="font-family:${esc(f.family)}">${esc(f.label)}</option>`).join("");
  const pos = e => {
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  };
  c.addEventListener("pointerdown", e => {
    if (sig.mode !== "draw") return;
    const ctx = sigCtx();
    sig.drawing = true; sig.last = pos(e); c.setPointerCapture(e.pointerId);
    ctx.beginPath(); ctx.arc(sig.last.x, sig.last.y, 1.2, 0, Math.PI * 2); ctx.fill();
    sig.empty = false;
  });
  c.addEventListener("pointermove", e => {
    if (!sig.drawing) return;
    const ctx = sigCtx();
    const p = pos(e);
    ctx.beginPath(); ctx.moveTo(sig.last.x, sig.last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    sig.last = p;
  });
  const end = () => { if (sig.drawing) { sig.drawing = false; storeSignatureAndSave(); } };
  c.addEventListener("pointerup", end);
  c.addEventListener("pointercancel", end);
  $("sigClear").addEventListener("click", () => {
    clearSig();
    if (sig.mode === "type") $("pSigText").value = "";
    storeSignatureAndSave();
  });
  $("sigModes").addEventListener("change", e => setSigMode(e.target.value));
  $("pSigText").addEventListener("input", renderTypedSig);
  $("pSigFont").addEventListener("change", renderTypedSig);
  $("sigUpload").addEventListener("change", e => { loadSigUpload(e.target.files[0]); e.target.value = ""; });
}
function resizeSigPad() { sigCtx(); }

// Draw a saved (trimmed) signature centred back onto the canvas.
function drawSignatureImage(dataUrl) {
  clearSig();
  if (!dataUrl) return;
  sig.empty = false;
  const c = $("sigPad");
  const img = new Image();
  img.onload = () => {
    const scale = Math.min(1, (c.width - 10) / img.width, (c.height - 10) / img.height);
    const w = img.width * scale, h = img.height * scale;
    c.getContext("2d").drawImage(img, (c.width - w) / 2, (c.height - h) / 2, w, h);
  };
  img.src = dataUrl;
}

/* ------------------------------------------------------------------ */
/* Timesheet view                                                      */
/* ------------------------------------------------------------------ */

function renderTimesheet() {
  const sheet = currentSheet();
  $("startView").hidden = !!sheet;
  $("editView").hidden = !sheet;
  document.body.classList.toggle("has-bar", !!sheet && document.querySelector('.tab[aria-selected="true"]')?.dataset.tab === "timesheet");
  if (!sheet) return renderStart();

  const p = state.profile;
  $("sheetTitle").textContent = `Week ending ${displayDate(sheet.weekEnding)}`;
  $("sheetStatus").textContent = ["Draft", amendLabel(sheet), sheet.rosterLine ? `Roster line ${sheet.rosterLine}` : ""].filter(Boolean).join(" · ");
  $("sheetStaff").textContent = [p.name || "No name set", p.number ? `#${p.number}` : "", profileBase()].filter(Boolean).join(" · ");
  renderProgress(sheet);
  $("savedIndicator").textContent = `Saved ${new Date(sheet.updatedAt).toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit" })}`;
  renderQuickFill(sheet);
  renderDays(sheet);
}

function renderStart() {
  const p = state.profile;
  $("profileWarning").hidden = !!(p.name && p.number);
  if (!$("weekEnding").value) $("weekEnding").value = isoLocal(nextSunday());
  updateWeekHint();

  const drafts = state.sheets.filter(s => s.status === "draft").sort((a, b) => b.weekEnding.localeCompare(a.weekEnding));
  $("openDrafts").innerHTML = drafts.length ? `
    <h3 class="sub-h">Continue a draft</h3>
    <ul class="plain-list">${drafts.map(s => `
      <li><button class="link-btn" data-open="${esc(s.id)}">Week ending ${esc(displayDate(s.weekEnding))}${amendLabel(s) ? ` (${amendLabel(s)})` : ""}</button>
      <span class="muted">· ${filledCount(s)}/7 days entered</span></li>`).join("")}
    </ul>` : "";
}

function filledCount(s) { return s.days.filter(d => d.roster).length; }

function updateWeekHint() {
  const v = $("weekEnding").value;
  const hint = $("weekEndingHint");
  if (!v) { hint.textContent = ""; return; }
  const d = parseIso(v);
  if (d.getDay() !== 0) {
    const sun = nextSunday(d);
    hint.textContent = `That's not a Sunday — will use ${displayDate(isoLocal(sun))}.`;
  } else {
    hint.textContent = `Monday ${displayDate(weekDates(v)[0])} to Sunday ${displayDate(v)}`;
  }
  const rw = rosterWeek(isoLocal(nextSunday(d)));
  $("weekRoster").innerHTML = rw
    ? `<strong>Roster line ${rw.line}</strong> · ${esc(describeRosterWeek(rw))}<br><span class="muted">Shifts and rest days will be filled in for you.</span>`
    : "";
  $("weekRoster").hidden = !rw;
}

function mondayOf(iso) {
  const d = parseIso(iso);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return isoLocal(d);
}

// Which roster line (1-based) applies to the week ending `weekEndingIso`, or 0 if no roster set.
function rosterLineFor(weekEndingIso) {
  const p = state.profile;
  const r = ROSTERS[p.rosterId];
  if (!r || !p.rosterAnchor || !p.rosterAnchorLine) return 0;
  const mon = parseIso(weekDates(weekEndingIso)[0]);
  const anchor = parseIso(mondayOf(p.rosterAnchor));
  const weeks = Math.round((Date.UTC(mon.getFullYear(), mon.getMonth(), mon.getDate()) - Date.UTC(anchor.getFullYear(), anchor.getMonth(), anchor.getDate())) / (7 * 864e5));
  const n = r.lines.length;
  return (((p.rosterAnchorLine - 1 + weeks) % n) + n) % n + 1;
}

function rosterWeek(weekEndingIso) {
  const line = rosterLineFor(weekEndingIso);
  if (!line) return null;
  const r = ROSTERS[state.profile.rosterId];
  return { line, roster: r, codes: r.lines[line - 1].split("") };
}

function describeRosterWeek(rw) {
  return rw.codes.map((c, i) => `${DAYS[i].short} ${c === "R" ? "Rest" : ROSTER_SHIFTS[c].label}`).join(" · ");
}

// Pre-fill a new timesheet from the roster: shifts "worked as rostered", rest days boxed off.
function applyRoster(sheet) {
  const rw = rosterWeek(sheet.weekEnding);
  if (!rw) return false;
  sheet.rosterLine = rw.line;
  sheet.rosterName = rw.roster.name;
  rw.codes.forEach((code, i) => {
    const d = sheet.days[i];
    const sh = ROSTER_SHIFTS[code];
    d.station = code === "X" ? (state.profile.roadBase || "") : rw.roster.station;
    d.rosterLabel = sh.label;
    if (code === "R") {
      d.roster = "rest"; d.actual = "none"; d.done = false;   // confirmed with one tap as the week goes on
    } else {
      d.roster = "times"; d.rosterFrom = sh.start; d.rosterTo = sh.finish; d.actual = "same";
    }
  });
  sheet.history.push({ action: `Filled from ${rw.roster.name}, line ${rw.line}`, at: new Date().toISOString() });
  return true;
}

function startTimesheet() {
  const v = $("weekEnding").value;
  if (!v) return toast("Pick the week-ending Sunday.", true);
  const we = isoLocal(nextSunday(parseIso(v)));
  const existing = state.sheets.find(s => s.status === "draft" && s.weekEnding === we);
  if (existing) {
    state.currentId = existing.id;
    toast("You already had a draft for that week — opened it.");
  } else {
    const published = state.sheets.find(s => s.status === "published" && s.weekEnding === we);
    if (published && !confirm(`You've already published week ending ${displayDate(we)}. Start a brand-new one anyway?\n\n(To change the published one, use "Revise" in the Library.)`)) return;
    const sheet = newSheet(we);
    const base = state.profile.base;
    if (base) sheet.days.forEach(d => { d.station = base; });
    if (applyRoster(sheet)) {
      applyLeavePeriods(sheet);            // e.g. maternity leave from a filled form
      const firstShift = sheet.days.findIndex(d => !d.done && !isPlainRest(d));
      if (firstShift >= 0) ui.pendingOpen = firstShift;
    }
    state.sheets.push(sheet);
    state.currentId = sheet.id;
  }
  ui.expanded.clear();
  ui.shiftEdit.clear();
  if (ui.pendingOpen !== undefined) { ui.expanded.add(ui.pendingOpen); delete ui.pendingOpen; }
  ui.selectedDays.clear();
  saveState();
  renderTimesheet();
  setQuickFillOpen();
}

/* Quick fill ---------------------------------------------------------- */

function renderQuickFill(sheet) {
  $("dayChips").innerHTML = sheet.days.map((d, i) => `
    <button type="button" class="chip${ui.selectedDays.has(i) ? " chip--on" : ""}" data-chip="${i}" aria-pressed="${ui.selectedDays.has(i)}">
      <span>${DAYS[i].short}</span><small>${shortDate(d.date)}</small>
    </button>`).join("") +
    `<button type="button" class="chip chip--util" data-chip="weekdays">Mon–Fri</button>
     <button type="button" class="chip chip--util" data-chip="none">Clear</button>`;

  const qs = $("qStation");
  if (!qs.options.length) {
    qs.innerHTML = STATIONS.map(s => opt(s, s, s === (state.profile.base || "Sligo"))).join("");
  }
  const prev = $("qShift").value || (sheet.days.some(d => d.roster === "times") ? "keep" : "");
  $("qShift").innerHTML = opt("keep", "Keep rostered shift", prev === "keep") + rosterOptions(qs.value, prev).replace(opt("", "— Select —", prev === ""), "");
  if (!$("qActual").options.length) {
    $("qActual").innerHTML = opt("same", "Worked as rostered", true) + opt("later", "I'll enter actual times per day", false) +
      `<optgroup label="Leave">${LEAVE_TYPES.map(l => opt(`leave:${l}`, l, false)).join("")}</optgroup>`;
  }
  if (prev && [...$("qShift").options].some(o => o.value === prev)) $("qShift").value = prev;
  updateQuickVisibility();
}

function updateQuickVisibility() {
  const v = $("qShift").value;
  $("qOtherWrap").hidden = v !== "other";
  $("qActualWrap").hidden = !(v.startsWith("shift:") || v === "other" || v === "keep");
  $("qSwapWrap").hidden = $("qActualWrap").hidden || $("qActual").value !== "leave:Shift Swap";
}

function applyQuickFill() {
  const sheet = currentSheet();
  if (!sheet) return;
  const days = [...ui.selectedDays].sort();
  if (!days.length) return toast("Tap one or more days first.", true);
  const value = $("qShift").value;
  const station = $("qStation").value;
  let otherStart = null, otherFinish = null;
  if (value === "other") {
    otherStart = $("qOtherStart").value;
    otherFinish = $("qOtherFinish").value || addHours(otherStart, Number($("qOtherHours").value) / 60);
    if (!isTime(otherStart) || !isTime(otherFinish)) return toast("Enter a start time and a finish time (or hours).", true);
  }
  const actualMode = $("qActual").value;
  const skipped = [];
  for (const i of days) {
    const d = sheet.days[i];
    if (value === "keep") {
      if (d.roster !== "times") { skipped.push(DAYS[i].short); continue; }   // nothing rostered to keep
    } else {
      d.station = station;
      applyRosterValue(d, value, otherStart, otherFinish);
    }
    if (d.roster === "times") {
      if (actualMode === "same") d.actual = "same";
      else if (actualMode.startsWith("leave:")) { d.actual = "leave"; d.actualLeave = actualMode.slice(6); }
      else { d.actual = "times"; d.actualFrom = d.rosterFrom; d.actualTo = d.rosterTo; ui.expanded.add(i); }
    }
    if (actualMode === "leave:Shift Swap") d.swapNote = $("qSwapNote").value.trim();
    autoOvertime(d);
  }
  if (skipped.length) toast(`${skipped.join(", ")}: no rostered shift to keep — pick a shift for ${skipped.length > 1 ? "those days" : "that day"}.`, true);
  const label = [$("qShift").selectedOptions[0]?.textContent || value, $("qActualWrap").hidden ? "" : $("qActual").selectedOptions[0]?.textContent].filter(Boolean).join(" / ");
  touch(sheet, `Quick fill: ${label} → ${days.map(i => DAYS[i].short).join(", ")}`);
  ui.selectedDays.clear();
  saveState();
  renderTimesheet();
  if (!skipped.length) toast(`Applied to ${days.length} day${days.length > 1 ? "s" : ""}.`);
}

/* Day cards ---------------------------------------------------------- */

// A plain rest day (nothing worked or claimed) shows as one slim line unless opened.
function isPlainRest(d) {
  return d.roster === "rest" && resolvedActual(d).kind === "none" && !d.ot && !d.subs;
}

/* ---------- leave periods from filled HSE forms (e.g. maternity, parental) ----------
 * Saving a form such as HR 108(i) Maternity Leave records its leave dates here. Every rostered
 * shift in those dates — on draft timesheets now, and on timesheets started later — is marked as
 * that leave. Published timesheets are never changed (use Revise). */

function leavePeriodOn(dateIso) {
  return (state.leavePeriods || []).find(p => p.from <= dateIso && dateIso <= p.to) || null;
}
// Mark the rostered shifts on a draft that fall in a leave period. Returns how many days changed.
function applyLeavePeriods(sheet) {
  if (sheet.status !== "draft") return 0;
  let n = 0;
  sheet.days.forEach(d => {
    const p = leavePeriodOn(d.date);
    if (!p || d.roster !== "times" || d.actual !== "same") return;   // rest days, and days already changed by hand, stay as they are
    d.actual = "leave"; d.actualLeave = p.type; d.leaveSource = p.id; d.done = true;
    n++;
  });
  if (n) sheet.history.push({ action: `Leave added from ${n === 1 ? "a form" : "forms"}`, at: new Date().toISOString() });
  return n;
}
// Undo a leave period on draft timesheets: its days go back to "worked as rostered".
function clearLeavePeriod(p) {
  for (const s of state.sheets.filter(s => s.status === "draft")) {
    s.days.forEach(d => {
      if (d.leaveSource !== p.id) return;
      if (d.actual === "leave" && d.actualLeave === p.type) { d.actual = "same"; d.actualLeave = ""; d.done = false; }
      delete d.leaveSource;
    });
  }
}
// Replace the leave periods that came from one filled form. Returns what changed, for the message.
function setFormLeavePeriods(formId, ranges, source, kind = "form") {
  state.leavePeriods = state.leavePeriods || [];
  state.leavePeriods.filter(p => p.formId === formId).forEach(clearLeavePeriod);
  state.leavePeriods = state.leavePeriods.filter(p => p.formId !== formId);
  const added = ranges.map(r => ({ id: newId(), formId, type: r.type, from: r.from, to: r.to, source, kind }));
  state.leavePeriods.push(...added);
  let days = 0, sheets = 0;
  for (const s of state.sheets) { const n = applyLeavePeriods(s); if (n) { days += n; sheets++; } }
  const published = state.sheets.filter(s => s.status === "published" && !state.sheets.some(o => o.revisionOf === s.id) &&
    added.some(p => s.days.some(d => p.from <= d.date && d.date <= p.to && d.roster === "times" && !(d.actual === "leave" && d.actualLeave === p.type))))
    .map(s => s.weekEnding);
  saveState();
  if (currentSheet()) renderTimesheet();
  return { periods: added, days, sheets, published };
}

/* ---------- leave days → HSE leave forms (setups in form-profiles.js) ---------- */

function dayLeaveType(d) {
  if (d.actual === "leave") return d.actualLeave || "";
  if (d.actual === "partleave") return d.partLeave || "";
  if (d.roster === "leave") return d.rosterLeave || "";
  return "";
}
function leaveFormProfile(type) {
  return (type && typeof FORM_PROFILES !== "undefined" && FORM_PROFILES.find(p => p.leaveType === type && p.file)) || null;
}
// The stretch of this week taken as the same leave around day i. Rest days in between don't break it.
function leaveRun(sheet, i) {
  const type = dayLeaveType(sheet.days[i]);
  let a = i, b = i;
  for (let k = i - 1; k >= 0; k--) { const d = sheet.days[k]; if (dayLeaveType(d) === type) a = k; else if (!isPlainRest(d)) break; }
  for (let k = i + 1; k < 7; k++) { const d = sheet.days[k]; if (dayLeaveType(d) === type) b = k; else if (!isPlainRest(d)) break; }
  const days = sheet.days.slice(a, b + 1).filter(d => dayLeaveType(d) === type).length;
  return { type, from: sheet.days[a].date, to: sheet.days[b].date, days };
}
// A filled form already made for this leave (same timesheet, same leave, overlapping dates).
function linkedLeaveForm(sheet, run) {
  return (state.forms || []).find(r => r.link && r.link.sheetId === sheet.id && r.link.type === run.type && r.link.from <= run.to && r.link.to >= run.from) || null;
}
function leaveFormRow(d, i) {
  const sheet = currentSheet();
  const period = d.leaveSource && d.actual === "leave" && (state.leavePeriods || []).find(p => p.id === d.leaveSource);
  if (period && period.kind === "request") {
    const req = (state.leaveRequests || []).find(r => r.id === period.formId);
    return `
    <div class="leave-form">
      <div class="leave-form__text">
        <strong>${esc(period.type)} — ${req?.status === "approved" ? "approved" : "requested by email"}</strong>
        <span class="muted">${shortDate(period.from)}${period.from === period.to ? "" : ` – ${shortDate(period.to)}`}</span>
      </div>
      <button type="button" class="btn btn--small" data-goto="leave">Open in Leave</button>
    </div>`;
  }
  if (period) {
    return `
    <div class="leave-form">
      <div class="leave-form__text">
        <strong>Added from your ${esc(period.source)} form</strong>
        <span class="muted">${esc(period.type)} ${shortDate(period.from)} – ${shortDate(period.to)}</span>
      </div>
      <button type="button" class="btn btn--small" data-leave-period="${esc(period.id)}">Open form</button>
    </div>`;
  }
  const p = sheet && leaveFormProfile(dayLeaveType(d));
  if (!p) return "";
  const run = leaveRun(sheet, i);
  const rec = linkedLeaveForm(sheet, run);
  const sent = rec?.sends?.length ? new Date(rec.sends.at(-1)) : null;
  const span = run.from === run.to ? shortDate(run.from) : `${shortDate(run.from)} – ${shortDate(run.to)}`;
  return `
    <div class="leave-form">
      <div class="leave-form__text">
        <strong>${esc(p.code)} ${esc(p.title)} form</strong>
        <span class="muted">${span} · ${run.days} day${run.days === 1 ? "" : "s"}</span>
        ${rec ? `<span class="chip2 chip-leave">${sent ? `Sent ${esc(sent.toLocaleDateString("en-IE", { day: "2-digit", month: "2-digit" }))}` : "Filled in"}</span>` : ""}
      </div>
      <button type="button" class="btn btn--small" data-leave-form="${i}">${rec ? "Open form" : "Fill in the form"}</button>
    </div>`;
}

function renderDays(sheet) {
  $("dayList").innerHTML = sheet.days.map((d, i) => dayCard(d, i)).join("");
}

// Next shift day (not a plain rest day) after `i` that still needs doing, or -1.
function nextWorkDay(sheet, i) {
  for (let k = i + 1; k < 7; k++) if (!sheet.days[k].done && !isPlainRest(sheet.days[k])) return k;
  return -1;
}

function confirmRest(i) {
  const sheet = currentSheet();
  if (!sheet) return;
  sheet.days[i].done = true;
  touch(sheet, `${DAYS[i].short} rest day confirmed`);
  saveState();
  rerenderDay(i);
  renderProgress(sheet);
}

function workedRest(i) {
  const sheet = currentSheet();
  if (!sheet) return;
  const d = sheet.days[i];
  d.actual = "times";
  d.workType = "";          // user picks Overtime or TOIL
  d.done = false;
  ui.expanded.add(i);
  touch(sheet, `${DAYS[i].short} rest day worked`);
  saveState();
  rerenderDay(i);
  renderProgress(sheet);
  document.querySelector(`[data-day-card="${i}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  toast("Choose Overtime or TOIL, then the times you worked.");
}

function rerenderDay(i) {
  const sheet = currentSheet();
  const el = document.querySelector(`[data-day-card="${i}"]`);
  if (!sheet || !el) return;
  const active = document.activeElement;
  const focusKey = active && el.contains(active) && active.dataset.f
    ? `[data-f="${active.dataset.f}"][data-i="${i}"]${active.type === "radio" ? `[value="${active.value}"]` : ""}`
    : null;
  const tmp = document.createElement("div");
  tmp.innerHTML = dayCard(sheet.days[i], i);
  el.replaceWith(tmp.firstElementChild);
  if (focusKey) document.querySelector(focusKey)?.focus({ preventScroll: true });
  renderProgress(sheet);
}

// Short coloured labels for a day's header, e.g. [Day 07–19] [Ext +1h 30m] [OT 19:00–20:30].
function hh(t) { return isTime(t) ? (t.endsWith(":00") ? t.slice(0, 2) : t) : t; }
function dayChips(d) {
  const chips = [];
  const a = resolvedActual(d);
  if (!d.roster) chips.push(["Not entered", "chip-empty"]);
  else if (d.roster === "rest") chips.push(["Rest Day", "chip-rest"]);
  else if (d.roster === "leave") chips.push([d.rosterLeave, "chip-leave"]);
  else {
    const night = isTime(d.rosterFrom) && isTime(d.rosterTo) && toMin(d.rosterFrom) > toMin(d.rosterTo);
    const kind = d.rosterLabel === "Road" ? "road" : night ? "night" : "day";
    const name = d.rosterLabel && d.rosterLabel !== "Rest Day" ? d.rosterLabel : night ? "Night" : "Day";
    const where = d.rosterLabel === "Road" ? ` · ${d.station || "station?"}` : "";
    chips.push([`${name}${where} ${hh(d.rosterFrom)}–${hh(d.rosterTo)}`, `chip-${kind}`]);
  }
  const m = fmtDur(d.actualMins);
  if (d.roster === "times") {
    if (d.actual === "early") chips.push([d.actualMins ? `Early −${m}${d.earlyReason ? ` · ${d.earlyReason === "Other" ? (d.earlyNote || "Other") : d.earlyReason}` : ""}` : "Early – how long?", "chip-warn-soft"]);
    else if (d.actual === "extended") chips.push([d.actualMins ? `Ext +${m}` : "Ext – how long?", "chip-ot"]);
    else if (d.actual === "late") chips.push([d.actualMins ? `${d.lateReason === "Compensatory Rest" ? "Comp rest" : "Late start"} +${m}` : "Late – how long?", "chip-warn-soft"]);
    else if (d.actual === "partleave") chips.push([d.partLeave && isTime(d.partFrom) ? `${d.partLeave} ${fmtDur(partLeaveMins(d))} + ${d.partNote.trim() || "worked"} ${d.partFrom}–${d.partTo}` : "Part leave – details?", "chip-leave"]);
    else if (d.actual === "times" && a.kind === "times") chips.push([`Actual ${a.from}–${a.to}`, "chip-plain"]);
    else if (d.actual === "leave") {
      const tu = topUpMins(d);
      if (!tu) chips.push([d.actualLeave || "Leave?", "chip-leave"]);
      else if (!d.topUp) { chips.push([`${d.actualLeave} ${fmtDur(stdDayMins())}`, "chip-leave"]); chips.push([`Top up ${fmtDur(tu)}?`, "chip-warn"]); }
      else chips.push([`${d.actualLeave} ${fmtDur(stdDayMins())} + ${d.topUp === "al" ? "AL" : d.topUp === "toil" ? "TOIL" : `worked ${d.topFrom}–${d.topTo}`}${d.topUp === "worked" ? "" : ` ${fmtDur(tu)}`}`, "chip-leave"]);
    }
    else if (d.actual === "none") chips.push(["Not worked", "chip-plain"]);
  } else if (d.roster === "rest" && a.kind === "times") {
    const wt = restWorkType(d);
    chips.push([wt === "toil" ? `Bank TOIL ${a.from}–${a.to}` : wt === "ot" ? `Worked OT ${a.from}–${a.to}` : "Worked – OT or TOIL?", wt ? "chip-ot" : "chip-warn"]);
  }
  if (d.ot && !isRestWorked(d)) chips.push([`OT ${d.otFrom}–${d.otTo}`, "chip-ot"]);
  if (d.ot && !d.otReason.trim() && !isBankToil(d)) chips.push(["Incident no. needed", "chip-warn"]);
  if (d.subs) chips.push(["Subsistence", "chip-subs"]);
  return chips;
}

function dayHead(d, i, open, extra = "") {
  const dt = parseIso(d.date);
  const chips = dayChips(d).map(([t, c]) => `<span class="chip2 ${c}">${esc(t)}</span>`).join("");
  return `
    <button type="button" class="day__head" data-toggle="${i}" aria-expanded="${open}">
      <span class="day__date"><span class="day__dow">${DAYS[i].short}</span><span class="day__dnum">${dt.getDate()}</span></span>
      <span class="day__main">
        <span class="day__title">${d.done ? `<span class="day__tick" aria-label="Done">✓</span>` : ""}${DAYS[i].name}${extra}</span>
        <span class="day__flags">${chips}</span>
        <span class="day__sum visually-hidden">${esc(daySummary(d).text)}</span>
      </span>
      <span class="day__chev" aria-hidden="true"></span>
    </button>`;
}

function dayCard(d, i) {
  const open = ui.expanded.has(i);
  if (!open && isPlainRest(d)) {
    return `
  <article class="day day--rest ${d.done ? "day--done" : ""}" data-day-card="${i}">
    ${dayHead(d, i, false, d.done ? "" : ` <small class="day__ask">confirm?</small>`).replace(`${esc(daySummary(d).text)}</span>`, `Rest Day${d.done ? "" : " — confirm?"}</span>`)}
    ${d.done ? "" : `
    <div class="rest-actions">
      <button type="button" class="btn btn--small btn--primary" data-rest-ok="${i}">✓ Rest day</button>
      <button type="button" class="btn btn--small" data-rest-worked="${i}">Worked (OT / TOIL)</button>
    </div>`}
  </article>`;
  }
  const sum = daySummary(d);
  return `
  <article class="day ${open ? "day--open" : ""} ${d.done ? "day--done" : ""} ${sum.cls}" data-day-card="${i}">
    ${dayHead(d, i, open)}
    ${open ? dayEditor(d, i) : ""}
  </article>`;
}

function dayEditor(d, i) {
  const rv = rosterValue(d);
  const st = d.station || state.profile.base || "Other";
  const isTimes = d.roster === "times";
  const isRoad = isTimes && d.rosterLabel === "Road";
  const isSwap = d.rosterLeave === "Shift Swap" || (d.actual === "leave" && d.actualLeave === "Shift Swap");

  const shiftLen = shiftMins(d.rosterFrom, d.rosterTo);
  const a = resolvedActual(d);
  const showShift = ui.shiftEdit.has(i) || d.roster !== "times" || rv === "other" || (isRoad && !ROAD_STATIONS.includes(d.station));
  if (!showShift) {
    return `
  <div class="day__body">
    <div class="shift-line">
      <span><strong>${esc(d.station || st)}</strong> · ${esc(d.rosterLabel && d.rosterLabel !== "Rest Day" ? d.rosterLabel + " " : "")}${esc(d.rosterFrom)}–${esc(d.rosterTo)} · ${fmtDur(shiftLen)}</span>
      <button type="button" class="link-btn" data-shift-edit="${i}">Change</button>
    </div>
    ${dayEditorRest(d, i, { isTimes, isRoad, isSwap, shiftLen, a })}`;
  }
  return `
  <div class="day__body">
    <div class="grid-2">
      <div class="field">
        <label>Station${isRoad ? ` <span class="req">required</span>` : ""}</label>
        ${isRoad
          ? `<select data-f="station" data-i="${i}" class="${ROAD_STATIONS.includes(d.station) ? "" : "needs"}">${opt("", "— Road shift from —", !ROAD_STATIONS.includes(d.station))}${ROAD_STATIONS.map(s => opt(s, s, s === d.station)).join("")}</select>`
          : `<select data-f="station" data-i="${i}">${STATIONS.map(s => opt(s, s, s === st)).join("")}</select>`}
      </div>
      <div class="field">
        <label>Rostered</label>
        <select data-f="rosterValue" data-i="${i}">${rosterOptions(isRoad ? "Other" : st, rv)}</select>
      </div>
    </div>

    ${isTimes ? `
    <div class="grid-3">
      <div class="field"><label>Roster from</label>${timeSelect("rosterFrom", i, d.rosterFrom)}</div>
      <div class="field"><label>Roster to</label>${timeSelect("rosterTo", i, d.rosterTo)}</div>
      <div class="field"><label>Hours</label><select data-f="rosterHours" data-i="${i}">${durOptions(shiftLen, 24 * 60, "hrs")}</select></div>
    </div>` : ""}

    ${dayEditorRest(d, i, { isTimes, isRoad, isSwap, shiftLen, a })}`;
}

// Everything below the shift fields: what happened, overtime, subsistence, buttons.
function dayEditorRest(d, i, { isTimes, isSwap, shiftLen, a }) {
  const actualOpts = [
    isTimes ? opt("same", "Finished as rostered", d.actual === "same") : "",
    isTimes ? opt("early", "Finished early", d.actual === "early") : "",
    isTimes ? opt("extended", "Extended duty (finished late)", d.actual === "extended") : "",
    isTimes ? opt("late", "Comp rest / late start", d.actual === "late") : "",
    d.roster === "leave" ? opt("same", `Same as roster (${d.rosterLeave})`, d.actual === "same") : "",
    d.roster === "rest"
      ? (isRestWorked(d) && !restWorkType(d) ? opt("times", "Worked – choose Overtime or TOIL", true) : "") +
        opt("rest-ot", "Worked – Overtime", isRestWorked(d) && restWorkType(d) === "ot") +
        opt("rest-toil", "Worked – TOIL", isRestWorked(d) && restWorkType(d) === "toil")
      : opt("times", "Other times (e.g. started late)", d.actual === "times"),
    opt("none", d.roster === "rest" ? "Not worked (Rest Day)" : "Not worked", d.actual === "none"),
    `<optgroup label="Leave">${LEAVE_TYPES.map(l => opt(`leave:${l}`, l, d.actual === "leave" && d.actualLeave === l)).join("")}${isTimes ? opt("partleave", "Leave + part shift / meeting", d.actual === "partleave") : ""}</optgroup>`
  ].join("");
  return `
    ${d.roster ? `
    <div class="field">
      <label>What happened</label>
      <select data-f="actual" data-i="${i}">${actualOpts}</select>
    </div>` : ""}

    ${isTimes && ["early", "extended", "late"].includes(d.actual) ? `
    <div class="grid-2">
      <div class="field">
        <label>${{ early: "Finished early by", extended: "Extended by", late: "Start delayed by" }[d.actual]}</label>
        <select data-f="actualMins" data-i="${i}" class="${d.actualMins ? "" : "needs"}">${durOptions(d.actualMins, d.actual === "extended" ? 12 * 60 : Math.max(15, shiftLen - 15))}</select>
      </div>
      ${d.actual === "late" ? `
      <div class="field">
        <label>Comp rest or late start? <span class="req">required</span></label>
        <select data-f="lateReason" data-i="${i}" class="${d.lateReason ? "" : "needs"}">${opt("", "— Select —", !d.lateReason)}${LATE_REASONS.map(r => opt(r, r, d.lateReason === r)).join("")}</select>
      </div>` : ""}
      ${d.actual === "early" ? `
      <div class="field">
        <label>Reason <span class="req">required</span></label>
        <select data-f="earlyReason" data-i="${i}" class="${d.earlyReason ? "" : "needs"}">${opt("", "— Select —", !d.earlyReason)}${EARLY_REASONS.map(r => opt(r, r, d.earlyReason === r)).join("")}</select>
      </div>` : ""}
    </div>
    ${d.actual === "early" && d.earlyReason === "Other" ? `
    <div class="field">
      <label>Reason (details) <span class="req">required</span></label>
      <input type="text" data-f="earlyNote" data-i="${i}" value="${esc(d.earlyNote)}" placeholder="Why did you finish early?" class="${d.earlyNote.trim() ? "" : "needs"}">
    </div>` : ""}
    ${d.actual === "late" && d.lateReason === "Late Start" ? `
    <div class="field">
      <label>Reason (optional)</label>
      <input type="text" data-f="lateNote" data-i="${i}" value="${esc(d.lateNote)}" placeholder="e.g. traffic, previous call">
    </div>` : ""}
    ${d.actualMins ? `
    <div class="calc">
      <div><span>Actual</span><strong>${esc(a.from)} – ${esc(a.to)}</strong></div>
      <div><span>Hours worked</span><strong>${fmtDur(shiftMins(a.from, a.to))}</strong></div>
      <div><span>${d.actual === "extended" ? "Overtime" : "Short by"}</span><strong>${fmtDur(d.actualMins)}</strong></div>
    </div>` : ""}` : ""}

    ${d.actual === "partleave" && isTimes ? `
    <div class="field">
      <label>Leave type <span class="req">required</span></label>
      <select data-f="partLeave" data-i="${i}" class="${d.partLeave ? "" : "needs"}">${opt("", "— Select —", !d.partLeave)}${LEAVE_TYPES.filter(l => l !== "Shift Swap").map(l => opt(l, l, d.partLeave === l)).join("")}</select>
    </div>
    <label class="check check--small">
      <input type="checkbox" data-f="partRostered" data-i="${i}" ${d.partRostered === true ? "checked" : ""}>
      <span>Show the leave in the Roster row <small class="muted">(instead of the shift times ${esc(d.rosterFrom)}–${esc(d.rosterTo)})</small></span>
    </label>
    <div class="grid-2">
      <div class="field"><label>Worked from <span class="opt">can be outside the shift</span></label>${timeSelect("partFrom", i, d.partFrom).replace('class="time-select"', `class="time-select ${isTime(d.partFrom) ? "" : "needs"}"`)}</div>
      <div class="field"><label>Worked to</label>${timeSelect("partTo", i, d.partTo).replace('class="time-select"', `class="time-select ${isTime(d.partTo) ? "" : "needs"}"`)}</div>
    </div>
    <div class="field">
      <label>What you worked <span class="opt">optional</span></label>
      <input type="text" data-f="partNote" data-i="${i}" value="${esc(d.partNote)}" list="partNoteList" placeholder="Meeting, part shift…">
    </div>
    ${isTime(d.partFrom) && isTime(d.partTo) ? `
    <div class="calc">
      <div><span>Rostered</span><strong>${fmtDur(shiftLen)}</strong></div>
      <div><span>Worked</span><strong>${fmtDur(shiftMins(d.partFrom, d.partTo))}</strong></div>
      <div><span>${esc(d.partLeave || "Leave")}</span><strong>${fmtDur(partLeaveMins(d))}</strong></div>
    </div>` : ""}` : ""}

    ${d.actual === "times" && d.roster ? `
    <div class="grid-3">
      <div class="field"><label>Actual from</label>${timeSelect("actualFrom", i, d.actualFrom)}</div>
      <div class="field"><label>Actual to</label>${timeSelect("actualTo", i, d.actualTo)}</div>
      <div class="field"><label>Hours</label><select data-f="actualHours" data-i="${i}">${durOptions(shiftMins(d.actualFrom, d.actualTo), 24 * 60, "hrs")}</select></div>
    </div>
    ${isRestWorked(d) && restWorkType(d) === "toil" ? `
    <div class="field">
      <label>TOIL note <span class="opt">optional</span></label>
      <input type="text" data-f="toilNote" data-i="${i}" value="${esc(d.toilNote || "")}" list="workNoteList" placeholder="e.g. Meeting, cover">
    </div>
    <p class="hint">Overtime columns are filled in as normal; the notes column says “Bank TOIL”.</p>` : ""}` : ""}


    ${topUpMins(d) ? (() => {
      const tu = topUpMins(d);
      return `
    <div class="topup">
      <div class="calc">
        <div><span>Shift</span><strong>${fmtDur(shiftLen)}</strong></div>
        <div><span>${esc(d.actualLeave)}</span><strong>${fmtDur(stdDayMins())}</strong></div>
        <div><span>To top up</span><strong>${fmtDur(tu)}</strong></div>
      </div>
      <div class="field">
        <span class="label">Cover the other ${fmtDur(tu)} with <span class="req">required</span></span>
        <div class="segmented">${TOP_UPS.map(t => `<label><input type="radio" name="topUp${i}" data-f="topUp" data-i="${i}" value="${t.id}" ${d.topUp === t.id ? "checked" : ""}> ${t.label}</label>`).join("")}</div>
      </div>
      ${d.topUp === "worked" ? `
      <div class="grid-2">
        <div class="field"><label>Worked from</label>${timeSelect("topFrom", i, d.topFrom)}</div>
        <div class="field"><label>Worked to</label>${timeSelect("topTo", i, d.topTo)}</div>
      </div>
      ${isTime(d.topFrom) && isTime(d.topTo) && shiftMins(d.topFrom, d.topTo) !== tu ? `<p class="hint warn-text">That's ${fmtDur(shiftMins(d.topFrom, d.topTo))} — the top-up needed is ${fmtDur(tu)}.</p>` : ""}` : ""}
    </div>`;
    })() : ""}

    ${leaveFormRow(d, i)}

    ${isSwap ? `
    <div class="field">
      <label>Shift swap note (optional)</label>
      <input type="text" data-f="swapNote" data-i="${i}" value="${esc(d.swapNote)}" placeholder="Swapped with / reason">
    </div>` : ""}

    ${isRestWorked(d) && restWorkType(d) ? `
    <fieldset class="sub" aria-label="Overtime">
      <div class="toggle-row"><span class="toggle-row__label">Overtime</span>
        <span class="chip2 chip-ot">${isTime(d.actualFrom) && isTime(d.actualTo) ? `${esc(d.actualFrom)}–${esc(d.actualTo)} · ${fmtDur(shiftMins(d.actualFrom, d.actualTo))}` : "enter the times above"}</span></div>
      <p class="hint">Overtime From/To always match the actual times on a worked rest day.</p>
      ${restWorkType(d) === "ot" ? `
      <div class="field">
        <label>Reason / incident number <span class="req">required</span></label>
        <input type="text" data-f="otReason" data-i="${i}" value="${esc(d.otReason)}" list="workNoteList" placeholder="e.g. Meeting, incident number" class="${d.otReason.trim() ? "" : "needs"}">
      </div>` : ""}
    </fieldset>` : ""}

    ${d.roster ? `
    ${isRestWorked(d) && restWorkType(d) ? "" : `
    <fieldset class="sub" aria-label="Overtime worked?">
      <div class="toggle-row"><span class="toggle-row__label">Overtime worked?</span>
      <div class="segmented segmented--compact">
        <label><input type="radio" name="ot${i}" data-f="ot" data-i="${i}" value="no" ${!d.ot ? "checked" : ""}> No</label>
        <label><input type="radio" name="ot${i}" data-f="ot" data-i="${i}" value="yes" ${d.ot ? "checked" : ""}> Yes</label>
      </div></div>
      ${d.ot ? `
      ${d.otAuto ? `<p class="hint">Worked out from your actual finish time${d.otFrom && d.otTo ? ` (${fmtDur(shiftMins(d.otFrom, d.otTo))})` : ""}. Change it if needed.</p>` : ""}
      <div class="grid-2">
        <div class="field"><label>OT from</label>${timeSelect("otFrom", i, d.otFrom)}</div>
        <div class="field"><label>OT to</label>${timeSelect("otTo", i, d.otTo)}</div>
      </div>
      ${isBankToil(d) ? `<p class="hint">Marked <strong>Bank TOIL</strong> in the notes column${(d.toilNote || "").trim() ? ` (“Bank TOIL – ${esc(d.toilNote.trim())}”)` : ""}.</p>` : `
      <div class="field">
        ${d.actual === "extended" && isTimes ? `
        <label>Incident number <span class="req">required</span></label>
        <div class="prefixed"><span class="prefixed__pre">Ext Duty</span><input type="text" data-f="otReason" data-i="${i}" value="${esc(stripExtDuty(d.otReason))}" inputmode="numeric" placeholder="e.g. 1234567" class="${d.otReason.trim() ? "" : "needs"}"></div>
        <small class="hint">Goes on the sheet as "Ext Duty ${esc(stripExtDuty(d.otReason) || "1234567")}".</small>` : `
        <label>Incident number / reason <span class="req">required</span></label>
        <input type="text" data-f="otReason" data-i="${i}" value="${esc(d.otReason)}" placeholder="e.g. incident number, late call" class="${d.otReason.trim() ? "" : "needs"}">`}
      </div>`}` : ""}
    </fieldset>`}

    <fieldset class="sub" aria-label="Subsistence?">
      <div class="toggle-row"><span class="toggle-row__label">Subsistence?</span>
      <div class="segmented segmented--compact">
        <label><input type="radio" name="subs${i}" data-f="subs" data-i="${i}" value="no" ${!d.subs ? "checked" : ""}> No</label>
        <label><input type="radio" name="subs${i}" data-f="subs" data-i="${i}" value="yes" ${d.subs ? "checked" : ""}> Yes</label>
      </div></div>
      ${d.subs ? `
      <div class="grid-2">
        <div class="field"><label>From</label>${timeSelect("subsFrom", i, d.subsFrom)}</div>
        <div class="field"><label>To</label>${timeSelect("subsTo", i, d.subsTo)}</div>
        <div class="field"><label>Rate</label><select data-f="subsRate" data-i="${i}">${opt("", "— Select —", !d.subsRate)}${["5 hr", "10 hr"].map(r => opt(r, r, d.subsRate === r)).join("")}</select></div>
        <div class="field"><label>Location</label><input type="text" data-f="subsLocation" data-i="${i}" value="${esc(d.subsLocation)}" placeholder="e.g. Sligo UH"></div>
        <div class="field"><label>Callsign <span class="opt">optional</span></label><input type="text" data-f="subsVehicle" data-i="${i}" value="${esc(d.subsVehicle)}" list="vehicleList" autocapitalize="characters" placeholder="Vehicle callsign"></div>
      </div>` : ""}
    </fieldset>` : ""}

    <div class="day__foot">
      <button type="button" class="btn btn--small btn--ghost" data-copy-next="${i}" ${i === 6 ? "disabled" : ""}>Copy to next day</button>
      <button type="button" class="btn btn--small btn--primary day__done" data-done="${i}" ${d.roster ? "" : "disabled"}>✓ Done${nextOpenDay(currentSheet(), i) >= 0 ? " – next day" : ""}</button>
      <button type="button" class="btn btn--small btn--ghost" data-clear-day="${i}">Clear day</button>
    </div>
  </div>`;
}

// Field changes inside a day card.
function onDayInput(e) {
  const el = e.target;
  const f = el.dataset.f;
  if (!f || el.dataset.i === undefined) return;
  const i = Number(el.dataset.i);
  const sheet = currentSheet();
  if (!sheet) return;
  const d = sheet.days[i];

  // Plain text fields: save without re-rendering (keeps the keyboard open).
  const textFields = ["otReason", "subsLocation", "subsVehicle", "swapNote", "earlyNote", "lateNote", "partNote", "toilNote"];
  if (textFields.includes(f)) {
    d[f] = el.value;
    if (["otReason", "earlyNote"].includes(f)) el.classList.toggle("needs", !el.value.trim());
    if (f === "subsVehicle" && e.type === "change") {
      d.subsVehicle = el.value = el.value.trim().toUpperCase();
      rememberVehicle(d.subsVehicle);
    }
    touch(sheet);
    saveSoon();
    if (e.type === "change") updateDayHead(i);
    return;
  }
  if (e.type === "input") return; // structural fields are handled on "change"
  // Keep the shift fields open while someone is changing them.
  if (["station", "rosterValue", "rosterFrom", "rosterTo", "rosterHours"].includes(f)) ui.shiftEdit.add(i);

  switch (f) {
    case "station": {
      d.station = el.value;
      break;
    }
    case "rosterValue": {
      applyRosterValue(d, el.value, el.value === "other" ? d.rosterFrom : null, el.value === "other" ? d.rosterTo : null);
      break;
    }
    case "rosterHours": {
      d.rosterTo = addHours(d.rosterFrom, Number(el.value) / 60) || d.rosterTo;
      break;
    }
    case "actualHours": {
      d.actualTo = addHours(d.actualFrom, Number(el.value) / 60) || d.actualTo;
      break;
    }
    case "actualMins": {
      d.actualMins = Number(el.value) || 0;
      break;
    }
    case "actual": {
      if (el.value === "rest-ot" || el.value === "rest-toil") {
        d.actual = "times"; d.workType = el.value === "rest-ot" ? "ot" : "toil"; d.otAuto = true;
        if (!d.actualFrom) { d.actualFrom = ""; d.actualTo = ""; }
      }
      else if (el.value.startsWith("leave:")) { d.actual = "leave"; d.actualLeave = el.value.slice(6); }
      else d.actual = el.value;
      if (d.actual === "times" && !d.actualFrom) { d.actualFrom = d.rosterFrom; d.actualTo = d.rosterTo; }
      if ((d.actual === "early" || d.actual === "late") && d.actualMins >= shiftMins(d.rosterFrom, d.rosterTo)) d.actualMins = 0;
      break;
    }
    case "ot": {
      d.ot = el.value === "yes";
      d.otAuto = false;
      if (d.ot && !d.otFrom) {
        const a = resolvedActual(d);
        d.otFrom = d.rosterTo || "";
        d.otTo = a.kind === "times" ? a.to : "";
      }
      if (!d.ot) { d.otFrom = ""; d.otTo = ""; }
      break;
    }
    case "otFrom":
    case "otTo": {
      d[f] = el.value;
      d.otAuto = false;
      break;
    }
    case "subs": {
      d.subs = el.value === "yes";
      break;
    }
    case "topUp": {
      d.topUp = el.value;
      if (d.topUp === "worked" && !d.topFrom) {        // default: the end of the shift
        d.topTo = d.rosterTo;
        d.topFrom = fromMin(toMin(d.rosterTo) - topUpMins(d));
      }
      break;
    }
    case "partRostered": {
      d.partRostered = el.checked;
      break;
    }
    default:
      d[f] = el.value;
  }
  if (["rosterValue", "rosterFrom", "rosterTo", "rosterHours", "actual", "actualMins", "partFrom", "partTo", "actualFrom", "actualTo", "actualHours", "actualLeave"].includes(f)) {
    autoOvertime(d);
  }
  touch(sheet);
  saveState();
  rerenderDay(i);
}

// Remember recently used vehicles so they can be picked again quickly.
function rememberVehicle(v) {
  v = String(v || "").trim().toUpperCase();
  if (!v) return;
  const list = (state.profile.vehicles || []).filter(x => x !== v);
  state.profile.vehicles = [v, ...list].slice(0, 15);
  renderVehicleList();
  saveSoon();
}
function renderVehicleList() {
  const dl = $("vehicleList");
  if (dl) dl.innerHTML = (state.profile.vehicles || []).map(v => `<option value="${esc(v)}">`).join("");
}

function updateDayHead(i) {
  // Refresh the header (chips, summary) without rebuilding the inputs below it.
  const sheet = currentSheet();
  const head = document.querySelector(`[data-day-card="${i}"] .day__head`);
  if (!sheet || !head) return;
  const tmp = document.createElement("div");
  tmp.innerHTML = dayCard(sheet.days[i], i);
  head.replaceWith(tmp.querySelector(".day__head"));
  renderWeekStrip(sheet);
}

function copyToNext(i) {
  const sheet = currentSheet();
  if (!sheet || i >= 6) return;
  const src = sheet.days[i];
  const dst = sheet.days[i + 1];
  const keep = { date: dst.date };
  Object.assign(dst, structuredClone(src), keep, { done: false, otReason: "", earlyReason: "", earlyNote: "", lateReason: "", lateNote: "", partNote: "", toilNote: "", subs: false, subsVehicle: "", subsFrom: "", subsTo: "", subsRate: "", subsLocation: "" });
  if (!dst.otAuto) { dst.ot = false; dst.otFrom = ""; dst.otTo = ""; dst.otAuto = true; }
  autoOvertime(dst);
  touch(sheet, `Copied ${DAYS[i].short} → ${DAYS[i + 1].short}`);
  ui.expanded.add(i + 1);
  saveState();
  renderDays(sheet);
}

// Next day after `i` that hasn't been boxed off yet (or -1).
function nextOpenDay(sheet, i) {
  if (!sheet) return -1;
  for (let k = i + 1; k < 7; k++) if (!sheet.days[k].done) return k;
  return -1;
}

// "Box off" a day: check it, fold it to one line and move on to the next one.
function markDone(i) {
  const sheet = currentSheet();
  if (!sheet) return;
  const d = sheet.days[i];
  if (!d.roster) return toast("Enter the shift for this day first.", true);
  const errors = dayErrors(d, i);
  if (errors.length) return alert("Before marking this day done:\n\n• " + errors.map(e => e.replace(/^\w+: /, "")).join("\n• "));
  d.done = true;
  touch(sheet, `${DAYS[i].short} marked done`);
  ui.expanded.delete(i);
  const next = nextWorkDay(sheet, i);
  if (next >= 0) ui.expanded.add(next);
  saveState();
  renderDays(sheet);
  renderProgress(sheet);
  const target = document.querySelector(`[data-day-card="${next >= 0 ? next : i}"]`);
  target?.scrollIntoView({ behavior: "smooth", block: "start" });
  toast(next >= 0 ? `${DAYS[i].name} done. On to ${DAYS[next].name}.` : `${DAYS[i].name} done.`);
}

function renderWeekStrip(sheet) {
  const el = $("weekStrip");
  if (!el || !sheet) return;
  el.innerHTML = sheet.days.map((d, i) => {
    const dt = parseIso(d.date);
    const problem = d.roster && dayErrors(d, i).length;
    const state = !d.roster ? "empty" : problem ? "warn" : d.done ? (isPlainRest(d) ? "rest-done" : "done")
      : isPlainRest(d) ? "rest" : d.actual === "leave" || d.actual === "partleave" ? "leave" : "todo";
    const icon = state === "done" || state === "rest-done" ? "✓" : state === "warn" ? "!" : "";
    return `<button type="button" class="wk wk--${state}" data-jump="${i}" aria-label="${DAYS[i].name} ${dt.getDate()}">
      <span class="wk__dow">${DAYS[i].short.slice(0, 2)}</span><span class="wk__num">${dt.getDate()}</span><span class="wk__icon">${icon}</span></button>`;
  }).join("");
}

function jumpToDay(i) {
  const sheet = currentSheet();
  if (!sheet) return;
  if (!isPlainRest(sheet.days[i]) || sheet.days[i].done === false) ui.expanded.add(i);
  if (isPlainRest(sheet.days[i])) ui.expanded.delete(i);
  rerenderDay(i);
  document.querySelector(`[data-day-card="${i}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderProgress(sheet) {
  renderWeekStrip(sheet);
  const doneCount = sheet ? sheet.days.filter(d => d.done).length : 0;
  if ($("barProgress")) $("barProgress").textContent = `${doneCount}/7 days done`;
  const el = $("sheetProgress");
  if (!el || !sheet) return;
  const done = sheet.days.filter(d => d.done).length;
  el.innerHTML = `<span class="progress__bar"><span style="width:${(done / 7) * 100}%"></span></span>${done}/7 days done`;
}

function clearDay(i) {
  const sheet = currentSheet();
  if (!sheet) return;
  sheet.days[i] = blankDay(sheet.days[i].date);
  sheet.days[i].station = state.profile.base || "";
  touch(sheet, `Cleared ${DAYS[i].short}`);
  saveState();
  rerenderDay(i);
}

/* ------------------------------------------------------------------ */
/* Validation, publish, export                                         */
/* ------------------------------------------------------------------ */

function validate(sheet) {
  const errors = [];
  const p = state.profile;
  if (!p.name) errors.push("Your staff name is missing (My details).");
  if (!p.number) errors.push("Your staff number is missing (My details).");
  sheet.days.forEach((d, i) => errors.push(...dayErrors(d, i)));
  return errors;
}

// Problems with one day (used by Done and by Publish).
function dayErrors(d, i) {
  const errors = [];
  const n = DAYS[i].name;
  {
    if (d.roster === "times" && d.rosterLabel === "Road" && !ROAD_STATIONS.includes(d.station)) errors.push(`${n}: choose which station the road shift was from.`);
    if (d.roster === "times" && !(isTime(d.rosterFrom) && isTime(d.rosterTo))) errors.push(`${n}: rostered start and finish times are needed.`);
    if (d.roster === "leave" && !d.rosterLeave) errors.push(`${n}: choose the leave type.`);
    if (d.roster && d.actual === "times" && !(isTime(d.actualFrom) && isTime(d.actualTo))) errors.push(`${n}: actual start and finish times are needed.`);
    if (isRestWorked(d) && !restWorkType(d)) errors.push(`${n}: choose whether the rest day was worked as Overtime or TOIL.`);
    if (d.roster && d.actual === "leave" && !d.actualLeave) errors.push(`${n}: choose the leave type under Actual.`);
    if (topUpMins(d)) {
      if (!d.topUp) errors.push(`${n}: ${d.actualLeave} covers ${fmtDur(stdDayMins())} — choose how the other ${fmtDur(topUpMins(d))} is covered (Annual Leave, TOIL or worked).`);
      else if (d.topUp === "worked" && !(isTime(d.topFrom) && isTime(d.topTo))) errors.push(`${n}: enter the times you worked to top up the leave.`);
    }
    if (d.roster === "times" && d.actual === "early") {
      if (!d.actualMins) errors.push(`${n}: how early did you finish?`);
      else if (d.actualMins >= shiftMins(d.rosterFrom, d.rosterTo)) errors.push(`${n}: finished early by more than the whole shift.`);
      if (!d.earlyReason) errors.push(`${n}: choose why you finished early.`);
      else if (d.earlyReason === "Other" && !d.earlyNote.trim()) errors.push(`${n}: say why you finished early.`);
    }
    if (d.roster === "times" && d.actual === "partleave") {
      if (!d.partLeave) errors.push(`${n}: choose the leave type for the part-leave day.`);
      if (!isTime(d.partFrom) || !isTime(d.partTo)) errors.push(`${n}: enter the time you worked (from and to).`);
      else {
        const shift = shiftMins(d.rosterFrom, d.rosterTo);
        const worked = shiftMins(d.partFrom, d.partTo);
        if (worked >= shift) errors.push(`${n}: the time worked is as long as the whole shift — choose "Finished as rostered" instead.`);
      }
    }
    if (d.roster === "times" && d.actual === "extended" && !d.actualMins) errors.push(`${n}: how long was the extended duty?`);
    if (d.roster === "times" && d.actual === "late") {
      if (!d.actualMins) errors.push(`${n}: how much later did you start?`);
      else if (d.actualMins >= shiftMins(d.rosterFrom, d.rosterTo)) errors.push(`${n}: started late by more than the whole shift.`);
      if (!d.lateReason) errors.push(`${n}: choose comp rest or late start.`);
    }
    if (d.ot) {
      if (!isTime(d.otFrom) || !isTime(d.otTo)) errors.push(`${n}: overtime from/to times are needed.`);
      if (!d.otReason.trim() && !isBankToil(d)) errors.push(`${n}: an incident number / reason is required for overtime.`);
    }
    if (d.subs) {
      if (!isTime(d.subsFrom)) errors.push(`${n}: subsistence "From" time is missing.`);
      if (!isTime(d.subsTo)) errors.push(`${n}: subsistence "To" time is missing.`);
      if (!d.subsRate.trim()) errors.push(`${n}: subsistence rate is missing.`);
      if (!d.subsLocation.trim()) errors.push(`${n}: subsistence location is missing.`);
    }
  }
  return errors;
}

async function publish() {
  const sheet = currentSheet();
  if (!sheet) return;
  const errors = validate(sheet);
  if (errors.length) {
    alert("Please fix these before publishing:\n\n• " + errors.join("\n• "));
    // open the first day with a problem
    const first = errors.map(e => DAYS.findIndex(d => e.startsWith(d.name + ":"))).find(x => x >= 0);
    if (first !== undefined) { ui.expanded.add(first); renderDays(sheet); document.querySelector(`[data-day-card="${first}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }); }
    return;
  }
  if (!$("declaration").checked) return toast("Tick the declaration box to publish.", true);

  const empty = sheet.days.map((d, i) => d.roster ? null : DAYS[i].name).filter(Boolean);
  const unconfirmed = sheet.days.map((d, i) => d.roster === "rest" && !d.done && isPlainRest(d) ? DAYS[i].name : null).filter(Boolean);
  const asRest = [...empty, ...unconfirmed];
  if (asRest.length && !confirm(`${asRest.join(", ")}: not confirmed yet.\n\nThese will be recorded as Rest Day. Publish?`)) return;
  sheet.days.forEach(d => {
    if (!d.roster) { d.roster = "rest"; d.actual = "none"; }
    if (isPlainRest(d)) d.done = true;
  });

  // Snapshot staff details onto the sheet so the library copy is self-contained.
  const p = state.profile;
  sheet.staff = { name: p.name, number: p.number, base: profileBase(), signatureText: p.signatureText, signatureImage: p.signatureImage };
  sheet.declaration = DECLARATION;

  try {
    sheet.status = "published";
    sheet.publishedAt = new Date().toISOString();
    const files = await buildFiles(sheet, { pdf: true, xlsx: false });
    downloadFiles(files);
    touch(sheet, amendLabel(sheet) ? `Published (${amendLabel(sheet)})` : "Published");
    state.currentId = null;
    ui.lastPublishedId = sheet.id;
    $("declaration").checked = false;
    saveState();
    renderTimesheet();
    $("publishedText").textContent = `${files[0].name} has been downloaded and saved to your library.`;
    $("publishedDialog").showModal();
  } catch (err) {
    console.error(err);
    sheet.status = "draft";        // nothing was produced, so keep it as a draft
    sheet.publishedAt = "";
    alert("The timesheet files couldn't be created:\n\n" + err.message);
  }
}

async function previewDownload() {
  const sheet = currentSheet();
  if (!sheet) return;
  const p = state.profile;
  const snapshot = { ...structuredClone(sheet), staff: { name: p.name, number: p.number, base: profileBase(), signatureText: p.signatureText, signatureImage: p.signatureImage } };
  const win = window.open("", "_blank");
  try {
    const file = await buildPdfFile(snapshot, "_DRAFT");
    const url = URL.createObjectURL(file);
    if (win) win.location.href = url; else downloadFile(file);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (err) {
    win?.close();
    console.error(err);
    alert("The preview couldn't be created:\n\n" + err.message);
  }
}

let templateCache = null; // ArrayBuffer | false (no template)
async function loadTemplate() {
  if (templateCache !== null) return templateCache;
  try {
    const res = await fetch("template.xlsx", { cache: "no-cache" });
    templateCache = res.ok ? await res.arrayBuffer() : false;
  } catch {
    templateCache = false;
  }
  return templateCache;
}

// The template (or built-in layout) with this timesheet's values filled in.
async function buildWorkbook(sheet) {
  if (typeof ExcelJS === "undefined") throw new Error("The Excel library didn't load. Check lib/exceljs.min.js is present.");
  const wb = new ExcelJS.Workbook();
  const tpl = await loadTemplate();
  let ws;
  if (tpl) {
    await wb.xlsx.load(tpl);
    ws = wb.worksheets[0];
  } else {
    ws = buildDefaultLayout(wb);
  }
  fillWorksheet(wb, ws, sheet);
  return { wb, ws };
}

async function buildWorkbookFile(sheet, suffix = "") {
  const { wb } = await buildWorkbook(sheet);
  const buffer = await wb.xlsx.writeBuffer();
  return new File([buffer], fileName(sheet, suffix), {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
}

function setCell(ws, addr, value) {
  ws.getCell(addr).value = value === "" || value == null ? null : value;
}

function fillWorksheet(wb, ws, sheet) {
  const staff = sheet.staff || {};
  setCell(ws, EXCEL.staffName, staff.name);
  setCell(ws, EXCEL.staffNumber, staff.number);
  setCell(ws, EXCEL.weekEnding, displayDate(sheet.weekEnding));
  setCell(ws, EXCEL.station, staff.base);

  sheet.days.forEach((d, i) => {
    const m = DAYS[i];
    const c = excelCells(d);
    // Real Excel date (UTC midnight so it never shifts a day); template formats it dd/mm/yy.
    const [yy, mm, dd] = d.date.split("-").map(Number);
    const dateCell = ws.getCell(`${EXCEL.dateCol}${m.rosterRow}`);
    dateCell.value = new Date(Date.UTC(yy, mm - 1, dd));
    dateCell.numFmt = "dd/mm/yy";
    const worked = d.roster === "times" || resolvedActual(d).kind === "times";
    setCell(ws, `${EXCEL.stationCol}${m.rosterRow}`, worked ? (d.station || staff.base) : "");
    setCell(ws, `${EXCEL.fromCol}${m.rosterRow}`, c.rFrom);
    setCell(ws, `${EXCEL.toCol}${m.rosterRow}`, c.rTo);
    setCell(ws, `${EXCEL.fromCol}${m.actualRow}`, c.aFrom);
    setCell(ws, `${EXCEL.toCol}${m.actualRow}`, c.aTo);
    // Words such as "Self-Certified" shrink to fit the time boxes instead of wrapping mid-word.
    for (const addr of [`${EXCEL.fromCol}${m.rosterRow}`, `${EXCEL.toCol}${m.rosterRow}`, `${EXCEL.fromCol}${m.actualRow}`, `${EXCEL.toCol}${m.actualRow}`]) {
      const cell = ws.getCell(addr);
      if (typeof cell.value === "string" && !isTime(cell.value)) cell.alignment = { ...(cell.alignment || {}), wrapText: false, shrinkToFit: true };
    }
    setCell(ws, `${EXCEL.otFromCol}${m.rosterRow}`, c.otFrom);
    setCell(ws, `${EXCEL.otToCol}${m.rosterRow}`, c.otTo);
    setCell(ws, `${EXCEL.otReasonCol}${m.rosterRow}`, c.otReason);
    const where = [d.subsLocation.trim(), (d.subsVehicle || "").trim()].filter(Boolean).join(" - ");
    const subs = d.subs ? [d.subsFrom, d.subsTo, d.subsRate.trim(), where] : ["", "", "", ""];
    subs.forEach((v, k) => setCell(ws, `${EXCEL.subsCols[k]}${m.rosterRow}`, v));
  });

  // Signature: drawn image if available, otherwise typed name.
  if (staff.signatureImage) {
    setCell(ws, EXCEL.signature, null);
    const imageId = wb.addImage({ base64: staff.signatureImage, extension: "png" });
    const cell = ws.getCell(EXCEL.signature);
    const { w, h } = pngSize(staff.signatureImage);
    // Fit within the signature row (points → pixels), leaving a small margin.
    const rowPx = (ws.getRow(cell.row).height || 15) * 4 / 3;
    const height = Math.max(18, Math.round(rowPx * 0.85));
    const width = Math.min(230, Math.round(height * (w / h || 3.75)));
    ws.addImage(imageId, { tl: { col: cell.col - 1 + 0.05, row: cell.row - 1 + 0.06 }, ext: { width, height }, editAs: "oneCell" });
  } else {
    setCell(ws, EXCEL.signature, staff.signatureText || staff.name);
  }
}

// Used only when no template.xlsx is deployed beside index.html.
// Mirrors the layout of the real template (same columns and rows).
function buildDefaultLayout(wb) {
  const ws = wb.addWorksheet("Sheet1", { pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1 } });
  const widths = { A: 11, B: 11, C: 8, D: 14, E: 8, F: 14, G: 8, H: 8, I: 7, J: 18, K: 8, L: 8, M: 22, N: 8, O: 8, P: 10 };
  Object.entries(widths).forEach(([col, w]) => { ws.getColumn(col).width = w; });
  const bold = { bold: true };
  const label = (addr, text) => { const c = ws.getCell(addr); c.value = text; c.font = bold; };

  label("D2", "Name:");
  label("K2", "Personnel Number:");
  label("D4", "Date Week Ending:");
  label("K4", "Station:");
  label("A6", "Day"); label("B6", "Date"); label("D6", "Time");
  label("F6", "Station Worked from"); label("G6", "Subsistence"); label("K6", "Overtime Hours Worked");
  ["D7:From", "E7:To", "G7:From", "H7:To", "I7:5/10 hr", "J7:Location & Incident No", "K7:From", "L7:To", "M7:Reason for O/T Incident No."]
    .forEach(x => { const [a, t] = x.split(/:(.+)/); label(a, t); });

  DAYS.forEach(m => {
    label(`A${m.rosterRow}`, m.name);
    ws.getCell(`C${m.rosterRow}`).value = "Roster";
    ws.getCell(`C${m.actualRow}`).value = "Actual";
    ["A", "B", "F", "G", "H", "I", "J", "K", "L", "M"].forEach(col => ws.mergeCells(`${col}${m.rosterRow}:${col}${m.actualRow}`));
  });
  label("A23", "Employee Signature:");
  label("J23", "Line Manager Signature:");
  ws.getRow(23).height = 34;
  ws.getCell("A26").value = DECLARATION;
  ws.getCell("A26").font = { italic: true, size: 9 };
  return ws;
}

/* PDF copy ------------------------------------------------------------ */
// The PDF is drawn straight from the filled-in worksheet, using the
// template's own column widths, row heights, merged cells, fills, borders,
// fonts and images, so it looks the same as the Excel sheet.

// Excel's standard indexed colour palette (used by older templates).
const XL_INDEXED = ["000000","FFFFFF","FF0000","00FF00","0000FF","FFFF00","FF00FF","00FFFF","000000","FFFFFF","FF0000","00FF00","0000FF","FFFF00","FF00FF","00FFFF","800000","008000","000080","808000","800080","008080","C0C0C0","808080","9999FF","993366","FFFFCC","CCFFFF","660066","FF8080","0066CC","CCCCFF","000080","FF00FF","FFFF00","00FFFF","800080","800000","008080","0000FF","00CCFF","CCFFFF","CCFFCC","FFFF99","99CCFF","FF99CC","CC99FF","FFCC99","3366FF","33CCCC","99CC00","FFCC00","FF9900","FF6600","666699","969696","003366","339966","003300","333300","993300","993366","333399","333333"];

function xlColor(c, fallback) {
  if (!c) return fallback;
  if (c.argb) { const h = c.argb.slice(-6); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  if (c.indexed !== undefined) {
    if (c.indexed === 64) return fallback;   // "system foreground"
    const h = XL_INDEXED[c.indexed]; if (h) return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  if (c.theme !== undefined) return c.theme === 0 ? [255, 255, 255] : c.theme === 1 ? [0, 0, 0] : fallback;
  return fallback;
}

function colLetter(n) { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
function decodeAddr(a) {
  const m = /^([A-Z]+)(\d+)$/.exec(a);
  let c = 0; for (const ch of m[1]) c = c * 26 + ch.charCodeAt(0) - 64;
  return { col: c, row: Number(m[2]) };
}

function cellText(cell) {
  let v = cell.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && !(v instanceof Date)) {
    if (v.richText) v = v.richText.map(t => t.text).join("");
    else if (v.text !== undefined) v = typeof v.text === "object" && v.text.richText ? v.text.richText.map(t => t.text).join("") : v.text;
    else if (v.result !== undefined) v = v.result;
    else return "";
  }
  if (v instanceof Date) {
    const d = v, dd = pad(d.getUTCDate()), mm = pad(d.getUTCMonth() + 1), yyyy = d.getUTCFullYear();
    return /yyyy/i.test(cell.numFmt || "") ? `${dd}/${mm}/${yyyy}` : `${dd}/${mm}/${String(yyyy).slice(2)}`;
  }
  return String(v);
}

// Last used row / column of the printed area.
function sheetExtent(ws) {
  let maxR = 0, maxC = 0;
  ws.eachRow({ includeEmpty: false }, (row, r) => {
    row.eachCell({ includeEmpty: false }, (cell, c) => {
      const hasLook = cell.value !== null || (cell.fill && cell.fill.type === "pattern" && cell.fill.pattern !== "none") ||
        (cell.border && Object.keys(cell.border).length);
      if (hasLook) { maxR = Math.max(maxR, r); maxC = Math.max(maxC, c); }
    });
  });
  (ws.model.merges || []).forEach(m => { const b = decodeAddr(m.split(":")[1]); maxR = Math.max(maxR, b.row); maxC = Math.max(maxC, b.col); });
  return { rows: maxR, cols: maxC };
}

async function renderWorksheetPdf(wb, ws) {
  const { jsPDF } = window.jspdf;
  // Locked: opens without a password and can be printed and signed/annotated (e.g. a manager's
  // signature via Fill & Sign), but the timesheet content can't be edited in normal PDF readers.
  const ownerKey = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, "0")).join("");
  const doc = new jsPDF({
    orientation: "landscape", unit: "mm", format: "a4",
    encryption: { userPassword: "", ownerPassword: ownerKey, userPermissions: ["print", "annot-forms"] }
  });
  const { rows, cols } = sheetExtent(ws);
  const PX = 0.2646;                                         // mm per pixel at 96 dpi
  const defW = ws.properties.defaultColWidth || 8.43;
  const defH = ws.properties.defaultRowHeight || 15;
  const colW = []; for (let c = 1; c <= cols; c++) colW[c] = (Math.trunc(((ws.getColumn(c).width || defW) * 7 + 5) / 7 * 256) / 256 * 7) * PX;
  const rowH = []; for (let r = 1; r <= rows; r++) rowH[r] = (ws.getRow(r).height || defH) * 0.3528;
  const totalW = colW.slice(1).reduce((a, b) => a + b, 0);
  const totalH = rowH.slice(1).reduce((a, b) => a + b, 0);
  const pageW = 297, pageH = 210, margin = 8;
  const k = Math.min((pageW - 2 * margin) / totalW, (pageH - 2 * margin - 4) / totalH, 1);
  const ox = (pageW - totalW * k) / 2, oy = margin;
  const X = [], Y = [];
  X[1] = ox; for (let c = 1; c <= cols; c++) X[c + 1] = X[c] + colW[c] * k;
  Y[1] = oy; for (let r = 1; r <= rows; r++) Y[r + 1] = Y[r] + rowH[r] * k;

  // Merged regions, keyed by every cell inside them.
  const regionOf = {};
  (ws.model.merges || []).forEach(m => {
    const [a, b] = m.split(":").map(decodeAddr);
    const reg = { top: a.row, left: a.col, bottom: b.row, right: b.col };
    for (let r = a.row; r <= b.row; r++) for (let c = a.col; c <= b.col; c++) regionOf[`${r}:${c}`] = reg;
  });
  const region = (r, c) => regionOf[`${r}:${c}`] || { top: r, left: c, bottom: r, right: c };

  // 1. fills
  for (let r = 1; r <= rows; r++) for (let c = 1; c <= cols; c++) {
    const reg = region(r, c);
    if (reg.top !== r || reg.left !== c) continue;
    const f = ws.getCell(r, c).fill;
    if (f && f.type === "pattern" && f.pattern && f.pattern !== "none") {
      const col = xlColor(f.fgColor, null);
      if (col) { doc.setFillColor(...col); doc.rect(X[c], Y[r], X[reg.right + 1] - X[c], Y[reg.bottom + 1] - Y[r], "F"); }
    }
  }
  // 2. borders (skip lines inside merged regions)
  const lw = { hair: 0.1, thin: 0.2, dotted: 0.2, dashed: 0.2, medium: 0.45, mediumDashed: 0.45, double: 0.5, thick: 0.7 };
  const line = (b, x1, y1, x2, y2) => {
    if (!b || !b.style) return;
    doc.setLineWidth((lw[b.style] || 0.2) * Math.max(k, 0.6));
    doc.setDrawColor(...xlColor(b.color, [0, 0, 0]));
    doc.line(x1, y1, x2, y2);
  };
  for (let r = 1; r <= rows; r++) for (let c = 1; c <= cols; c++) {
    const b = ws.getCell(r, c).border || {};
    const reg = region(r, c);
    if (r === reg.top) line(b.top, X[c], Y[r], X[c + 1], Y[r]);
    if (r === reg.bottom) line(b.bottom, X[c], Y[r + 1], X[c + 1], Y[r + 1]);
    if (c === reg.left) line(b.left, X[c], Y[r], X[c], Y[r + 1]);
    if (c === reg.right) line(b.right, X[c + 1], Y[r], X[c + 1], Y[r + 1]);
  }
  // 3. text
  for (let r = 1; r <= rows; r++) for (let c = 1; c <= cols; c++) {
    const reg = region(r, c);
    if (reg.top !== r || reg.left !== c) continue;
    const cell = ws.getCell(r, c);
    const text = cellText(cell);
    if (!text) continue;
    const font = cell.font || {};
    const al = cell.alignment || {};
    const x0 = X[c], x1 = X[reg.right + 1], y0 = Y[r], y1 = Y[reg.bottom + 1];
    // Calibri (the template's main font) is ~12% narrower than Helvetica, the PDF's built-in sans font.
    let size = (font.size || 11) * k * (/calibri|carlito/i.test(font.name || "Calibri") ? 0.88 : 1);
    const isLink = cell.value && typeof cell.value === "object" && cell.value.hyperlink;
    doc.setFont(/times|roman/i.test(font.name || "") ? "times" : "helvetica", font.bold && font.italic ? "bolditalic" : font.bold ? "bold" : font.italic ? "italic" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...(isLink ? [5, 99, 193] : xlColor(font.color, [0, 0, 0])));
    const pad = 1.2 * k;
    const w = x1 - x0 - 2 * pad;
    if (al.shrinkToFit && !al.wrapText) {
      while (doc.getTextWidth(text) > w && size > 4) { size -= 0.25; doc.setFontSize(size); }
    }
    let lines = al.wrapText ? doc.splitTextToSize(text, w) : [text];
    const lh = () => size * 0.3528 * 1.15;
    while (al.wrapText && lines.length * lh() > (y1 - y0) && size > 4) { size -= 0.5; doc.setFontSize(size); lines = doc.splitTextToSize(text, w); }
    const blockH = lines.length * lh();
    const v = al.vertical || "bottom";
    let ty = v === "top" ? y0 + pad + size * 0.3528 : v === "middle" || v === "center" ? y0 + (y1 - y0 - blockH) / 2 + size * 0.3528 * 0.85 : y1 - pad - blockH + size * 0.3528 * 0.85;
    const isNum = typeof cell.value === "number";
    const h = al.horizontal || (isNum ? "right" : "left");
    const align = h === "center" || h === "centerContinuous" ? "center" : h === "right" ? "right" : "left";
    const tx = align === "center" ? (x0 + x1) / 2 : align === "right" ? x1 - pad : x0 + pad;
    doc.text(lines, tx, ty, { align, lineHeightFactor: 1.15 });
    if (font.underline || isLink) {
      const tw = doc.getTextWidth(lines[0]);
      const ux = align === "center" ? tx - tw / 2 : align === "right" ? tx - tw : tx;
      doc.setLineWidth(0.15); doc.setDrawColor(...(isLink ? [5, 99, 193] : [0, 0, 0]));
      doc.line(ux, ty + 0.6, ux + tw, ty + 0.6);
    }
  }
  doc.setTextColor(0, 0, 0);
  // 4. images (logo + signature)
  const EMU = 9525;
  for (const im of ws.getImages()) {
    const media = wb.getImage(Number(im.imageId));
    if (!media) continue;
    const tl = im.range.tl;
    const colPos = (col, off) => { const cc = Math.floor(col) + 1; return (X[cc] ?? X[cols + 1]) + (off !== undefined ? off / EMU * PX * k : (col % 1) * (colW[cc] || 0) * k); };
    const rowPos = (row, off) => { const rr = Math.floor(row) + 1; return (Y[rr] ?? Y[rows + 1]) + (off !== undefined ? off / EMU * PX * k : (row % 1) * (rowH[rr] || 0) * k); };
    const x = colPos(tl.nativeCol ?? tl.col, tl.nativeColOff);
    const y = rowPos(tl.nativeRow ?? tl.row, tl.nativeRowOff);
    let w, h;
    if (im.range.ext) { w = im.range.ext.width * PX * k; h = im.range.ext.height * PX * k; }
    else if (im.range.br) {
      const br = im.range.br;
      w = colPos(br.nativeCol ?? br.col, br.nativeColOff) - x;
      h = rowPos(br.nativeRow ?? br.row, br.nativeRowOff) - y;
    } else continue;
    let data = media.base64;
    if (!data && media.buffer) {
      const bytes = new Uint8Array(media.buffer); let bin = "";
      for (let n = 0; n < bytes.length; n++) bin += String.fromCharCode(bytes[n]);
      data = btoa(bin);
    }
    if (!data) continue;
    if (!data.startsWith("data:")) data = `data:image/${media.extension === "jpg" ? "jpeg" : media.extension};base64,${data}`;
    try { doc.addImage(data, (media.extension || "png").toUpperCase().replace("JPG", "JPEG"), x, y, w, h); } catch (err) { console.warn("Image skipped in PDF:", err); }
  }
  return { doc, bottom: Y[rows + 1] };
}

async function buildPdfFile(sheet, suffix = "") {
  if (!window.jspdf) throw new Error("The PDF library didn't load. Check lib/jspdf.umd.min.js is present.");
  if (!sheet.staff) {
    const p = state.profile;
    sheet = { ...sheet, staff: { name: p.name, number: p.number, base: profileBase(), signatureText: p.signatureText, signatureImage: p.signatureImage } };
  }
  const { wb, ws } = await buildWorkbook(sheet);
  const { doc } = await renderWorksheetPdf(wb, ws);
  // Small footer outside the sheet: status, amendment, roster line.
  const amended = amendLabel(sheet);
  const when = sheet.publishedAt ? new Date(sheet.publishedAt) : new Date();
  doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(110, 110, 110);
  doc.text(`${sheet.status === "published" ? "Published" : "DRAFT – not submitted"} ${when.toLocaleString("en-IE", { dateStyle: "short", timeStyle: "short" })}${amended ? ` · ${amended}` : ""}${sheet.rosterLine ? ` · Roster line ${sheet.rosterLine}` : ""}`, 8, 205);
  if (amended) { doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(200, 0, 0); doc.text(amended, 289, 205, { align: "right" }); }
  doc.setTextColor(0, 0, 0);
  const blob = doc.output("blob");
  return new File([blob], fileName(sheet, suffix).replace(/\.xlsx$/, ".pdf"), { type: "application/pdf" });
}

// Which files to attach/download, from the user's last choice (default: both).
function chosenFormats() {
  return { pdf: true, xlsx: false };   // published timesheets go out as a locked PDF only
}
async function buildFiles(sheet, formats = chosenFormats(), suffix = "") {
  const files = [];
  if (formats.pdf) files.push(await buildPdfFile(sheet, suffix));
  if (formats.xlsx) files.push(await buildWorkbookFile(sheet, suffix));
  return files;
}
function downloadFiles(files) {
  files.forEach((f, k) => setTimeout(() => downloadFile(f), k * 600));
}

// Read width/height from a PNG data URL's header (no async image load needed).
function pngSize(dataUrl) {
  try {
    const bin = atob(dataUrl.split(",")[1].slice(0, 44));
    const n = o => ((bin.charCodeAt(o) << 24) | (bin.charCodeAt(o + 1) << 16) | (bin.charCodeAt(o + 2) << 8) | bin.charCodeAt(o + 3)) >>> 0;
    return { w: n(16), h: n(20) };
  } catch { return { w: 0, h: 0 }; }
}

function fileName(sheet, suffix = "") {
  const s = sheet.staff || state.profile;
  const name = String(s.name || "Staff").replace(/[^a-zA-Z0-9]+/g, "");
  const num = String(s.number || "NoNumber").replace(/[^a-zA-Z0-9]+/g, "");
  const v = amendNo(sheet) ? `_AMENDED${amendNo(sheet)}` : "";
  return `Timesheet_${num}_${name}_WE_${sheet.weekEnding}${v}${suffix}.xlsx`;
}

function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* Email -------------------------------------------------------------- */

// Role names shown in the app, emails and logs. ("orm" is just the internal key.)
const ROLE_LABEL = { orm: "ORM", dcm: "DCM", sup: "Supervisor" };
const ROLE_PLURAL = { orm: "ORMs", dcm: "DCMs", sup: "supervisors" };
// Full titles (not displayed): ORM = Operational Resource Manager, DCM = Duty Control Manager.
const ROLE_TITLE = { orm: "", dcm: "", sup: "" };
const ROLES = ["orm", "dcm", "sup"];

function newId() { return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2); }

// Older versions stored one ORM / one supervisor (or a single "send to" address).
function migrateContacts(p) {
  if (!Array.isArray(p.contacts)) p.contacts = [];
  const add = (role, name, email, def) => {
    if ((name || email) && !p.contacts.some(c => c.role === role && c.email === email && c.name === name)) {
      p.contacts.push({ id: newId(), role, name: name || "", email: email || "", default: !!def });
    }
  };
  add("orm", p.ormName, p.ormEmail || p.emailTo, p.ormDefault ?? true);
  add("sup", p.supName, p.supEmail, p.supDefault);
  ["ormName", "ormEmail", "ormDefault", "supName", "supEmail", "supDefault", "emailTo"].forEach(k => delete p[k]);
}

function firstName(name) { return String(name || "").trim().split(/\s+/)[0] || ""; }

/* My details: editable contact lists */
function renderContacts() {
  ROLES.forEach(role => {
    const list = state.profile.contacts.filter(c => c.role === role);
    if (!$(`${role}List`)) return;
    $(`${role}List`).innerHTML = list.length ? list.map(c => `
      <div class="contact" data-contact="${esc(c.id)}">
        <label class="contact__def" title="Ticked by default when sending">
          <input type="checkbox" data-cf="default" ${c.default ? "checked" : ""}> <span>Default</span>
        </label>
        <input type="text" data-cf="name" value="${esc(c.name)}" placeholder="Name, e.g. John Campbell" aria-label="${ROLE_LABEL[role]} name">
        <input type="email" data-cf="email" value="${esc(c.email)}" placeholder="Email" aria-label="${ROLE_LABEL[role]} email" class="${c.email && !isEmail(c.email) ? "needs" : ""}">
        <button type="button" class="btn btn--small btn--danger-ghost contact__del" data-cf-del aria-label="Remove">Remove</button>
      </div>`).join("")
      : `<p class="hint contact-empty">No ${ROLE_PLURAL[role]} added yet.</p>`;
  });
}

function onContactEdit(e) {
  const row = e.target.closest("[data-contact]");
  const f = e.target.dataset.cf;
  if (!row || !f) return;
  const c = state.profile.contacts.find(x => x.id === row.dataset.contact);
  if (!c) return;
  if (f === "default") c.default = e.target.checked;
  else c[f] = e.target.value.trim();
  if (f === "email" && e.type === "change") e.target.classList.toggle("needs", !!c.email && !isEmail(c.email));
  saveSoon();
}

function addContact(role) {
  const c = { id: newId(), role, name: "", email: "", default: !state.profile.contacts.some(x => x.role === role) };
  state.profile.contacts.push(c);
  renderContacts();
  document.querySelector(`[data-contact="${c.id}"] [data-cf="name"]`)?.focus();
  saveSoon();
}

function removeContact(id) {
  const c = state.profile.contacts.find(x => x.id === id);
  if (!c) return;
  if ((c.name || c.email) && !confirm(`Remove ${c.name || c.email}?`)) return;
  state.profile.contacts = state.profile.contacts.filter(x => x.id !== id);
  renderContacts();
  saveState();
}

/* Send dialog: everyone, grouped by role */
function recipientOptions() {
  const p = state.profile;
  return [
    ...p.contacts.filter(c => c.name || c.email).map(c => ({ id: c.id, role: c.role, roleLabel: ROLE_LABEL[c.role], name: c.name, email: c.email, def: c.default, kind: "to" })),
    { id: "me", role: "me", roleLabel: "Me", name: p.name, email: p.meEmail, def: p.meDefault, kind: "cc" }
  ];
}

function isEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function fmtWhen(iso) { return new Date(iso).toLocaleString("en-IE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); }

// Amendment number: the original is 0, each revision after that is AMENDED 1, 2, 3…
function amendNo(sheet) { return Math.max(0, (sheet.version || 1) - 1); }
function amendLabel(sheet) { return amendNo(sheet) ? `AMENDED ${amendNo(sheet)}` : ""; }

function joinNames(names) {
  return names.length <= 1 ? (names[0] || "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

// Email template:
//   Subject: <Name> Timesheet <week ending>   (+ " AMENDED n" if amended)
//   Body:    Hello <Manager> / Please find timesheet attached / Kind Regards
function emailText(sheet, rec = { to: [], cc: [] }) {
  const staff = sheet.staff || state.profile;
  const amended = amendLabel(sheet);
  const names = rec.to.map(r => firstName(r.name)).filter(Boolean);
  const subject = `${staff.name} Timesheet ${displayDate(sheet.weekEnding)}${amended ? ` ${amended}` : ""}`;
  const body = [
    names.length ? `Hello ${joinNames(names)}` : "Hello",
    "",
    `Please find timesheet attached${amended ? ` - ${amended}` : ""}`,
    "",
    "Kind Regards",
    staff.name
  ].join("\n");
  return { subject, body };
}

function renderSendPreview() {
  const sheet = state.sheets.find(s => s.id === ui.sendId);
  if (!sheet) return;
  const rec = chosenRecipients();
  const { subject, body } = emailText(sheet, rec);
  const line = (k, arr) => arr.length ? `<div><span class="k">${k}</span> ${esc(arr.map(r => r.email).join(", "))}</div>` : "";
  $("sendPreview").innerHTML = `
    ${line("To:", rec.to)}${line("CC:", rec.cc)}
    <div><span class="k">Subject:</span> ${esc(subject)}</div>
    <div><span class="k">Attach:</span> ${esc(fileName(sheet).replace(/\.xlsx$/, ".pdf"))}</div>
    <pre>${esc(body)}</pre>`;
}

function sendLine(rec) {
  const roleOf = r => ROLE_LABEL[r.role] || r.label;
  const who = r => r.role === "me" ? "Me" : (r.name ? `${r.name} (${roleOf(r)})` : roleOf(r));
  const names = [...rec.to, ...rec.cc].map(who).join(", ");
  return `${names} · ${fmtWhen(rec.at)}`;
}

function openSendDialog(id) {
  const sheet = state.sheets.find(s => s.id === id);
  if (!sheet) return;
  ui.sendId = id;
  const p = state.profile;
  $("sendWhat").textContent = `Week ending ${displayDate(sheet.weekEnding)}${amendLabel(sheet) ? ` · ${amendLabel(sheet)}` : ""} · ${fileName(sheet).replace(/\.xlsx$/, ".pdf")}`;
  const opts = recipientOptions();
  const group = (title, items, emptyText) => `
    <div class="send-group">
      <div class="send-group__title">${title}</div>
      ${items.length ? items.map(r => {
        const ok = r.email && isEmail(r.email);
        return `
        <label class="send-box ${ok ? "" : "send-box--off"}">
          <input type="checkbox" name="recip" value="${esc(r.id)}" ${ok && r.def ? "checked" : ""} ${ok ? "" : "disabled"}>
          <span class="send-box__label">${r.role === "me" ? "Me <small>CC</small>" : esc(r.name || r.roleLabel)}</span>
          <span class="send-box__email">${ok ? esc(r.email) : `No valid email — <a href="#" data-goto="profile" data-close-send>fix in My details</a>`}</span>
        </label>`;
      }).join("") : `<p class="hint">${emptyText} <a href="#" data-goto="profile" data-close-send>Add in My details</a></p>`}
    </div>`;
  $("sendBoxes").innerHTML =
    ROLES.map(role => group(
      `${ROLE_LABEL[role]}${ROLE_TITLE[role] ? ` <small class="role-title">${ROLE_TITLE[role]}</small>` : ""}`,
      opts.filter(r => r.role === role), `No ${ROLE_PLURAL[role]} added yet.`)).join("") +
    group("Me", opts.filter(r => r.role === "me"), "");
  // Build the PDF now, so the tap on "send" can hand it over instantly
  // (phones only allow sharing straight after a tap).
  ui.sendFiles = null;
  const testPdf = new File(["%PDF-1.4"], "t.pdf", { type: "application/pdf" });
  const canShare = !!(navigator.canShare && navigator.share && navigator.canShare({ files: [testPdf] }));
  $("sendShareBtn").hidden = !canShare;
  $("sendShareBtn").textContent = "Email with PDF attached";
  $("sendShareBtn").className = "btn btn--primary";
  $("sendEmailBtn").textContent = canShare ? "Open email (attach PDF yourself)" : "Open email";
  $("sendEmailBtn").className = canShare ? "btn" : "btn btn--primary";
  [$("sendShareBtn"), $("sendEmailBtn")].forEach(b => { b.disabled = true; });
  $("sendHow").textContent = "Preparing the PDF…";
  buildFiles(sheet, chosenFormats()).then(files => {
    if (ui.sendId !== id) return;
    ui.sendFiles = files;
    [$("sendShareBtn"), $("sendEmailBtn")].forEach(b => { b.disabled = false; });
    $("sendHow").textContent = canShare
      ? "Email with PDF attached: pick your email app — the PDF, subject and message are filled in. Phones don't let apps fill in the To box, so the addresses are copied for you: press and hold the To box and tap Paste."
      : "Your email app opens with the addresses and subject filled in. The PDF is downloaded at the same time — attach it from Downloads, then press Send.";
  }).catch(err => { $("sendHow").textContent = "The PDF couldn't be created: " + err.message; });
  const sends = sheet.sends || [];
  $("sendLog").innerHTML = sends.length ? `
    <div class="send-log"><strong>Previously sent</strong>
      <ul>${sends.slice().reverse().map(r => `<li>${esc(sendLine(r))}</li>`).join("")}</ul></div>` : "";
  renderSendPreview();
  $("sendDialog").showModal();
}

function chosenRecipients() {
  const picked = new Set([...document.querySelectorAll('#sendBoxes input[name="recip"]:checked')].map(i => i.value));
  const list = recipientOptions().filter(r => picked.has(r.id))
    .map(r => ({ role: r.role, label: r.roleLabel, name: r.name, email: r.email, kind: r.kind }));
  return {
    to: list.filter(r => r.kind === "to").map(({ kind, ...r }) => r),
    cc: list.filter(r => r.kind === "cc").map(({ kind, ...r }) => r)
  };
}

function recordSend(sheet, rec) {
  sheet.sends = sheet.sends || [];
  sheet.sends.push(rec);
  const fmt = arr => arr.map(r => `${r.role === "me" ? "Me" : `${r.name || r.label} [${r.label}]`} <${r.email}>`).join(", ");
  touch(sheet, `Sent by email to ${fmt(rec.to) || "—"}${rec.cc.length ? `; CC ${fmt(rec.cc)}` : ""}${rec.files?.length ? ` · attached ${rec.files.map(f => f.endsWith(".pdf") ? "PDF" : "Excel").join(" + ")}` : ""}${rec.method === "share" ? " (via share)" : ""}`);
  saveState();
  renderLibrary();
}

// Called straight from the tap — no waiting before navigator.share, or phones block it.
function sendSheet(method) {
  const sheet = state.sheets.find(s => s.id === ui.sendId);
  const files = ui.sendFiles;
  if (!sheet || !files) return toast("Still preparing the PDF — try again in a second.", true);
  const rec = { ...chosenRecipients(), at: new Date().toISOString(), method, files: files.map(f => f.name) };
  const { subject, body } = emailText(sheet, rec);
  const toList = rec.to.map(r => r.email);
  const ccList = rec.cc.map(r => r.email);

  if (method === "share") {
    const addresses = [...toList, ...ccList].join(", ");
    if (addresses && navigator.clipboard) navigator.clipboard.writeText(addresses).catch(() => {});
    navigator.share({ files, title: subject, text: body })
      .then(() => {
        recordSend(sheet, rec);
        toast(addresses ? "Addresses copied — in your email, press and hold To, then tap Paste." : "Shared with the PDF attached.");
      })
      .catch(err => {
        if (err.name === "AbortError") return toast("Not sent.");
        console.error(err);
        alert("Your phone wouldn't share the PDF (" + err.message + ").\n\nUse “Open email” instead — the PDF will download for you to attach.");
      });
    return;
  }

  downloadFiles(files);
  const params = [`subject=${encodeURIComponent(subject)}`, `body=${encodeURIComponent(body)}`];
  if (ccList.length) params.unshift(`cc=${ccList.map(encodeURIComponent).join(",")}`);
  recordSend(sheet, rec);
  const url = `mailto:${toList.map(encodeURIComponent).join(",")}?${params.join("&")}`;
  console.info("Opening email:", url);
  setTimeout(() => { window.location.href = url; }, 300 + files.length * 600);
  toast("Email opened — attach the PDF from Downloads.");
}

/* ------------------------------------------------------------------ */
/* Library                                                             */
/* ------------------------------------------------------------------ */

function renderLibrary() {
  const q = $("libSearch").value.trim().toLowerCase();
  const filter = document.querySelector('input[name="libFilter"]:checked').value;
  const list = state.sheets
    .filter(s => filter === "all" || s.status === filter)
    .filter(s => !q || searchText(s).includes(q))
    .sort((a, b) => b.weekEnding.localeCompare(a.weekEnding) || b.version - a.version);

  if (!list.length) {
    $("libraryList").innerHTML = `<div class="card empty">${state.sheets.length ? "Nothing matches." : "No timesheets yet. Published timesheets and drafts will appear here."}</div>`;
    return;
  }
  $("libraryList").innerHTML = list.map(s => {
    const ot = s.days.filter(d => d.ot).length;
    const subs = s.days.filter(d => d.subs).length;
    const superseded = s.status === "published" && state.sheets.some(x => x.revisionOf === s.id && x.status === "published");
    const meta = s.status === "published"
      ? `Published ${new Date(s.publishedAt).toLocaleString("en-IE", { dateStyle: "short", timeStyle: "short" })}`
      : `Draft · ${filledCount(s)}/7 days · edited ${new Date(s.updatedAt).toLocaleString("en-IE", { dateStyle: "short", timeStyle: "short" })}`;
    return `
    <article class="card lib-item ${s.status === "draft" ? "lib-item--draft" : ""}">
      <div class="lib-item__main">
        <div class="eyebrow">${s.status === "published" ? "Published" : "Draft"}${amendLabel(s) ? ` · ${amendLabel(s)}` : ""}${superseded ? " · superseded" : ""}</div>
        <h3>Week ending ${esc(displayDate(s.weekEnding))}</h3>
        <div class="muted">${esc(meta)}</div>
        ${s.status === "published" ? (s.sends?.length
          ? `<div class="sent-line">✉ Sent by email to ${esc(sendLine(s.sends.at(-1)))}${s.sends.length > 1 ? ` <span class="muted">(${s.sends.length} sends)</span>` : ""}</div>`
          : `<div class="sent-line sent-line--none">Not emailed yet</div>`) : ""}
        <div class="day__flags">${ot ? `<span class="tag tag--ot">${ot} OT day${ot > 1 ? "s" : ""}</span>` : ""}${subs ? `<span class="tag tag--subs">${subs} subsistence</span>` : ""}</div>
      </div>
      <div class="lib-item__actions">
        ${s.status === "draft" ? `
          <button class="btn btn--primary btn--small" data-open="${esc(s.id)}">Continue</button>
          <button class="btn btn--danger-ghost btn--small" data-delete="${esc(s.id)}">Delete</button>` : `
          <button class="btn btn--primary btn--small" data-share="${esc(s.id)}">Email</button>
          <button class="btn btn--small" data-download="${esc(s.id)}" data-format="pdf">PDF</button>
          <button class="btn btn--small" data-revise="${esc(s.id)}">Revise</button>
          <button class="btn btn--danger-ghost btn--small" data-delete="${esc(s.id)}">Delete</button>`}
      </div>
      <details class="lib-item__more"><summary>More</summary>
        <button class="btn btn--small btn--ghost" data-download="${esc(s.id)}" data-format="xlsx">Export as Excel</button>
        <span class="hint">Editable copy for your own records. What you send is the PDF.</span>
      </details>
      <details class="lib-item__history"><summary>History</summary>
        <ul>${s.history.slice().reverse().map(h => `<li><time>${esc(new Date(h.at).toLocaleString("en-IE", { dateStyle: "short", timeStyle: "short" }))}</time> ${esc(h.action)}</li>`).join("")}</ul>
      </details>
    </article>`;
  }).join("");
}

function searchText(s) {
  return [
    displayDate(s.weekEnding), s.weekEnding, s.status, amendLabel(s) ? `amended ${amendLabel(s)}` : "", s.sends?.length ? "sent emailed" : "not sent",
    ...(s.sends || []).flatMap(r => [...r.to, ...r.cc].flatMap(x => [x.label, x.name, x.email])),
    ...s.days.flatMap(d => [d.station, d.rosterLeave, d.actualLeave, d.otReason, d.subsLocation, d.subsVehicle, d.swapNote, d.earlyReason, d.lateReason])
  ].join(" ").toLowerCase();
}

function setQuickFillOpen() {
  const sheet = currentSheet();
  if (sheet) $("quickFill").open = !sheet.days.some(d => d.roster);
}

function openSheet(id) {
  state.currentId = id;
  ui.expanded.clear();
  ui.shiftEdit.clear();
  ui.selectedDays.clear();
  saveState();
  showTab("timesheet");
  setQuickFillOpen();
}

function reviseSheet(id) {
  const original = state.sheets.find(s => s.id === id);
  if (!original) return;
  const existing = state.sheets.find(s => s.revisionOf === id && s.status === "draft");
  if (existing) return openSheet(existing.id);
  const copy = structuredClone(original);
  const now = new Date().toISOString();
  const version = Math.max(...state.sheets.filter(s => s.weekEnding === original.weekEnding).map(s => s.version || 1)) + 1;
  Object.assign(copy, {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    status: "draft",
    version,
    revisionOf: original.id,
    createdAt: now, updatedAt: now, publishedAt: "",
    sends: [],
    history: [{ action: `${amendLabel({ version })} started from ${amendLabel(original) || "the original"}`, at: now }]
  });
  delete copy.staff;
  state.sheets.push(copy);
  toast(`${amendLabel(copy)} created — make your changes, publish, then email it again.`);
  openSheet(copy.id);
}

function deleteSheet(id) {
  const s = state.sheets.find(x => x.id === id);
  if (!s) return;
  const what = s.status === "draft" ? "this draft" : "this published timesheet from your library";
  if (!confirm(`Delete ${what} (week ending ${displayDate(s.weekEnding)})? This can't be undone.`)) return;
  state.sheets = state.sheets.filter(x => x.id !== id);
  if (state.currentId === id) state.currentId = null;
  saveState();
  renderLibrary();
  renderTimesheet();
}

/* ------------------------------------------------------------------ */
/* Backup                                                              */
/* ------------------------------------------------------------------ */

function exportBackup() {
  const blob = new Blob([JSON.stringify({ app: "Timesheet Hub", exportedAt: new Date().toISOString(), ...state }, null, 2)], { type: "application/json" });
  downloadFile(new File([blob], `timesheet-hub-backup-${isoLocal(new Date())}.json`, { type: "application/json" }));
}

function importBackup(e) {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data.sheets)) throw new Error("Not a Timesheet Hub backup.");
      const known = new Set(state.sheets.map(s => s.id));
      const added = data.sheets.filter(s => !known.has(s.id));
      state.sheets.push(...added);
      if (!state.profile.name && data.profile) state.profile = { ...state.profile, ...data.profile };
      saveState();
      renderProfile();
      toast(`Imported ${added.length} timesheet${added.length === 1 ? "" : "s"} (${data.sheets.length - added.length} already here).`);
    } catch (err) {
      alert("That backup file couldn't be imported.\n\n" + err.message);
    }
  };
  reader.readAsText(file);
}

/* ------------------------------------------------------------------ */
/* Wiring                                                              */
/* ------------------------------------------------------------------ */

function bind() {
  document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => showTab(t.dataset.tab)));
  document.addEventListener("click", e => {
    const t = e.target.closest("[data-jump],[data-shift-edit],[data-rest-ok],[data-rest-worked],[data-done],[data-goto],[data-open],[data-share],[data-download],[data-revise],[data-delete],[data-toggle],[data-chip],[data-copy-next],[data-clear-day]");
    if (!t) return;
    const ds = t.dataset;
    if (ds.goto) { e.preventDefault(); if (ds.closeSend !== undefined) $("sendDialog").close("cancel"); showTab(ds.goto); }
    else if (ds.open) openSheet(ds.open);
    else if (ds.share) openSendDialog(ds.share);
    else if (ds.download) {
      const s = state.sheets.find(x => x.id === ds.download);
      (ds.format === "pdf" ? buildPdfFile(s) : buildWorkbookFile(s)).then(downloadFile).catch(err => alert(err.message));
    }
    else if (ds.revise) reviseSheet(ds.revise);
    else if (ds.delete) deleteSheet(ds.delete);
    else if (ds.toggle !== undefined) {
      const i = Number(ds.toggle);
      ui.expanded.has(i) ? ui.expanded.delete(i) : ui.expanded.add(i);
      rerenderDay(i);
    }
    else if (ds.chip !== undefined) {
      if (ds.chip === "weekdays") [0, 1, 2, 3, 4].forEach(i => ui.selectedDays.add(i));
      else if (ds.chip === "none") ui.selectedDays.clear();
      else { const i = Number(ds.chip); ui.selectedDays.has(i) ? ui.selectedDays.delete(i) : ui.selectedDays.add(i); }
      renderQuickFill(currentSheet());
    }
    else if (ds.copyNext !== undefined) copyToNext(Number(ds.copyNext));
    else if (ds.done !== undefined) markDone(Number(ds.done));
    else if (ds.restOk !== undefined) confirmRest(Number(ds.restOk));
    else if (ds.jump !== undefined) jumpToDay(Number(ds.jump));
    else if (ds.shiftEdit !== undefined) { ui.shiftEdit.add(Number(ds.shiftEdit)); rerenderDay(Number(ds.shiftEdit)); }
    else if (ds.restWorked !== undefined) workedRest(Number(ds.restWorked));
    else if (ds.clearDay !== undefined) clearDay(Number(ds.clearDay));
  });

  $("dayList").addEventListener("change", onDayInput);
  $("dayList").addEventListener("input", onDayInput);

  $("weekEnding").addEventListener("change", updateWeekHint);
  $("startBtn").addEventListener("click", startTimesheet);
  $("qStation").addEventListener("change", () => renderQuickFill(currentSheet()));
  $("qShift").addEventListener("change", updateQuickVisibility);
  $("qActual").addEventListener("change", updateQuickVisibility);
  $("qOtherStart").innerHTML = timeOptions("");
  $("qOtherFinish").innerHTML = timeOptions("");
  $("qOtherHours").innerHTML = durOptions("", 24 * 60, "hrs");
  $("qOtherHours").addEventListener("change", () => {
    const f = addHours($("qOtherStart").value, Number($("qOtherHours").value) / 60);
    if (f) $("qOtherFinish").value = f;
  });
  $("qOtherFinish").addEventListener("change", () => {
    const m = shiftMins($("qOtherStart").value, $("qOtherFinish").value);
    $("qOtherHours").value = m && m % 15 === 0 ? String(m) : "";
  });
  $("applyBtn").addEventListener("click", applyQuickFill);
  $("publishBtn").addEventListener("click", publish);
  $("barPublish").addEventListener("click", () => {
    $("declaration").closest(".card").scrollIntoView({ behavior: "smooth", block: "center" });
    $("declaration").closest(".card").classList.add("pulse");
    setTimeout(() => $("declaration").closest(".card").classList.remove("pulse"), 1200);
  });
  $("previewBtn").addEventListener("click", previewDownload);
  $("closeBtn").addEventListener("click", () => { state.currentId = null; saveState(); renderTimesheet(); toast("Draft kept — find it under Library or Start."); });
  $("discardBtn").addEventListener("click", () => { const s = currentSheet(); if (s) deleteSheet(s.id); });

  $("libSearch").addEventListener("input", renderLibrary);
  $("libFilter").addEventListener("change", renderLibrary);

  $("pBase").addEventListener("change", () => { $("pBaseOtherWrap").hidden = $("pBase").value !== "Other"; });
  $("pName").addEventListener("input", () => { if (sig.mode === "type" && !$("pSigText").value.trim()) renderTypedSig(); });
  $("saveProfileBtn").addEventListener("click", saveProfile);
  $("pRoster").addEventListener("change", () => {
    if (!$("pRoster").value) { $("pRosterLine").value = ""; }
    onRosterChange();
  });
  $("pRosterLine").addEventListener("change", onRosterChange);
  $("pStdDay").addEventListener("change", onLeaveRulesChange);
  $("pStdDayLeave").addEventListener("change", onLeaveRulesChange);
  $("pRosterStart").addEventListener("change", onRosterChange);
  $("pRoadBase").addEventListener("change", () => { state.profile.roadBase = $("pRoadBase").value; saveState(); toast("Road base saved."); });
  ROLES.map(r => `${r}List`).filter(id => $(id)).forEach(id => {
    $(id).addEventListener("input", onContactEdit);
    $(id).addEventListener("change", onContactEdit);
    $(id).addEventListener("click", e => { const b = e.target.closest("[data-cf-del]"); if (b) removeContact(b.closest("[data-contact]").dataset.contact); });
  });
  $("addOrmBtn").addEventListener("click", () => addContact("orm"));
  $("addDcmBtn").addEventListener("click", () => addContact("dcm"));
  $("addSupBtn").addEventListener("click", () => addContact("sup"));
  $("exportBackupBtn").addEventListener("click", exportBackup);
  $("importBackupBtn").addEventListener("click", () => $("importBackupFile").click());
  $("importBackupFile").addEventListener("change", importBackup);

  $("publishedDialog").addEventListener("close", () => {
    const v = $("publishedDialog").returnValue;
    const id = ui.lastPublishedId;
    if (v === "email") openSendDialog(id);
    if (v === "download") buildPdfFile(state.sheets.find(s => s.id === id)).then(downloadFile);
  });

  $("sendBoxes").addEventListener("change", renderSendPreview);
  $("copyAddrBtn").addEventListener("click", async () => {
    const { to, cc } = chosenRecipients();
    const list = [...to, ...cc].map(r => r.email).join(", ");
    if (!list) return toast("Tick at least one person first.", true);
    try { await navigator.clipboard.writeText(list); toast("Addresses copied — press and hold To in your email, then Paste."); }
    catch { prompt("Copy these addresses:", list); }
  });

  $("sendForm").addEventListener("submit", e => {
    const method = e.submitter?.value;
    if (method !== "mail" && method !== "share") return; // cancel
    const { to, cc } = chosenRecipients();
    if (!to.length && !cc.length) {
      e.preventDefault();
      return toast("Tick at least one person to send to.", true);
    }
    if (!ui.sendFiles) { e.preventDefault(); return toast("Still preparing the PDF — one moment.", true); }
    sendSheet(method);
  });

  // Keep several open tabs in sync so a stale tab never overwrites newer data.
  window.addEventListener("storage", e => {
    if (e.key !== STORAGE_KEY) return;
    loadState();
    const visible = document.querySelector('.tab[aria-selected="true"]')?.dataset.tab || "timesheet";
    if (visible === "library") renderLibrary();
    else if (visible === "timesheet") renderTimesheet();
  });

  // Make sure the latest typing is saved if the tab is closed.
  window.addEventListener("pagehide", saveState);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") saveState(); });
}

/* ------------------------------------------------------------------ */
/* Appearance: colour theme + light/dark                               */
/* ------------------------------------------------------------------ */

const THEMES = [
  { id: "teal",  label: "Teal",      color: "#0b5f73" },
  { id: "green", label: "NAS Green", color: "#1f7a4d" },
  { id: "navy",  label: "Navy",      color: "#1e3a8a" },
  { id: "plum",  label: "Plum",      color: "#6b2f8a" },
  { id: "slate", label: "Slate",     color: "#334155" }
];
const darkQuery = window.matchMedia ? matchMedia("(prefers-color-scheme: dark)") : null;

function applyAppearance() {
  const p = state.profile;
  const mode = p.mode || "system";
  const dark = mode === "dark" || (mode === "system" && !!darkQuery?.matches);
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  if (p.theme && p.theme !== "teal") root.setAttribute("data-theme", p.theme); else root.removeAttribute("data-theme");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(root).getPropertyValue("--hdr1").trim() || "#0b5f73";
}

function renderAppearance() {
  const p = state.profile;
  $("themeSwatches").innerHTML = THEMES.map(t => `
    <button type="button" class="swatch" data-theme-pick="${t.id}" aria-pressed="${(p.theme || "teal") === t.id}">
      <span class="swatch__dot" style="background:${t.color}"></span>${t.label}
    </button>`).join("");
  const r = document.querySelector(`input[name="mode"][value="${p.mode || "system"}"]`);
  if (r) r.checked = true;
}

function initAppearance() {
  applyAppearance();
  renderAppearance();
  $("themeSwatches").addEventListener("click", e => {
    const b = e.target.closest("[data-theme-pick]");
    if (!b) return;
    state.profile.theme = b.dataset.themePick;
    saveState(); applyAppearance(); renderAppearance();
  });
  $("modePicker").addEventListener("change", e => {
    state.profile.mode = e.target.value;
    saveState(); applyAppearance();
  });
  darkQuery?.addEventListener?.("change", applyAppearance);
}

/* ------------------------------------------------------------------ */
/* Add to Home Screen + offline                                        */
/* ------------------------------------------------------------------ */

let installPrompt = null;
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

function initInstall() {
  const btn = $("installBtn");
  const refresh = () => { btn.hidden = isStandalone() || !(installPrompt || isIOS()); };
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installPrompt = e; refresh(); });
  window.addEventListener("appinstalled", () => { installPrompt = null; refresh(); toast("Added to your home screen."); });
  btn.addEventListener("click", async () => {
    if (installPrompt) {
      installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === "accepted") installPrompt = null;
      refresh();
    } else if (isIOS()) {
      $("iosInstallDialog").showModal();
    }
  });
  refresh();
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(err => console.warn("Offline support unavailable:", err));
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  loadState();
  initSigPad();
  initInstall();
  initAppearance();
  renderVehicleList();
  bind();
  renderProfile();
  showTab(state.profile.name ? "timesheet" : "profile");
  const tpl = await loadTemplate();
  $("templateStatus").textContent = tpl
    ? "Excel export: using template.xlsx from this site."
    : "Excel export: no template.xlsx found, so a built-in layout with the same cell positions is used.";
});
