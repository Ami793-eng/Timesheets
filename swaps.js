/* FiNASh Time — swaps.js
 * Shift swaps, personal to the user (no link to anyone else's data).
 *
 * A swap is one record holding both halves:
 *   { id, direction: "off" | "on", colleague, note,
 *     first:  { date, station, from, to },        // the half it was logged from
 *     second: { date, station, from, to } | null,  // the other half — blank until the payback is known
 *     createdAt, updatedAt }
 * The first half has the swap's direction; the second half is the opposite.
 *   Swapped off = I give my rostered shift away  → open: I owe the colleague a shift.
 *   Swapped on  = I work the colleague's shift   → open: a shift is owed to me.
 * A swap is complete once both halves are recorded.
 *
 * Halves are put on the user's own draft timesheets whenever a week is opened (syncSwapsForSheet):
 *   off → the rostered shift stays in the Roster row, Actual reads "Shift Swap", note "Swapped off – Pat (on 20/11)"
 *   on  → the colleague's shift goes in as the day's shift, note "Swapped on – Pat (off 12/11)"
 * Each such day carries d.swap = { id, half: "first" | "second", sig }.
 */
"use strict";

const sw = { editing: null, view: "timesheets" };

function swaps() { state.swaps = state.swaps || []; return state.swaps; }
const swapOpposite = dir => dir === "off" ? "on" : "off";
const swapHalfDir = (s, half) => half === "first" ? s.direction : swapOpposite(s.direction);
const swapIsOpen = s => !s.second?.date;
const swapWeekEnding = iso => isoLocal(nextSunday(parseIso(iso)));
const swapDayIndex = iso => (parseIso(iso).getDay() + 6) % 7;
const swapShiftText = h => h && isTime(h.from) ? `${h.from}–${h.to}${h.station ? ` ${h.station}` : ""}` : "";
const swapDateText = iso => `${DAYS[swapDayIndex(iso)].short} ${displayDate(iso)}`;

// The user's rostered shift on a date (draft timesheet first, then the roster), or null.
function rosterShiftOn(iso) {
  const sheet = state.sheets.find(s => s.status === "draft" && s.weekEnding === swapWeekEnding(iso));
  const d = sheet?.days.find(x => x.date === iso);
  if (d && d.roster === "times" && !(d.swap && swapHalfDir(swaps().find(s => s.id === d.swap.id) || {}, d.swap.half) === "on")) {
    return { station: d.station || "", from: d.rosterFrom, to: d.rosterTo };
  }
  const rw = rosterWeek(swapWeekEnding(iso));
  const sh = rw?.shifts[swapDayIndex(iso)];
  if (!sh || !sh.start) return null;
  const i = swapDayIndex(iso);
  return { station: rw.stations?.[i] || (rw.codes[i] === "X" ? state.profile.roadBase || "" : rw.roster.station || state.profile.base || ""), from: sh.start, to: sh.finish };
}

// The note that goes in the timesheet's notes column for a half.
function swapNoteFor(s, half) {
  const other = half === "first" ? s.second : s.first;
  const dir = swapHalfDir(s, half);
  const when = other?.date ? ` (${dir === "off" ? "on" : "off"} ${shortDate(other.date)})` : "";
  return `${dir === "off" ? "Swapped off" : "Swapped on"} – ${s.colleague}${when}`;
}
const swapSig = (s, half) => JSON.stringify([s.direction, s.colleague, half, s.first, s.second]);

/* ---------- putting halves on timesheets ---------- */

function applySwapHalf(sheet, i, s, half) {
  const d = sheet.days[i];
  const h = s[half];
  if (swapHalfDir(s, half) === "off") {
    // My rostered shift stays in the Roster row; Actual records the swap.
    if (d.roster !== "times") { d.roster = "times"; d.rosterFrom = h.from; d.rosterTo = h.to; d.station = h.station || d.station; d.rosterLabel = d.rosterLabel || ""; }
    d.actual = "leave"; d.actualLeave = "Shift Swap";
  } else {
    // Working the colleague's shift.
    d.roster = "times"; d.rosterFrom = h.from; d.rosterTo = h.to; d.station = h.station || d.station; d.rosterLabel = "Swap";
    d.actual = "same"; d.actualLeave = ""; d.rosterLeave = "";
  }
  d.ot = false; d.otAuto = true;
  d.swapNote = swapNoteFor(s, half);
  d.swap = { id: s.id, half, sig: swapSig(s, half) };
}

