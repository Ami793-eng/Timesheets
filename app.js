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
  "Shift Swap"
];

const DECLARATION =
  "I confirm that the hours submitted are accurate and relate to duties undertaken during the stated period.";

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

let state = {
  profile: { name: "", number: "", base: "", baseOther: "",
    ormEmail: "", supEmail: "", meEmail: "", ormDefault: true, supDefault: false, meDefault: true,
    signatureMode: "draw", signatureText: "", signatureFont: "dancing", signatureImage: "" },
  currentId: null,
  sheets: []
};

const ui = {
  expanded: new Set(),       // indexes of expanded day cards
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
      if (parsed.profile?.emailTo && !state.profile.ormEmail) state.profile.ormEmail = parsed.profile.emailTo;
      delete state.profile.emailTo;
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
    actual: "same",      // same | times | leave | none
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
    subsLocation: ""
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
  if (d.actual === "times") return { kind: "times", from: d.actualFrom, to: d.actualTo };
  if (d.actual === "leave") return { kind: "leave", label: d.actualLeave };
  return { kind: "none" };
}

// Overtime rule from the spec: same start, later finish → OT from roster finish to actual finish.
function autoOvertime(d) {
  if (!d.otAuto) return;
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

// The exact values written to the workbook for one day.
function excelCells(d) {
  const roster = d.roster || "rest";
  const c = { rFrom: "", rTo: "", aFrom: "", aTo: "", otFrom: "", otTo: "", otReason: "" };
  if (roster === "rest") c.rFrom = "Rest Day";
  else if (roster === "leave") c.rFrom = d.rosterLeave;
  else { c.rFrom = d.rosterFrom; c.rTo = d.rosterTo; }

  const a = resolvedActual(d);
  if (a.kind === "times") { c.aFrom = a.from; c.aTo = a.to; }
  else if (a.kind === "leave") c.aFrom = a.label;

  if (d.ot) {
    c.otFrom = d.otFrom;
    c.otTo = d.otTo;
    c.otReason = d.otReason.trim();
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
  let text = d.roster === "times" ? `${c.rFrom}–${c.rTo}` : c.rFrom;
  const a = resolvedActual(d);
  if (d.actual !== "same") {
    if (a.kind === "times") text += ` · actual ${a.from}–${a.to}`;
    else if (a.kind === "leave") text += ` · actual: ${a.label}`;
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
  html += `</optgroup><optgroup label="Leave / other">`;
  LEAVE_TYPES.forEach(l => { html += opt(`leave:${l}`, l, current === `leave:${l}`); });
  html += `</optgroup>`;
  html += opt("other", "Other (enter times)", current === "other");
  return html;
}

function rosterValue(d) {
  if (!d.roster) return "";
  if (d.roster === "rest") return "rest";
  if (d.roster === "leave") return `leave:${d.rosterLeave}`;
  const preset = SHIFTS.find(s => s.start === d.rosterFrom && s.finish === d.rosterTo);
  if (preset && shiftsForStation(d.station || "Other").includes(preset)) return `shift:${preset.start}`;
  return "other";
}

function applyRosterValue(d, value, otherStart, otherFinish) {
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
  document.querySelectorAll(".panel").forEach(p => { p.hidden = p.id !== `tab-${name}`; });
  if (name === "library") renderLibrary();
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
  $("pNumber").value = p.number;
  $("pBase").innerHTML = opt("", "— Select —", !p.base) + STATIONS.map(s => opt(s, s, p.base === s)).join("");
  $("pBaseOther").value = p.baseOther;
  $("pBaseOtherWrap").hidden = p.base !== "Other";
  RECIPIENTS.forEach(r => {
    $(r.emailId).value = p[r.emailKey] || "";
    $(r.defaultId).checked = !!p[r.defaultKey];
  });
  $("pSigText").value = p.signatureText;
  $("pSigFont").value = p.signatureFont || SIG_FONTS[0].id;
  const mode = p.signatureMode || "draw";
  document.querySelector(`input[name="sigMode"][value="${mode}"]`).checked = true;
  setSigMode(mode, { keep: true });
  drawSignatureImage(p.signatureImage);
}

function saveProfile() {
  const p = state.profile;
  p.name = $("pName").value.trim();
  p.number = $("pNumber").value.trim();
  p.base = $("pBase").value;
  p.baseOther = $("pBaseOther").value.trim();
  const bad = [];
  RECIPIENTS.forEach(r => {
    p[r.emailKey] = $(r.emailId).value.trim();
    p[r.defaultKey] = $(r.defaultId).checked;
    if (p[r.emailKey] && !isEmail(p[r.emailKey])) bad.push(r.label);
  });
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
  if (!sheet) return renderStart();

  const p = state.profile;
  $("sheetTitle").textContent = `Week ending ${displayDate(sheet.weekEnding)}`;
  $("sheetStatus").textContent = sheet.version > 1 ? `Draft · revision v${sheet.version}` : "Draft";
  $("sheetStaff").textContent = [p.name || "No name set", p.number ? `#${p.number}` : "", profileBase()].filter(Boolean).join(" · ");
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
      <li><button class="link-btn" data-open="${esc(s.id)}">Week ending ${esc(displayDate(s.weekEnding))}${s.version > 1 ? ` (v${s.version})` : ""}</button>
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
    state.sheets.push(sheet);
    state.currentId = sheet.id;
  }
  ui.expanded.clear();
  ui.selectedDays.clear();
  saveState();
  renderTimesheet();
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
  const prev = $("qShift").value;
  $("qShift").innerHTML = rosterOptions(qs.value, prev).replace(opt("", "— Select —", prev === ""), "");
  if (prev && [...$("qShift").options].some(o => o.value === prev)) $("qShift").value = prev;
  updateQuickVisibility();
}

function updateQuickVisibility() {
  const v = $("qShift").value;
  $("qOtherWrap").hidden = v !== "other";
  $("qSwapWrap").hidden = v !== "leave:Shift Swap";
  $("qActualWrap").hidden = !(v.startsWith("shift:") || v === "other");
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
    otherFinish = $("qOtherFinish").value || addHours(otherStart, $("qOtherHours").value);
    if (!isTime(otherStart) || !isTime(otherFinish)) return toast("Enter a start time and a finish time (or hours).", true);
  }
  const actualMode = document.querySelector('input[name="qActual"]:checked').value;
  for (const i of days) {
    const d = sheet.days[i];
    d.station = station;
    applyRosterValue(d, value, otherStart, otherFinish);
    if (d.roster === "times") {
      if (actualMode === "same") d.actual = "same";
      else { d.actual = "times"; d.actualFrom = d.rosterFrom; d.actualTo = d.rosterTo; ui.expanded.add(i); }
    }
    if (value === "leave:Shift Swap") d.swapNote = $("qSwapNote").value.trim();
    autoOvertime(d);
  }
  const label = $("qShift").selectedOptions[0]?.textContent || value;
  touch(sheet, `Quick fill: ${label} → ${days.map(i => DAYS[i].short).join(", ")}`);
  ui.selectedDays.clear();
  saveState();
  renderTimesheet();
  toast(`Applied to ${days.length} day${days.length > 1 ? "s" : ""}.`);
}

/* Day cards ---------------------------------------------------------- */

function renderDays(sheet) {
  $("dayList").innerHTML = sheet.days.map((d, i) => dayCard(d, i)).join("");
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
}

function dayCard(d, i) {
  const open = ui.expanded.has(i);
  const sum = daySummary(d);
  const flags = [
    d.ot ? `<span class="tag tag--ot">OT ${esc(d.otFrom)}–${esc(d.otTo)}</span>` : "",
    d.ot && !d.otReason.trim() ? `<span class="tag tag--warn">Incident no. needed</span>` : "",
    d.subs ? `<span class="tag tag--subs">Subsistence</span>` : ""
  ].join("");

  return `
  <article class="day ${open ? "day--open" : ""} ${sum.cls}" data-day-card="${i}">
    <button type="button" class="day__head" data-toggle="${i}" aria-expanded="${open}">
      <span class="day__name">${DAYS[i].name}<small>${esc(displayDate(d.date))}</small></span>
      <span class="day__sum">${esc(sum.text)}</span>
      <span class="day__flags">${flags}</span>
      <span class="day__chev" aria-hidden="true"></span>
    </button>
    ${open ? dayEditor(d, i) : ""}
  </article>`;
}

function dayEditor(d, i) {
  const rv = rosterValue(d);
  const st = d.station || state.profile.base || "Other";
  const isTimes = d.roster === "times";
  const isSwap = d.rosterLeave === "Shift Swap" || (d.actual === "leave" && d.actualLeave === "Shift Swap");

  const actualOpts = [
    isTimes ? opt("same", "Worked as rostered", d.actual === "same") : "",
    d.roster === "leave" ? opt("same", `Same as roster (${d.rosterLeave})`, d.actual === "same") : "",
    opt("times", d.roster === "rest" ? "Worked (called in)" : "Different times", d.actual === "times"),
    opt("leave", "Leave / other", d.actual === "leave"),
    opt("none", d.roster === "rest" ? "Not worked (Rest Day)" : "Not worked", d.actual === "none")
  ].join("");

  return `
  <div class="day__body">
    <div class="grid-2">
      <div class="field">
        <label>Station</label>
        <select data-f="station" data-i="${i}">${STATIONS.map(s => opt(s, s, s === st)).join("")}</select>
      </div>
      <div class="field">
        <label>Rostered</label>
        <select data-f="rosterValue" data-i="${i}">${rosterOptions(st, rv)}</select>
      </div>
    </div>

    ${isTimes ? `
    <div class="grid-3">
      <div class="field"><label>Roster from</label><input type="time" data-f="rosterFrom" data-i="${i}" value="${esc(d.rosterFrom)}"></div>
      <div class="field"><label>Roster to</label><input type="time" data-f="rosterTo" data-i="${i}" value="${esc(d.rosterTo)}"></div>
      <div class="field"><label>or hours</label><input type="number" min="0.25" max="24" step="0.25" inputmode="decimal" data-f="rosterHours" data-i="${i}" placeholder="hrs"></div>
    </div>` : ""}

    ${d.roster ? `
    <div class="field">
      <label>Actual</label>
      <select data-f="actual" data-i="${i}">${actualOpts}</select>
    </div>` : ""}

    ${d.actual === "times" && d.roster ? `
    <div class="grid-3">
      <div class="field"><label>Actual from</label><input type="time" data-f="actualFrom" data-i="${i}" value="${esc(d.actualFrom)}"></div>
      <div class="field"><label>Actual to</label><input type="time" data-f="actualTo" data-i="${i}" value="${esc(d.actualTo)}"></div>
      <div class="field"><label>or hours</label><input type="number" min="0.25" max="24" step="0.25" inputmode="decimal" data-f="actualHours" data-i="${i}" placeholder="hrs"></div>
    </div>` : ""}

    ${d.actual === "leave" && d.roster ? `
    <div class="field">
      <label>Actual leave type</label>
      <select data-f="actualLeave" data-i="${i}">${opt("", "— Select —", !d.actualLeave)}${LEAVE_TYPES.map(l => opt(l, l, d.actualLeave === l)).join("")}</select>
    </div>` : ""}

    ${isSwap ? `
    <div class="field">
      <label>Shift swap note (optional)</label>
      <input type="text" data-f="swapNote" data-i="${i}" value="${esc(d.swapNote)}" placeholder="Swapped with / reason">
    </div>` : ""}

    ${d.roster ? `
    <fieldset class="sub">
      <legend>Overtime worked?</legend>
      <div class="segmented">
        <label><input type="radio" name="ot${i}" data-f="ot" data-i="${i}" value="no" ${!d.ot ? "checked" : ""}> No</label>
        <label><input type="radio" name="ot${i}" data-f="ot" data-i="${i}" value="yes" ${d.ot ? "checked" : ""}> Yes</label>
      </div>
      ${d.ot ? `
      ${d.otAuto ? `<p class="hint">Worked out from your actual finish time. Change it if needed.</p>` : ""}
      <div class="grid-2">
        <div class="field"><label>OT from</label><input type="time" data-f="otFrom" data-i="${i}" value="${esc(d.otFrom)}"></div>
        <div class="field"><label>OT to</label><input type="time" data-f="otTo" data-i="${i}" value="${esc(d.otTo)}"></div>
      </div>
      <div class="field">
        <label>Incident number / reason <span class="req">required</span></label>
        <input type="text" data-f="otReason" data-i="${i}" value="${esc(d.otReason)}" placeholder="e.g. incident number, late call" class="${d.otReason.trim() ? "" : "needs"}">
      </div>` : ""}
    </fieldset>

    <fieldset class="sub">
      <legend>Subsistence?</legend>
      <div class="segmented">
        <label><input type="radio" name="subs${i}" data-f="subs" data-i="${i}" value="no" ${!d.subs ? "checked" : ""}> No</label>
        <label><input type="radio" name="subs${i}" data-f="subs" data-i="${i}" value="yes" ${d.subs ? "checked" : ""}> Yes</label>
      </div>
      ${d.subs ? `
      <div class="grid-2">
        <div class="field"><label>From</label><input type="time" data-f="subsFrom" data-i="${i}" value="${esc(d.subsFrom)}"></div>
        <div class="field"><label>To</label><input type="time" data-f="subsTo" data-i="${i}" value="${esc(d.subsTo)}"></div>
        <div class="field"><label>Rate</label><select data-f="subsRate" data-i="${i}">${opt("", "— Select —", !d.subsRate)}${["5 hr", "10 hr"].map(r => opt(r, r, d.subsRate === r)).join("")}</select></div>
        <div class="field"><label>Location / incident</label><input type="text" data-f="subsLocation" data-i="${i}" value="${esc(d.subsLocation)}"></div>
      </div>` : ""}
    </fieldset>` : ""}

    <div class="day__foot">
      <button type="button" class="btn btn--small btn--ghost" data-copy-next="${i}" ${i === 6 ? "disabled" : ""}>Copy to next day</button>
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
  const textFields = ["otReason", "subsLocation", "swapNote"];
  if (textFields.includes(f)) {
    d[f] = el.value;
    if (f === "otReason") el.classList.toggle("needs", !el.value.trim());
    touch(sheet);
    saveSoon();
    if (e.type === "change") updateDayHead(i);
    return;
  }
  if (e.type === "input") return; // structural fields are handled on "change"

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
      d.rosterTo = addHours(d.rosterFrom, el.value) || d.rosterTo;
      break;
    }
    case "actualHours": {
      d.actualTo = addHours(d.actualFrom, el.value) || d.actualTo;
      break;
    }
    case "actual": {
      d.actual = el.value;
      if (d.actual === "times" && !d.actualFrom) { d.actualFrom = d.rosterFrom; d.actualTo = d.rosterTo; }
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
    default:
      d[f] = el.value;
  }
  if (["rosterValue", "rosterFrom", "rosterTo", "rosterHours", "actual", "actualFrom", "actualTo", "actualHours", "actualLeave"].includes(f)) {
    autoOvertime(d);
  }
  touch(sheet);
  saveState();
  rerenderDay(i);
}

function updateDayHead(i) {
  // Refresh tag row only (e.g. "Incident no. needed") without rebuilding inputs.
  const sheet = currentSheet();
  const card = document.querySelector(`[data-day-card="${i}"] .day__flags`);
  if (!sheet || !card) return;
  const tmp = document.createElement("div");
  tmp.innerHTML = dayCard(sheet.days[i], i);
  card.innerHTML = tmp.querySelector(".day__flags").innerHTML;
}

function copyToNext(i) {
  const sheet = currentSheet();
  if (!sheet || i >= 6) return;
  const src = sheet.days[i];
  const dst = sheet.days[i + 1];
  const keep = { date: dst.date };
  Object.assign(dst, structuredClone(src), keep, { otReason: "", subs: false, subsFrom: "", subsTo: "", subsRate: "", subsLocation: "" });
  if (!dst.otAuto) { dst.ot = false; dst.otFrom = ""; dst.otTo = ""; dst.otAuto = true; }
  autoOvertime(dst);
  touch(sheet, `Copied ${DAYS[i].short} → ${DAYS[i + 1].short}`);
  ui.expanded.add(i + 1);
  saveState();
  renderDays(sheet);
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
  sheet.days.forEach((d, i) => {
    const n = DAYS[i].name;
    if (d.roster === "times" && !(isTime(d.rosterFrom) && isTime(d.rosterTo))) errors.push(`${n}: rostered start and finish times are needed.`);
    if (d.roster === "leave" && !d.rosterLeave) errors.push(`${n}: choose the leave type.`);
    if (d.roster && d.actual === "times" && !(isTime(d.actualFrom) && isTime(d.actualTo))) errors.push(`${n}: actual start and finish times are needed.`);
    if (d.roster && d.actual === "leave" && !d.actualLeave) errors.push(`${n}: choose the actual leave type.`);
    if (d.ot) {
      if (!isTime(d.otFrom) || !isTime(d.otTo)) errors.push(`${n}: overtime from/to times are needed.`);
      if (!d.otReason.trim()) errors.push(`${n}: an incident number / reason is required for overtime.`);
    }
    if (d.subs) {
      if (!isTime(d.subsFrom)) errors.push(`${n}: subsistence "From" time is missing.`);
      if (!isTime(d.subsTo)) errors.push(`${n}: subsistence "To" time is missing.`);
      if (!d.subsRate.trim()) errors.push(`${n}: subsistence rate is missing.`);
      if (!d.subsLocation.trim()) errors.push(`${n}: subsistence location / incident is missing.`);
    }
  });
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
  if (empty.length && !confirm(`Not entered: ${empty.join(", ")}.\n\nThese will be recorded as Rest Day. Publish?`)) return;
  sheet.days.forEach(d => { if (!d.roster) { d.roster = "rest"; d.actual = "none"; } });

  // Snapshot staff details onto the sheet so the library copy is self-contained.
  const p = state.profile;
  sheet.staff = { name: p.name, number: p.number, base: profileBase(), signatureText: p.signatureText, signatureImage: p.signatureImage };
  sheet.declaration = DECLARATION;

  try {
    const file = await buildWorkbookFile(sheet);
    downloadFile(file);
    sheet.status = "published";
    sheet.publishedAt = new Date().toISOString();
    touch(sheet, `Published v${sheet.version}`);
    state.currentId = null;
    ui.lastPublishedId = sheet.id;
    $("declaration").checked = false;
    saveState();
    renderTimesheet();
    $("publishedText").textContent = `${file.name} has been downloaded and saved to your library.`;
    $("publishedDialog").showModal();
  } catch (err) {
    console.error(err);
    alert("The Excel file couldn't be created:\n\n" + err.message);
  }
}

async function previewDownload() {
  const sheet = currentSheet();
  if (!sheet) return;
  const p = state.profile;
  const snapshot = { ...structuredClone(sheet), staff: { name: p.name, number: p.number, base: profileBase(), signatureText: p.signatureText, signatureImage: p.signatureImage } };
  try {
    const file = await buildWorkbookFile(snapshot, "_DRAFT");
    downloadFile(file);
  } catch (err) {
    console.error(err);
    alert("The Excel file couldn't be created:\n\n" + err.message);
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

async function buildWorkbookFile(sheet, suffix = "") {
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
    setCell(ws, `${EXCEL.otFromCol}${m.rosterRow}`, c.otFrom);
    setCell(ws, `${EXCEL.otToCol}${m.rosterRow}`, c.otTo);
    setCell(ws, `${EXCEL.otReasonCol}${m.rosterRow}`, c.otReason);
    const subs = d.subs ? [d.subsFrom, d.subsTo, d.subsRate.trim(), d.subsLocation.trim()] : ["", "", "", ""];
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
  const v = sheet.version > 1 ? `_v${sheet.version}` : "";
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

const RECIPIENTS = [
  { key: "orm", label: "ORM",        kind: "to", emailKey: "ormEmail", defaultKey: "ormDefault", emailId: "pOrmEmail", defaultId: "pOrmDefault" },
  { key: "sup", label: "Supervisor", kind: "to", emailKey: "supEmail", defaultKey: "supDefault", emailId: "pSupEmail", defaultId: "pSupDefault" },
  { key: "me",  label: "Me",         kind: "cc", emailKey: "meEmail",  defaultKey: "meDefault",  emailId: "pMeEmail",  defaultId: "pMeDefault" }
];

function isEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function fmtWhen(iso) { return new Date(iso).toLocaleString("en-IE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); }

function emailText(sheet) {
  const staff = sheet.staff || state.profile;
  const we = displayDate(sheet.weekEnding);
  return {
    subject: `Timesheet – ${staff.name} (${staff.number}) – week ending ${we}${sheet.version > 1 ? ` (revised v${sheet.version})` : ""}`,
    body: `Hi,\n\nPlease find attached my timesheet for the week ending ${we}${sheet.version > 1 ? ` (revised version ${sheet.version} — please use this one)` : ""}.\n\nThanks,\n${staff.name}`
  };
}

function sendLine(rec) {
  const names = [...rec.to, ...rec.cc].map(r => r.label).join(", ");
  return `${names} · ${fmtWhen(rec.at)}`;
}

function openSendDialog(id) {
  const sheet = state.sheets.find(s => s.id === id);
  if (!sheet) return;
  ui.sendId = id;
  const p = state.profile;
  $("sendWhat").textContent = `Week ending ${displayDate(sheet.weekEnding)}${sheet.version > 1 ? ` · v${sheet.version}` : ""} · ${fileName(sheet)}`;
  $("sendBoxes").innerHTML = RECIPIENTS.map(r => {
    const email = p[r.emailKey];
    const ok = email && isEmail(email);
    return `
      <label class="send-box ${ok ? "" : "send-box--off"}">
        <input type="checkbox" name="recip" value="${r.key}" ${ok && p[r.defaultKey] ? "checked" : ""} ${ok ? "" : "disabled"}>
        <span class="send-box__label">${r.label}${r.kind === "cc" ? ` <small>CC</small>` : ""}</span>
        <span class="send-box__email">${ok ? esc(email) : `No email set — <a href="#" data-goto="profile" data-close-send>add in My details</a>`}</span>
      </label>`;
  }).join("");
  const canShare = !!(navigator.canShare && navigator.canShare({ files: [new File(["x"], "t.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })] }));
  $("sendShareBtn").hidden = !canShare;
  $("sendHow").textContent = canShare
    ? "Open email: your email app opens with the addresses and subject filled in, and the file is downloaded for you to attach. Share file: attaches the file directly; the ticked addresses are copied so you can paste them in."
    : "Your email app opens with the addresses and subject filled in. The Excel file is downloaded at the same time — attach it, then press Send.";
  const sends = sheet.sends || [];
  $("sendLog").innerHTML = sends.length ? `
    <div class="send-log"><strong>Previously sent</strong>
      <ul>${sends.slice().reverse().map(r => `<li>${esc(sendLine(r))}</li>`).join("")}</ul></div>` : "";
  $("sendDialog").showModal();
}

function chosenRecipients() {
  const picked = [...document.querySelectorAll('#sendBoxes input[name="recip"]:checked')].map(i => i.value);
  const p = state.profile;
  const list = RECIPIENTS.filter(r => picked.includes(r.key)).map(r => ({ role: r.key, label: r.label, email: p[r.emailKey], kind: r.kind }));
  return {
    to: list.filter(r => r.kind === "to").map(({ kind, ...r }) => r),
    cc: list.filter(r => r.kind === "cc").map(({ kind, ...r }) => r)
  };
}

function recordSend(sheet, rec) {
  sheet.sends = sheet.sends || [];
  sheet.sends.push(rec);
  const fmt = arr => arr.map(r => `${r.label} (${r.email})`).join(", ");
  touch(sheet, `Sent by email to ${fmt(rec.to) || "—"}${rec.cc.length ? `; CC ${fmt(rec.cc)}` : ""}${rec.method === "share" ? " (via share)" : ""}`);
  saveState();
  renderLibrary();
}

async function sendSheet(method) {
  const sheet = state.sheets.find(s => s.id === ui.sendId);
  if (!sheet) return;
  const rec = { ...chosenRecipients(), at: new Date().toISOString(), method };
  const file = await buildWorkbookFile(sheet);
  const { subject, body } = emailText(sheet);
  const toList = rec.to.map(r => r.email);
  const ccList = rec.cc.map(r => r.email);

  if (method === "share") {
    const addresses = [...toList, ...ccList].join("; ");
    try { if (addresses) await navigator.clipboard.writeText(addresses); } catch { /* clipboard not available */ }
    try {
      await navigator.share({ files: [file], title: subject, text: body });
    } catch (err) {
      if (err.name === "AbortError") return toast("Not sent.");
      throw err;
    }
    recordSend(sheet, rec);
    return toast(addresses ? "Shared. Addresses were copied — paste them into the To box." : "Shared.");
  }

  downloadFile(file);
  const params = [`subject=${encodeURIComponent(subject)}`, `body=${encodeURIComponent(`${body}\n\n[Attach: ${file.name}]`)}`];
  if (ccList.length) params.unshift(`cc=${ccList.map(encodeURIComponent).join(",")}`);
  recordSend(sheet, rec);
  const url = `mailto:${toList.map(encodeURIComponent).join(",")}?${params.join("&")}`;
  console.info("Opening email:", url);
  setTimeout(() => { window.location.href = url; }, 300);
  toast(`Email opened · logged ${fmtWhen(rec.at)}`);
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
        <div class="eyebrow">${s.status === "published" ? "Published" : "Draft"}${s.version > 1 ? ` · v${s.version}` : ""}${superseded ? " · superseded" : ""}</div>
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
          <button class="btn btn--small" data-download="${esc(s.id)}">Download</button>
          <button class="btn btn--small" data-revise="${esc(s.id)}">Revise</button>
          <button class="btn btn--danger-ghost btn--small" data-delete="${esc(s.id)}">Delete</button>`}
      </div>
      <details class="lib-item__history"><summary>History</summary>
        <ul>${s.history.slice().reverse().map(h => `<li><time>${esc(new Date(h.at).toLocaleString("en-IE", { dateStyle: "short", timeStyle: "short" }))}</time> ${esc(h.action)}</li>`).join("")}</ul>
      </details>
    </article>`;
  }).join("");
}

function searchText(s) {
  return [
    displayDate(s.weekEnding), s.weekEnding, s.status, `v${s.version}`, s.sends?.length ? "sent emailed" : "not sent",
    ...(s.sends || []).flatMap(r => [...r.to, ...r.cc].flatMap(x => [x.label, x.email])),
    ...s.days.flatMap(d => [d.station, d.rosterLeave, d.actualLeave, d.otReason, d.subsLocation, d.swapNote])
  ].join(" ").toLowerCase();
}

function openSheet(id) {
  state.currentId = id;
  ui.expanded.clear();
  ui.selectedDays.clear();
  saveState();
  showTab("timesheet");
}

function reviseSheet(id) {
  const original = state.sheets.find(s => s.id === id);
  if (!original) return;
  const existing = state.sheets.find(s => s.revisionOf === id && s.status === "draft");
  if (existing) return openSheet(existing.id);
  const copy = structuredClone(original);
  const now = new Date().toISOString();
  Object.assign(copy, {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    status: "draft",
    version: Math.max(...state.sheets.filter(s => s.weekEnding === original.weekEnding).map(s => s.version || 1)) + 1,
    revisionOf: original.id,
    createdAt: now, updatedAt: now, publishedAt: "",
    history: [{ action: `Revision of v${original.version} created`, at: now }]
  });
  delete copy.staff;
  state.sheets.push(copy);
  toast(`Revision v${copy.version} created — make your changes and publish again.`);
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
    const t = e.target.closest("[data-goto],[data-open],[data-share],[data-download],[data-revise],[data-delete],[data-toggle],[data-chip],[data-copy-next],[data-clear-day]");
    if (!t) return;
    const ds = t.dataset;
    if (ds.goto) { e.preventDefault(); if (ds.closeSend !== undefined) $("sendDialog").close("cancel"); showTab(ds.goto); }
    else if (ds.open) openSheet(ds.open);
    else if (ds.share) openSendDialog(ds.share);
    else if (ds.download) {
      const s = state.sheets.find(x => x.id === ds.download);
      buildWorkbookFile(s).then(downloadFile).catch(err => alert(err.message));
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
    else if (ds.clearDay !== undefined) clearDay(Number(ds.clearDay));
  });

  $("dayList").addEventListener("change", onDayInput);
  $("dayList").addEventListener("input", onDayInput);

  $("weekEnding").addEventListener("change", updateWeekHint);
  $("startBtn").addEventListener("click", startTimesheet);
  $("qStation").addEventListener("change", () => renderQuickFill(currentSheet()));
  $("qShift").addEventListener("change", updateQuickVisibility);
  $("qOtherHours").addEventListener("input", () => {
    const f = addHours($("qOtherStart").value, $("qOtherHours").value);
    if (f) $("qOtherFinish").value = f;
  });
  $("applyBtn").addEventListener("click", applyQuickFill);
  $("publishBtn").addEventListener("click", publish);
  $("previewBtn").addEventListener("click", previewDownload);
  $("closeBtn").addEventListener("click", () => { state.currentId = null; saveState(); renderTimesheet(); toast("Draft kept — find it under Library or Start."); });
  $("discardBtn").addEventListener("click", () => { const s = currentSheet(); if (s) deleteSheet(s.id); });

  $("libSearch").addEventListener("input", renderLibrary);
  $("libFilter").addEventListener("change", renderLibrary);

  $("pBase").addEventListener("change", () => { $("pBaseOtherWrap").hidden = $("pBase").value !== "Other"; });
  $("pName").addEventListener("input", () => { if (sig.mode === "type" && !$("pSigText").value.trim()) renderTypedSig(); });
  $("saveProfileBtn").addEventListener("click", saveProfile);
  $("exportBackupBtn").addEventListener("click", exportBackup);
  $("importBackupBtn").addEventListener("click", () => $("importBackupFile").click());
  $("importBackupFile").addEventListener("change", importBackup);

  $("publishedDialog").addEventListener("close", () => {
    const v = $("publishedDialog").returnValue;
    const id = ui.lastPublishedId;
    if (v === "email") openSendDialog(id);
    if (v === "download") buildWorkbookFile(state.sheets.find(s => s.id === id)).then(downloadFile);
  });

  $("sendForm").addEventListener("submit", e => {
    const method = e.submitter?.value;
    if (method !== "mail" && method !== "share") return; // cancel
    const { to, cc } = chosenRecipients();
    if (!to.length && !cc.length) {
      e.preventDefault();
      return toast("Tick at least one box: ORM, Supervisor or Me.", true);
    }
    sendSheet(method).catch(err => alert("Couldn't send: " + err.message));
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

document.addEventListener("DOMContentLoaded", async () => {
  loadState();
  initSigPad();
  bind();
  renderProfile();
  showTab(state.profile.name ? "timesheet" : "profile");
  const tpl = await loadTemplate();
  $("templateStatus").textContent = tpl
    ? "Excel export: using template.xlsx from this site."
    : "Excel export: no template.xlsx found, so a built-in layout with the same cell positions is used.";
});
