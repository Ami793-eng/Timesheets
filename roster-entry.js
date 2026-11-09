/* FiNASh Time — roster-entry.js
 * For non-rostered staff who get their shifts 1, 2, 4 or 8 weeks at a time instead of a fixed
 * rolling roster (My details → My roster → "Non-rostered (I enter my shifts)", then how often).
 *
 * The days entered are kept in state.profile.rosterDays: { "YYYY-MM-DD": { code, from, to, station } }
 * with code D (day), N (night), X (road), O (other times), R (rest) or L (leave already booked, e.g.
 * annual leave requested before the shifts were known: a fixed day, no station needed).
 * Non-rostered staff have no normal base, so every shift has its own station. rosterWeek() in app.js reads
 * them like a fixed roster line, so new timesheets fill in from them — and leave already requested
 * or put in through a form (leave periods) is applied on top as usual.
 */
"use strict";

const ENTERED_ROSTER = "entered";
const ENTRY_WEEK_CHOICES = [1, 2, 4, 8];
const entryWeeks = () => ENTRY_WEEK_CHOICES.includes(Number(state.profile.rosterWeeks)) ? Number(state.profile.rosterWeeks) : 4;
const weeksLabel = n => `${n} week${n === 1 ? "" : "s"}`;
const re = { start: "", draft: {}, then: null };     // the dialog's working copy

// The shifts a day can be, for its station: the station's allowed shifts (as when editing a timesheet
// day — e.g. Sligo any listed shift, NEOC 07:00 / 19:00), Road 07:00–19:00 at a road station, and Other times.
// Values: "R" rest, "shift:HH:MM" a listed shift, "X" road, "O" other times.
const isNight = s => toMin(s.start) > toMin(s.finish);
// Options HTML for the shift dropdown: times under Day / Night headings (kept short to fit a phone).
function shiftOptions(station, val) {
  const list = shiftsForStation(station);
  const group = (label, items) => items.length ? `<optgroup label="${label}">${items.map(s => opt(`shift:${s.start}`, shiftLabel(s), val === `shift:${s.start}`)).join("")}</optgroup>` : "";
  return opt("", "Shift…", !val) + opt("R", "Rest", val === "R") +
    group("Day", list.filter(s => !isNight(s))) + group("Night", list.filter(isNight)) +
    (!station || ROAD_STATIONS.includes(station) ? opt("X", "Road", val === "X") : "") +
    opt("O", "Other times", val === "O");
}
const draftValue = v => !v || !v.code ? "" : v.code === "D" || v.code === "N" ? `shift:${v.from}` : v.code;

function rosterDays() { state.profile.rosterDays = state.profile.rosterDays || {}; return state.profile.rosterDays; }
function isEnteredRoster() { return state.profile.rosterId === ENTERED_ROSTER; }
// The last date entered, or "".
function rosterEnteredTo() { return Object.keys(rosterDays()).sort().at(-1) || ""; }
// The roster week for an entered roster (same shape as a fixed roster week), or null if any day is missing.
function enteredRosterWeek(weekEndingIso) {
  const days = weekDates(weekEndingIso).map(d => rosterDays()[d]);
  if (days.some(x => !x)) return null;
  return {
    line: 0, entered: true,
    roster: { name: "My entered roster", station: "" },
    codes: days.map(x => x.code),
    stations: days.map(x => x.station || ""),
    shifts: days.map(x => x.code === "R" ? { label: "Rest Day" } : x.code === "L" ? { label: x.leave, leave: x.leave }
      : { label: x.code === "O" ? "Shift" : ROSTER_SHIFTS[x.code].label, start: x.from, finish: x.to })
  };
}
// Leave already booked as fixed days (requested before the shifts were known) — those days are leave, whatever comes.
function bookedLeaveOn(dateIso) {
  const p = leavePeriodOn(dateIso);
  return p && p.days ? p : null;
}

/* ---------- prompts ---------- */

// Shown on the Start a timesheet card: when the entered roster runs out (or has).
function rosterDueNotice() {
  if (!isEnteredRoster()) return "";
  const to = rosterEnteredTo();
  const today = isoLocal(new Date());
  const soon = new Date(); soon.setDate(soon.getDate() + 7);
  if (to && to >= isoLocal(soon)) return "";
  return `<div class="roster-due">
    <strong>${to ? (to < today ? `Your roster ran out on ${displayDate(to)}` : `Your roster runs out on ${displayDate(to)}`) : "Enter your roster"}</strong>
    <span class="muted">Add your next ${weeksLabel(entryWeeks())} of shifts and your timesheets fill in for you.</span>
    <button type="button" class="btn btn--small btn--primary" data-roster-entry>Enter next ${weeksLabel(entryWeeks())}</button>
  </div>`;
}

/* ---------- the dialog ---------- */

function nextEntryStart() {
  const to = rosterEnteredTo();
  if (!to) return mondayOf(isoLocal(new Date()));
  const d = parseIso(to); d.setDate(d.getDate() + 1);
  return mondayOf(isoLocal(d));
}