// A day loses its swap: back to what the roster says (or blank), with any booked leave on top.
function revertSwapDay(sheet, i) {
  const d = sheet.days[i];
  delete d.swap;
  d.swapNote = ""; d.actualLeave = ""; d.actual = "same"; d.done = false;
  const rw = rosterWeek(sheet.weekEnding);
  if (rw) fillDayFromRoster(sheet, i, rw);
  else if (d.rosterLabel === "Swap") { d.roster = ""; d.rosterFrom = ""; d.rosterTo = ""; d.rosterLabel = ""; }
}

// Make a draft timesheet match the swaps: fill halves dated in its week, undo days whose swap went away.
// Returns true if anything changed.
function syncSwapsForSheet(sheet) {
  if (!sheet || sheet.status !== "draft") return false;
  let changed = false;
  const list = swaps();
  sheet.days.forEach((d, i) => {
    if (!d.swap) return;
    const s = list.find(x => x.id === d.swap.id);
    if (!s || s[d.swap.half]?.date !== d.date) { revertSwapDay(sheet, i); changed = true; }
  });
  if (changed) applyLeavePeriods(sheet);
  for (const s of list) for (const half of ["first", "second"]) {
    const h = s[half];
    if (!h?.date) continue;
    const i = sheet.days.findIndex(d => d.date === h.date);
    if (i < 0) continue;
    const d = sheet.days[i];
    if (d.swap?.id === s.id && d.swap.half === half && d.swap.sig === swapSig(s, half)) continue;
    applySwapHalf(sheet, i, s, half);
    changed = true;
  }
  return changed;
}
function syncAllSwaps() {
  let changed = false;
  for (const s of state.sheets) if (syncSwapsForSheet(s)) changed = true;
  return changed;
}
// Published weeks a swap touches (they aren't changed — revise them).
function swapPublishedWeeks(s) {
  const dates = [s.first?.date, s.second?.date].filter(Boolean);
  return state.sheets.filter(sh => sh.status === "published" && !state.sheets.some(o => o.revisionOf === sh.id) && sh.days.some(d => dates.includes(d.date)))
    .map(sh => sh.weekEnding);
}

/* ---------- the swap dialog ---------- */

// from: { date, dir } when logged from a timesheet day (date fixed), or null for a new swap from Records.
function openSwapDialog(id = null, from = null) {
  const s = id && swaps().find(x => x.id === id);
  if (s) sw.editing = JSON.parse(JSON.stringify(s));
  else {
    const dir = from?.dir || "off";
    const date = from?.date || isoLocal(new Date());
    sw.editing = { id: null, direction: dir, colleague: "", note: "", first: halfFor(date, dir), second: null, fixedDate: !!from };
  }
  renderSwapDialog();
  $("swapDialog").showModal();
}
// A half for a date: my rostered shift for "off"; for "on" the colleague's shift is picked.
function halfFor(date, dir, prev = {}) {
  if (dir === "off") { const r = rosterShiftOn(date); if (r) return { date, ...r }; }
  return { date, station: prev.station || "", from: prev.from || "", to: prev.to || "" };
}

