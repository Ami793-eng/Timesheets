/* Timesheet Hub — roster-entry.js
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

// Day / night times follow the station's usual starts (e.g. 08:00 / 20:00 at Manorhamilton), else 07:00 / 19:00.
function enteredShiftTimes(station = "") {
  const starts = STATION_SHIFTS[station] || ["07:00", "19:00"];
  const plus12 = t => { const [h, m] = t.split(":").map(Number); return `${String((h + 12) % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`; };
  return { D: [starts[0], plus12(starts[0])], N: [starts[1] || "19:00", plus12(starts[1] || "19:00")], X: ["07:00", "19:00"] };
}
const ENTRY_CODES = [["R", "Rest"], ["D", "Day"], ["N", "Night"], ["X", "Road"], ["O", "Other times"]];

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
      <p class="hint">Pick the shift and the station for each day. Day and Night follow the station's usual times (07:00 / 19:00, or 08:00 / 20:00 at Manorhamilton and Carrick on Shannon); choose <strong>Other times</strong> for anything else. Leave you've already booked is filled in.</p>
      ${weeks.map((wk, w) => `
      <fieldset class="re-week">
        <legend>Week ${w + 1} · ${shortDate(wk[0])} – ${shortDate(wk[6])}</legend>
        <div class="re-all"><label>All shifts this week at</label><select data-re-allst="${w}">${opt("", "—", true)}${STATIONS.map(s => opt(s, s, false)).join("")}</select></div>
        ${wk.map((d, i) => {
          const v = re.draft[d] || { code: "" };
          if (v.code === "L") return `<div class="re-day re-day--leave"><span class="re-day__name">${DAYS[i].short} <small>${shortDate(d)}</small></span><span>${esc(v.leave)} <small class="muted">booked</small></span></div>`;
          const working = v.code && v.code !== "R";
          const stations = v.code === "X" ? ROAD_STATIONS : STATIONS;
          return `<div class="re-day">
            <span class="re-day__name">${DAYS[i].short} <small>${shortDate(d)}</small></span>
            <span class="re-day__pick">
              <select data-re-code="${d}" class="${v.code ? "" : "needs"}" aria-label="${DAYS[i].name} ${displayDate(d)} shift">${opt("", "—", !v.code)}${ENTRY_CODES.map(([c, l]) => opt(c, l, v.code === c)).join("")}</select>
              ${working ? `<select data-re-station="${d}" class="${v.station ? "" : "needs"}" aria-label="Station">${opt("", "Station…", !v.station)}${stations.map(s => opt(s, s, v.station === s)).join("")}</select>` : ""}
            </span>
            ${v.code === "O" ? `<span class="re-day__times">
              <select class="time-select" data-re-from="${d}" aria-label="From">${timeOptions(v.from)}</select>
              <select class="time-select" data-re-to="${d}" aria-label="To">${timeOptions(v.to)}</select></span>`
              : working && v.from ? `<span class="re-day__times muted">${esc(v.from)}–${esc(v.to)}</span>` : ""}
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
  const noStation = entryDates().filter(d => { const v = re.draft[d]; return v && !["R", "L"].includes(v.code) && !v.station; }).length;
  $("reMissing").textContent = [missing ? `${missing} day${missing === 1 ? "" : "s"} still to set (days left blank aren't saved).` : "",
    noStation ? `${noStation} shift${noStation === 1 ? "" : "s"} still need a station.` : ""].filter(Boolean).join(" ");
}

function setDraftCode(d, code, station) {
  if (!code) { delete re.draft[d]; return; }
  const prev = re.draft[d] || {};
  if (station === undefined) station = prev.station || "";
  if (code === "X" && !ROAD_STATIONS.includes(station)) station = "";
  const times = enteredShiftTimes(station);
  re.draft[d] = code === "R" ? { code }
    : code === "O" ? { code, station, from: prev.code === "O" ? prev.from : times.D[0], to: prev.code === "O" ? prev.to : times.D[1] }
    : { code, station, from: times[code][0], to: times[code][1] };
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
  for (const d of dates) days[d] = { ...re.draft[d] };
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
    if (t.dataset.reCode !== undefined) { setDraftCode(t.dataset.reCode, t.value); renderRosterEntry(); return; }
    if (t.dataset.reStation) { const d = t.dataset.reStation; setDraftCode(d, re.draft[d].code, t.value); renderRosterEntry(); return; }
    if (t.dataset.reAllst !== undefined) {
      const w = Number(t.dataset.reAllst);
      entryDates().slice(w * 7, w * 7 + 7).forEach(d => { const v = re.draft[d]; if (v && !["R", "L"].includes(v.code)) setDraftCode(d, v.code, v.code === "X" && !ROAD_STATIONS.includes(t.value) ? v.station : t.value); });
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