// then: a week-ending to start a timesheet for once the roster is saved (or skipped).
function openRosterEntry(startMonday = "", then = null) {
  re.start = mondayOf(startMonday || nextEntryStart());
  re.then = then;
  re.draft = {};
  for (const d of entryDates()) if (rosterDays()[d]) re.draft[d] = { ...rosterDays()[d] };
  markBookedLeave();
  renderRosterEntry();
  $("rosterDialog").showModal();
}
function entryDates() {
  return Array.from({ length: entryWeeks() * 7 }, (_, k) => { const d = parseIso(re.start); d.setDate(d.getDate() + k); return isoLocal(d); });
}

function renderRosterEntry() {
  const dates = entryDates();
  const weeks = Array.from({ length: entryWeeks() }, (_, w) => dates.slice(w * 7, w * 7 + 7));
  $("rosterDialog").innerHTML = `
    <form method="dialog" class="dialog roster-entry">
      <h3>My shifts — next ${weeksLabel(entryWeeks())}</h3>
      <div class="field">
        <label for="reStart">Starting Monday</label>
        <input type="date" id="reStart" value="${esc(re.start)}">
      </div>
      <p class="hint">Pick the station, then the shift — the list shows that station's shifts (choose <strong>Other times</strong> for anything else). This just builds your roster: you confirm what you actually worked on the timesheet. Leave you've already booked is filled in.</p>
      ${weeks.map((wk, w) => `
      <fieldset class="re-week">
        <legend>Week ${w + 1} · ${shortDate(wk[0])} – ${shortDate(wk[6])}</legend>
        <div class="re-all"><label>All shifts this week at</label><select data-re-allst="${w}">${opt("", "—", true)}${STATIONS.map(s => opt(s, s, false)).join("")}</select></div>
        ${wk.map((d, i) => {
          const v = re.draft[d] || { code: "" };
          if (v.code === "L") return `<div class="re-day re-day--leave"><span class="re-day__name">${DAYS[i].short} <small>${shortDate(d)}</small></span><span>${esc(v.leave)} <small class="muted">booked</small></span></div>`;
          const working = v.code && v.code !== "R";
          const val = draftValue(v);
          return `<div class="re-day">
            <span class="re-day__name">${DAYS[i].short} <small>${shortDate(d)}</small></span>
            <span class="re-day__pick">
              <select data-re-station="${d}" class="${working && !v.station ? "needs" : ""}" aria-label="${DAYS[i].name} ${displayDate(d)} station">${opt("", "Station…", !v.station)}${STATIONS.map(s => opt(s, s, v.station === s)).join("")}</select>
              <select data-re-shift="${d}" class="${v.code ? "" : "needs"}" aria-label="${DAYS[i].name} ${displayDate(d)} shift">${shiftOptions(v.station, val)}</select>
            </span>
            ${v.code === "O" ? `<span class="re-day__times">
              <select class="time-select" data-re-from="${d}" aria-label="From">${timeOptions(v.from)}</select>
              <select class="time-select" data-re-to="${d}" aria-label="To">${timeOptions(v.to)}</select></span>` : ""}
          </div>`;
        }).join("")}
        ${w ? `<button type="button" class="link-btn" data-re-copy="${w}">Same as week ${w}</button>` : ""}
      </fieldset>`).join("")}
      <p class="hint" id="reMissing"></p>
      <div class="actions">
        <button type="button" class="btn btn--primary" data-re-save>Save roster</button>
        ${re.then ? `<button type="button" class="btn" data-re-skip>Skip — fill in by hand</button>` : ""}
        <button type="button" class="btn btn--ghost" data-re-cancel>Cancel</button>
      </div>
    </form>`;
  updateMissing();
}
function updateMissing() {
  const missing = entryDates().filter(d => !re.draft[d]?.code).length;
  const noStation = entryDates().filter(d => { const v = re.draft[d]; return v && v.code && !["R", "L"].includes(v.code) && !v.station; }).length;
  $("reMissing").textContent = [missing ? `${missing} day${missing === 1 ? "" : "s"} still to set (days left blank aren't saved).` : "",
    noStation ? `${noStation} shift${noStation === 1 ? "" : "s"} still need a station.` : ""].filter(Boolean).join(" ");
}