function halfFields(key, h, dir, { fixedDate = false, optional = false } = {}) {
  const val = h && isTime(h.from) ? (!h.other && SHIFTS.some(x => x.start === h.from && x.finish === h.to) ? `shift:${h.from}` : "O") : "";
  const list = shiftsForStation(h?.station || "");
  const isN = s => toMin(s.start) > toMin(s.finish);
  const shiftSel = opt("", "Shift…", !val) +
    `<optgroup label="Day">${list.filter(s => !isN(s)).map(s => opt(`shift:${s.start}`, shiftLabel(s), val === `shift:${s.start}`)).join("")}</optgroup>` +
    `<optgroup label="Night">${list.filter(isN).map(s => opt(`shift:${s.start}`, shiftLabel(s), val === `shift:${s.start}`)).join("")}</optgroup>` +
    opt("O", "Other times", val === "O");
  const roster = dir === "off" && h?.date ? rosterShiftOn(h.date) : null;
  return `
    <div class="sw-half">
      <div class="grid-2">
        <div class="field"><label>Date${optional ? ` <span class="opt">optional</span>` : ""}</label>
          <input type="date" data-sw-date="${key}" value="${esc(h?.date || "")}" ${fixedDate ? "disabled" : ""}></div>
        <div class="field"><label>Station</label>
          <select data-sw-station="${key}" ${!h?.date ? "disabled" : ""}>${opt("", "Station…", !h?.station)}${STATIONS.map(x => opt(x, x, h?.station === x)).join("")}</select></div>
      </div>
      ${h?.date ? `
      <div class="field"><label>Shift</label><select data-sw-shift="${key}">${shiftSel}</select></div>
      ${val === "O" ? `<div class="grid-2">
        <div class="field"><label>From</label><select class="time-select" data-sw-from="${key}">${timeOptions(h.from)}</select></div>
        <div class="field"><label>To</label><select class="time-select" data-sw-to="${key}">${timeOptions(h.to)}</select></div></div>` : ""}
      ${dir === "off" ? `<p class="hint">${roster ? `Your rostered shift: ${esc(swapShiftText(roster))}.` : "No rostered shift found for this day — pick the shift you're giving away."}</p>` : ""}` : ""}
    </div>`;
}