// Set a day's station and/or shift. A shift the new station doesn't allow moves to that station's
// nearest one of the same kind (day / night); Road needs a road station.
function setDraft(d, { value, station } = {}) {
  const prev = re.draft[d] || { code: "" };
  if (station === undefined) station = prev.station || "";
  if (value === undefined) value = draftValue(prev);
  if (value.startsWith("shift:")) {
    const start = value.slice(6), allowed = shiftsForStation(station);
    if (!allowed.some(s => s.start === start)) {
      const was = SHIFTS.find(s => s.start === start);
      const alt = allowed.filter(s => isNight(s) === (was ? isNight(was) : false))
        .sort((a, b) => Math.abs(toMin(a.start) - toMin(start)) - Math.abs(toMin(b.start) - toMin(start)))[0];
      value = alt ? `shift:${alt.start}` : "";
    }
  }
  if (value === "X" && station && !ROAD_STATIONS.includes(station)) value = "";
  if (!value) { re.draft[d] = { code: "", station }; return; }
  if (value === "R") { re.draft[d] = { code: "R", station }; return; }
  if (value === "X") { re.draft[d] = { code: "X", station, from: "07:00", to: "19:00" }; return; }
  if (value === "O") { re.draft[d] = { code: "O", station, from: prev.code === "O" ? prev.from : "07:00", to: prev.code === "O" ? prev.to : "19:00" }; return; }
  const s = SHIFTS.find(x => x.start === value.slice(6));
  re.draft[d] = { code: isNight(s) ? "N" : "D", station, from: s.start, to: s.finish };
}
// Booked leave days are filled in and fixed.
function markBookedLeave() {
  for (const d of entryDates()) { const p = bookedLeaveOn(d); if (p) re.draft[d] = { code: "L", leave: p.type }; }
}

function saveRosterEntry() {
  const days = rosterDays();
  const dates = entryDates().filter(d => re.draft[d]?.code);
  if (!dates.length) return toast("Set at least one day.", true);
  const bad = dates.find(d => re.draft[d].code === "O" && !(isTime(re.draft[d].from) && isTime(re.draft[d].to)));
  if (bad) return toast(`Set the times for ${displayDate(bad)}.`, true);
  const noSt = dates.find(d => !["R", "L"].includes(re.draft[d].code) && !re.draft[d].station);
  if (noSt) return toast(`Pick the station for ${DAYS[dayIndex(noSt)].name} ${displayDate(noSt)}.`, true);
  for (const d of dates) { const v = { ...re.draft[d] }; if (v.code === "R") delete v.station; days[d] = v; }
  // Draft timesheets for these weeks that are still blank fill in now (leave on top).
  let filled = 0;
  for (const s of state.sheets.filter(s => s.status === "draft" && s.days.every(d => !d.roster && !d.done))) {
    if (applyRoster(s)) { applyLeavePeriods(s); filled++; }
  }
  saveState();
  $("rosterDialog").close();
  const then = re.then;
  re.then = null;
  if (typeof renderRosterSettings === "function" && !$("tab-profile").hidden) renderRosterSettings();
  if (then) startTimesheetFor(then);
  else { renderTimesheet(); updateWeekHint(); }
  toast(`Roster saved up to ${displayDate(rosterEnteredTo())}.${filled ? ` ${filled} blank timesheet${filled === 1 ? "" : "s"} filled in.` : ""}`);
}

function initRosterEntry() {
  const dlg = $("rosterDialog");
  document.addEventListener("click", e => {
    if (e.target.closest("[data-roster-entry]")) { e.preventDefault(); openRosterEntry(); }
  });
  dlg.addEventListener("change", e => {
    const t = e.target;
    if (t.id === "reStart") { if (t.value) { re.start = mondayOf(t.value); for (const d of entryDates()) if (!re.draft[d] && rosterDays()[d]) re.draft[d] = { ...rosterDays()[d] }; markBookedLeave(); renderRosterEntry(); } return; }
    if (t.dataset.reShift) { setDraft(t.dataset.reShift, { value: t.value }); renderRosterEntry(); return; }
    if (t.dataset.reStation) { setDraft(t.dataset.reStation, { station: t.value }); renderRosterEntry(); return; }
    if (t.dataset.reAllst !== undefined) {                             // every day of the week that isn't rest or booked leave
      const w = Number(t.dataset.reAllst);
      entryDates().slice(w * 7, w * 7 + 7).forEach(d => { if (!["R", "L"].includes(re.draft[d]?.code)) setDraft(d, { station: t.value }); });
      renderRosterEntry(); return;
    }
    if (t.dataset.reFrom) re.draft[t.dataset.reFrom].from = t.value;
    if (t.dataset.reTo) re.draft[t.dataset.reTo].to = t.value;
  });
  dlg.addEventListener("click", e => {
    const t = e.target.closest("[data-re-save],[data-re-skip],[data-re-cancel],[data-re-copy]");
    if (!t) return;
    if (t.dataset.reSave !== undefined) saveRosterEntry();
    else if (t.dataset.reSkip !== undefined) { const then = re.then; re.then = null; dlg.close(); startTimesheetFor(then, { skipRoster: true }); }
    else if (t.dataset.reCancel !== undefined) { re.then = null; dlg.close(); }
    else if (t.dataset.reCopy) {
      const w = Number(t.dataset.reCopy), dates = entryDates();
      for (let i = 0; i < 7; i++) {
        const to = dates[w * 7 + i], src = re.draft[dates[(w - 1) * 7 + i]];
        if (re.draft[to]?.code === "L") continue;                                    // booked leave stays
        if (src && src.code !== "L") re.draft[to] = { ...src }; else delete re.draft[to];
      }
      renderRosterEntry();
    }
  });
}

document.addEventListener("DOMContentLoaded", initRosterEntry);