function renderSwapDialog() {
  const e = sw.editing;
  const dir = e.direction, other = swapOpposite(dir);
  const colleagues = [...new Set(swaps().map(s => s.colleague).filter(Boolean))];
  $("swapDialog").innerHTML = `
    <form method="dialog" class="dialog sw-dialog">
      <h3>${e.id ? "Shift swap" : "Record a shift swap"}</h3>
      <div class="field">
        <span class="label">Direction</span>
        <div class="segmented">
          <label><input type="radio" name="swDir" value="off" ${dir === "off" ? "checked" : ""}> Swapped off <small>(I gave my shift away)</small></label>
          <label><input type="radio" name="swDir" value="on" ${dir === "on" ? "checked" : ""}> Swapped on <small>(I work their shift)</small></label>
        </div>
      </div>
      <div class="field">
        <label for="swColleague">Colleague</label>
        <input type="text" id="swColleague" list="swColleagues" value="${esc(e.colleague)}" placeholder="Name" autocomplete="off">
        <datalist id="swColleagues">${colleagues.map(c => `<option value="${esc(c)}">`).join("")}</datalist>
      </div>
      <h4 class="sw-h">${dir === "off" ? "The shift I'm giving away" : "Their shift I'm working"}</h4>
      ${halfFields("first", e.first, dir, { fixedDate: e.fixedDate })}
      <h4 class="sw-h">${other === "on" ? "When I work a shift back for them" : "When they work a shift for me"} <span class="opt">optional</span></h4>
      ${halfFields("second", e.second || { date: "" }, other, { optional: true })}
      <p class="hint">${e.second?.date ? "Both halves recorded — this swap is complete." : `Leave the date blank if it isn't known yet. Until then this shows as ${dir === "off" ? "<strong>I owe</strong>" : "<strong>Owed to me</strong>"} in Records → Swaps.`}</p>
      ${e.second?.date ? `<button type="button" class="link-btn" data-sw-clear-second>Remove this half</button>` : ""}
      <div class="field"><label for="swNote">Note <span class="opt">optional</span></label><input type="text" id="swNote" value="${esc(e.note || "")}"></div>
      <div class="actions">
        <button type="button" class="btn btn--primary" data-sw-save>Save swap</button>
        ${e.id ? `<button type="button" class="btn btn--danger-ghost" data-sw-delete>Delete</button>` : ""}
        <button type="button" class="btn btn--ghost" data-sw-cancel>Cancel</button>
      </div>
    </form>`;
}

function readSwapText() {
  sw.editing.colleague = $("swColleague").value.trim();
  sw.editing.note = $("swNote").value.trim();
}
function setHalfShift(key, value) {
  const h = sw.editing[key];
  if (value === "O") { if (!isTime(h.from)) { h.from = "07:00"; h.to = "19:00"; } h.other = true; }
  else if (value.startsWith("shift:")) { const s = SHIFTS.find(x => x.start === value.slice(6)); h.from = s.start; h.to = s.finish; h.other = false; }
  else { h.from = ""; h.to = ""; h.other = false; }
}

function saveSwap() {
  readSwapText();
  const e = sw.editing;
  if (!e.colleague) return toast("Add the colleague's name.", true);
  for (const [key, label] of [["first", "the first shift"], ["second", "the other shift"]]) {
    const h = e[key];
    if (key === "second" && !h?.date) continue;
    if (!h?.date) return toast(`Pick the date for ${label}.`, true);
    if (!isTime(h.from) || !isTime(h.to)) return toast(`Pick the shift for ${label}.`, true);
  }
  if (e.second?.date && e.second.date === e.first.date) return toast("The two halves can't be on the same day.", true);
  const now = new Date().toISOString();
  const clean = h => h?.date ? { date: h.date, station: h.station || "", from: h.from, to: h.to, ...(h.other ? { other: true } : {}) } : null;
  const rec = { id: e.id || newId(), direction: e.direction, colleague: e.colleague, note: e.note, first: clean(e.first), second: clean(e.second), updatedAt: now };
  const list = swaps();
  const old = list.find(x => x.id === rec.id);
  if (old) Object.assign(old, rec); else list.push({ ...rec, createdAt: now });
  syncAllSwaps();
  saveState();
  $("swapDialog").close();
  afterSwapChange();
  const pub = swapPublishedWeeks(rec);
  toast(pub.length ? `Swap saved. Week ending ${pub.map(displayDate).join(", ")} is already published — revise it to add the swap.`
    : `Swap saved${rec.second ? " — complete" : ` — ${rec.direction === "off" ? "you owe a shift" : "a shift is owed to you"}`}.`);
}

function deleteSwap(id) {
  if (!confirm("Delete this swap? Both halves come off your draft timesheets.")) return;
  state.swaps = swaps().filter(s => s.id !== id);
  syncAllSwaps();
  saveState();
  $("swapDialog").close();
  afterSwapChange();
  toast("Swap deleted.");
}

function afterSwapChange() {
  if (currentSheet()) renderTimesheet();
  if (!$("tab-library").hidden) renderRecords();
  updateRecordsBadge();
}

/* ---------- Records → Swaps ---------- */

function swapCard(s) {
  const dir = s.direction;
  const owe = dir === "off";
  return `
    <button type="button" class="card sw-item ${swapIsOpen(s) ? "" : "sw-item--done"}" data-sw-open="${esc(s.id)}">
      <span class="sw-item__top"><strong>${esc(s.colleague)}</strong><span class="chip2 ${swapIsOpen(s) ? (owe ? "chip-warn" : "chip-ok") : "chip-plain"}">${swapIsOpen(s) ? (owe ? "I owe" : "Owed to me") : "Complete"}</span></span>
      <span class="sw-item__row">${dir === "off" ? "Swapped off" : "Swapped on"} · ${swapDateText(s.first.date)} · ${esc(swapShiftText(s.first))}</span>
      ${s.second?.date ? `<span class="sw-item__row">${dir === "off" ? "Swapped on" : "Swapped off"} · ${swapDateText(s.second.date)} · ${esc(swapShiftText(s.second))}</span>`
        : `<span class="sw-item__row muted">${owe ? "Shift back to work: not set yet" : "Their shift for you: not set yet"}</span>`}
    </button>`;
}

function renderSwapsView() {
  const list = swaps().slice().sort((a, b) => (b.first?.date || "").localeCompare(a.first?.date || ""));
  const open = list.filter(swapIsOpen);
  const owe = open.filter(s => s.direction === "off"), owed = open.filter(s => s.direction === "on");
  const done = list.filter(s => !swapIsOpen(s));
  $("recSwaps").innerHTML = `
    <div class="actions"><button type="button" class="btn btn--primary" data-sw-new>＋ Record a swap</button></div>
    <h3 class="sub-h">I owe <span class="opt">${owe.length}</span></h3>
    ${owe.length ? owe.map(swapCard).join("") : `<p class="hint">No shifts owed to colleagues.</p>`}
    <h3 class="sub-h">Owed to me <span class="opt">${owed.length}</span></h3>
    ${owed.length ? owed.map(swapCard).join("") : `<p class="hint">No shifts owed to you.</p>`}
    <h3 class="sub-h">Completed</h3>
    ${done.length ? done.map(swapCard).join("") : `<p class="hint">Completed swaps are kept here as history.</p>`}`;
}

function renderRecords() {
  document.querySelectorAll("#recordsNav [data-rec]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.rec === sw.view)));
  $("recTimesheets").hidden = sw.view !== "timesheets";
  $("recForms").hidden = sw.view !== "forms";
  $("recSwaps").hidden = sw.view !== "swaps";
  if (sw.view === "timesheets") renderLibrary();
  else if (sw.view === "forms") { if (typeof renderForms === "function") renderForms(); }
  else renderSwapsView();
}

function updateRecordsBadge() {
  const n = swaps().filter(swapIsOpen).length;
  const tab = document.querySelector('.tab[data-tab="library"]');
  if (!tab) return;
  tab.innerHTML = `Records${n ? ` <span class="tab-badge" aria-label="${n} open swap${n === 1 ? "" : "s"}">${n}</span>` : ""}`;
}

/* ---------- wiring ---------- */

function initSwaps() {
  const dlg = $("swapDialog");
  document.addEventListener("click", e => {
    const t = e.target.closest("[data-sw-open],[data-sw-new],[data-sw-day],[data-rec]");
    if (!t) return;
    if (t.dataset.swOpen) openSwapDialog(t.dataset.swOpen);
    else if (t.dataset.swNew !== undefined) openSwapDialog();
    else if (t.dataset.swDay !== undefined) {
      const sheet = currentSheet(), i = Number(t.dataset.swDay), d = sheet?.days[i];
      if (!d) return;
      if (d.swap) openSwapDialog(d.swap.id);
      else openSwapDialog(null, { date: d.date, dir: t.dataset.swDir || (d.roster === "times" ? "off" : "on") });
    }
    else if (t.dataset.rec) {
      e.preventDefault();
      sw.view = t.dataset.rec;
      if ($("tab-library").hidden) showTab("library"); else renderRecords();
    }
  });
  dlg.addEventListener("change", e => {
    const t = e.target, ed = sw.editing;
    if (!ed) return;
    readSwapText();
    if (t.name === "swDir") {
      ed.direction = t.value;
      ed.first = halfFor(ed.first.date, ed.direction, ed.direction === "on" ? ed.first : {});
      if (ed.second?.date) ed.second = halfFor(ed.second.date, swapOpposite(ed.direction), ed.direction === "off" ? ed.second : {});
    } else if (t.dataset.swDate) {
      const key = t.dataset.swDate, dir = key === "first" ? ed.direction : swapOpposite(ed.direction);
      ed[key] = t.value ? halfFor(t.value, dir, ed[key] || {}) : null;
    } else if (t.dataset.swStation) {
      const h = ed[t.dataset.swStation]; h.station = t.value;
      if (h.from && !shiftsForStation(h.station).some(s => s.start === h.from) && SHIFTS.some(s => s.start === h.from && s.finish === h.to)) {
        const night = toMin(h.from) > toMin(h.to);
        const alt = shiftsForStation(h.station).find(s => (toMin(s.start) > toMin(s.finish)) === night);
        if (alt) { h.from = alt.start; h.to = alt.finish; }
      }
    } else if (t.dataset.swShift) setHalfShift(t.dataset.swShift, t.value);
    else if (t.dataset.swFrom) ed[t.dataset.swFrom].from = t.value;
    else if (t.dataset.swTo) ed[t.dataset.swTo].to = t.value;
    else return;
    renderSwapDialog();
  });
  dlg.addEventListener("click", e => {
    const t = e.target.closest("[data-sw-save],[data-sw-delete],[data-sw-cancel],[data-sw-clear-second]");
    if (!t) return;
    if (t.dataset.swSave !== undefined) saveSwap();
    else if (t.dataset.swDelete !== undefined) deleteSwap(sw.editing.id);
    else if (t.dataset.swCancel !== undefined) dlg.close();
    else if (t.dataset.swClearSecond !== undefined) { readSwapText(); sw.editing.second = null; renderSwapDialog(); }
  });
  updateRecordsBadge();
}

document.addEventListener("DOMContentLoaded", initSwaps);
