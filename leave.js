/* FiNASh Time — leave.js
 * Leave tab: request annual (and other) leave by email, put it on the timesheets,
 * add it to the phone's calendar, and keep count of annual leave hours.
 *
 * A request is { id, type, from, to, shifts: [{ date, label, mins }], hours, note,
 *   status: "requested" | "approved" | "declined" | "cancelled", createdAt, sentAt, decidedAt }.
 * Sending a request saves it as a leave period (see setFormLeavePeriods in app.js), so every
 * rostered shift in its dates is marked as that leave on draft and future timesheets.
 *
 * Entitlement and structured leave follow NAS policy NASPO36 (Structured Leave & Entitlements):
 * leave year 1 April – 31 March; 179.4h annual leave (23 days; 187.2h for some pre-2007 staff)
 * plus 78h for the 10 bank holidays (the policy lists 9; St Brigid's Day was added in 2023); structured
 * blocks of two weeks in summer and one week each in autumn and spring, each applied for in its own
 * window. A block week is any 7 days in a row (Mon–Sun, Fri–Thu… the start day doesn't matter) where
 * every rostered shift is annual leave; summer's two weeks can be together or separate.
 */
"use strict";

const REQUEST_TYPES = ["Annual Leave", "Parental Leave", "Parent's Leave", "Force Majeure", "Study Leave", "Examination Leave", "Interview Leave", "Marriage Leave"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const lx = { editing: null };   // the request being made in the editor

// NASPO36 section 9.1 / 10.1. Months are 1-12; "next" means in the following calendar year of the leave year.
const STRUCTURED_BLOCKS = [
  { id: "summer", name: "Summer", weeks: 2, from: [4, 1], to: [9, 30], applyFrom: [1, 1], applyTo: [2, 28] },
  { id: "autumn", name: "Autumn", weeks: 1, from: [10, 1], to: [12, 31], applyFrom: [7, 1], applyTo: [8, 31] },
  { id: "spring", name: "Spring", weeks: 1, from: [1, 1], to: [3, 31], next: true, applyFrom: [10, 1], applyTo: [11, 30] }
];
const weeksText = n => `${n === 2 ? "two weeks" : n === 1 ? "one week" : `${n} weeks`}`;

function leaveSettings() {
  state.profile.leave = { to: "", ccMe: true, alH: "179.4", bhH: "78", carriedH: "", yearStart: 4, ...(state.profile.leave || {}) };
  if (state.profile.leave.bhH === "70.2") state.profile.leave.bhH = "78";      // old default: 9 bank holidays → 10
  return state.profile.leave;
}
const fmtHours = mins => `${Math.round(mins / 6) / 10}h`.replace(".0h", "h");

/* ---------- dates, roster and hours ---------- */

function datesBetween(fromIso, toIso) {
  const out = [];
  for (let d = parseIso(fromIso); isoLocal(d) <= toIso && out.length < 400; d.setDate(d.getDate() + 1)) out.push(isoLocal(d));
  return out;
}
const dayIndex = iso => (parseIso(iso).getDay() + 6) % 7;          // Monday = 0
const weekEndingOf = iso => isoLocal(nextSunday(parseIso(iso)));
const longDate = iso => `${DAYS[dayIndex(iso)].short} ${displayDate(iso)}`;

// The rostered shifts in a date range (from the roster in My details, or from a timesheet already made for that week).
// Non-rostered staff can book leave before they know their shifts: each day then counts as a fixed
// 12-hour leave day (no station needed), and stays leave whatever shifts come later.
const UNKNOWN_DAY_MINS = 12 * 60;

function rosteredShifts(fromIso, toIso) {
  const entered = typeof isEnteredRoster === "function" && isEnteredRoster();
  return datesBetween(fromIso, toIso).map(date => {
    const sheet = state.sheets.find(s => s.status === "draft" && s.weekEnding === weekEndingOf(date));
    const d = sheet?.days.find(x => x.date === date);
    if (d && d.roster === "times") return { date, label: d.rosterLabel || "Shift", from: d.rosterFrom, to: d.rosterTo, mins: shiftMins(d.rosterFrom, d.rosterTo) };
    if (d && d.roster === "rest") return null;
    if (entered) {
      const x = rosterDays()[date];
      if (!x) return { date, label: "Leave day", mins: UNKNOWN_DAY_MINS, unknown: true, fixed: true };
      if (x.code === "R" || x.code === "L") return null;
      return { date, label: x.code === "O" ? "Shift" : ROSTER_SHIFTS[x.code].label, from: x.from, to: x.to, mins: shiftMins(x.from, x.to) };
    }
    const rw = rosterWeek(weekEndingOf(date));
    if (!rw) return { date, label: "", mins: 0, unknown: true };
    const sh = rw.shifts[dayIndex(date)];
    if (!sh || !sh.start) return null;                              // rest day
    return { date, label: sh.label, from: sh.start, to: sh.finish, mins: shiftMins(sh.start, sh.finish) };
  }).filter(Boolean);
}

/* ---------- the leave year and the tracker ---------- */

function leaveYear(onIso = isoLocal(new Date())) {
  const m = Number(leaveSettings().yearStart) || 1;
  const d = parseIso(onIso);
  const y = d.getMonth() + 1 >= m ? d.getFullYear() : d.getFullYear() - 1;
  const start = isoLocal(new Date(y, m - 1, 1));
  const end = isoLocal(new Date(y + 1, m - 1, 0));
  return { start, end, label: m === 1 ? String(y) : `${y}/${String(y + 1).slice(2)}` };
}

// Every day of annual leave the app knows about: { date, mins, requested, other }.
// From requests made here (their hours spread over their shifts), plus annual leave on published
// timesheets that wasn't booked here.
function annualLeaveDays() {
  const out = [];
  for (const r of state.leaveRequests || []) {
    if (r.type !== "Annual Leave" || !["requested", "approved"].includes(r.status)) continue;
    const total = r.shifts.reduce((a, s) => a + s.mins, 0);
    if (!total) { out.push({ date: r.from, mins: r.hours * 60, requested: r.status === "requested" }); continue; }
    for (const s of r.shifts) out.push({ date: s.date, mins: s.mins * (r.hours * 60) / total, requested: r.status === "requested" });
  }
  const counted = new Set();
  for (const s of state.sheets.filter(s => s.status === "published" && !state.sheets.some(o => o.revisionOf === s.id))) {
    for (const d of s.days) {
      if (counted.has(d.date) || !(d.actual === "leave" && d.actualLeave === "Annual Leave" && !d.leaveSource)) continue;
      out.push({ date: d.date, mins: shiftMins(d.rosterFrom, d.rosterTo), other: true });
      counted.add(d.date);
    }
  }
  return out;
}
const alMinsBetween = (from, to) => annualLeaveDays().filter(e => e.date >= from && e.date <= to).reduce((a, e) => a + e.mins, 0);

// Annual leave hours in a leave year: taken, still to come, waiting for approval, and what's left.
function leaveTotals(year = leaveYear()) {
  const today = isoLocal(new Date());
  let taken = 0, upcoming = 0, requested = 0, other = 0;
  for (const e of annualLeaveDays()) {
    if (e.date < year.start || e.date > year.end) continue;
    if (e.date < today) taken += e.mins; else upcoming += e.mins;
    if (e.requested) requested += e.mins;
    if (e.other) other += e.mins;
  }
  const set = leaveSettings();
  const entitlement = ((Number(set.alH) || 0) + (Number(set.bhH) || 0) + (Number(set.carriedH) || 0)) * 60;
  return { taken, upcoming, requested, other, entitlement, left: entitlement - taken - upcoming };
}

/* ---------- structured leave blocks (NASPO36 section 9) ---------- */

// Whole weeks off starting in [from, to]: 7 days in a row, any start day, where every rostered shift is
// annual leave (and there's at least one). Counted without overlap, so two separate weeks count as two.
function weeksOff(from, to, alDates) {
  const shiftDay = new Map();
  const isShift = iso => { if (!shiftDay.has(iso)) shiftDay.set(iso, rosteredShifts(iso, iso).length > 0); return shiftDay.get(iso); };
  const dates = datesBetween(from, to);
  let weeks = 0;
  for (let i = 0; i < dates.length;) {
    const win = Array.from({ length: 7 }, (_, k) => { const d = parseIso(dates[i]); d.setDate(d.getDate() + k); return isoLocal(d); });
    if (win.some(d => alDates.has(d)) && win.every(d => alDates.has(d) || !isShift(d))) { weeks++; i += 7; } else i++;
  }
  return weeks;
}
const annualLeaveDates = () => new Set(annualLeaveDays().map(e => e.date));

// The three blocks of a leave year, with their dates, application window, weeks booked and status.
function structuredBlocks(year = leaveYear(), alDates = annualLeaveDates()) {
  const y = Number(year.start.slice(0, 4));
  const today = isoLocal(new Date());
  const at = (yy, [m, d]) => isoLocal(new Date(yy, m - 1, d));
  return STRUCTURED_BLOCKS.map(b => {
    const from = at(b.next ? y + 1 : y, b.from), to = at(b.next ? y + 1 : y, b.to);
    // Every application window falls in the calendar year the leave year starts (summer: Jan–Feb, before 1 April).
    const applyFrom = at(y, b.applyFrom), applyTo = at(y, b.applyTo);
    const mins = alMinsBetween(from, to);
    const got = weeksOff(from, to, alDates);
    const done = got >= b.weeks;
    const status = done ? "done" : today > to ? (mins ? "missed" : "norecord") : today >= applyFrom && today <= applyTo ? "apply" : today < applyFrom ? "soon" : "overdue";
    return { ...b, from, to, applyFrom, applyTo, mins, got, done, state: status, yearLabel: year.label };
  });
}
// The block to nudge about right now (application window open and not booked yet), if any.
// Summer is applied for in January–February, before its leave year starts, so look at next year too.
function blockReminder() {
  const now = leaveYear();
  const next = leaveYear(isoLocal(new Date(Number(now.end.slice(0, 4)), Number(now.end.slice(5, 7)), 1)));
  return [...structuredBlocks(now), ...structuredBlocks(next)].find(b => b.state === "apply") || null;
}
function updateLeaveDot() {
  const tab = document.querySelector('.tab[data-tab="leave"]');
  if (tab) tab.classList.toggle("tab--dot", !!blockReminder());
}

/* ---------- screens ---------- */

function renderLeave() {
  const set = leaveSettings();
  const y = leaveYear(), t = leaveTotals(y);
  const used = t.taken + t.upcoming;
  const pct = t.entitlement ? Math.min(100, Math.round((used / t.entitlement) * 100)) : 0;
  const pctTaken = t.entitlement ? Math.min(100, Math.round((t.taken / t.entitlement) * 100)) : 0;
  $("leaveSummary").innerHTML = `
    <div class="lv-year">Annual leave ${esc(y.label)} <span class="muted">${displayDate(y.start)} – ${displayDate(y.end)}</span></div>
    ${t.entitlement ? `
    <div class="lv-bar" role="img" aria-label="${fmtHours(used)} of ${fmtHours(t.entitlement)} booked or taken">
      <span class="lv-bar__taken" style="width:${pctTaken}%"></span><span class="lv-bar__booked" style="width:${Math.max(0, pct - pctTaken)}%"></span>
    </div>` : ""}
    <div class="lv-stats">
      ${t.entitlement ? `<div><strong>${fmtHours(t.entitlement)}</strong><span>entitlement</span></div>` : ""}
      <div><strong>${fmtHours(t.taken)}</strong><span>taken</span></div>
      <div><strong>${fmtHours(t.upcoming)}</strong><span>booked</span></div>
      ${t.entitlement ? `<div class="${t.left < 0 ? "warn-text" : ""}"><strong>${fmtHours(t.left)}</strong><span>left</span></div>` : ""}
    </div>
    ${t.requested ? `<p class="hint">${fmtHours(t.requested)} still waiting for approval.</p>` : ""}
    ${t.other ? `<p class="hint">Includes ${fmtHours(t.other)} of annual leave on published timesheets that wasn't booked here.</p>` : ""}
    ${t.entitlement ? "" : `<p class="hint">Add your annual leave entitlement in <strong>Leave settings</strong> below to see how much is left.</p>`}
    ${Number(set.carriedH) > 39 ? `<p class="hint warn-text">Carry-over is normally up to one week (39h), to be taken within 6 months of the new leave year (NASPO36 11.1–11.2).</p>` : ""}`;

  const rem = blockReminder();
  $("leaveReminder").hidden = !rem;
  $("leaveReminder").innerHTML = rem ? `
    <strong>Book your ${esc(rem.name.toLowerCase())} leave</strong>
    <p>Applications for ${esc(rem.name)} ${displayDate(rem.from)} – ${displayDate(rem.to)} are open until <strong>${displayDate(rem.applyTo)}</strong>. The block is ${weeksText(rem.weeks)} off${rem.got ? ` — you have ${weeksText(rem.got)} booked so far` : ""}.</p>
    <button type="button" class="btn btn--small btn--primary" data-lv-block="${esc(rem.id)}" data-lv-block-from="${esc(rem.from)}">Request ${esc(rem.name.toLowerCase())} leave</button>` : "";

  const blocks = structuredBlocks(y);
  const label = { done: ["Done", "chip-ok"], apply: ["Apply now", "chip-warn"], soon: ["Not yet", "chip-plain"], overdue: ["Overdue", "chip-bad"], missed: ["Short", "chip-bad"], norecord: ["No record", "chip-plain"] };
  $("leaveBlocks").innerHTML = `
    <div class="lv-blocks">${blocks.map(b => `
      <div class="lv-block lv-block--${b.state}">
        <div class="lv-block__top"><strong>${esc(b.name)}</strong><span class="chip2 ${label[b.state][1]}">${label[b.state][0]}</span></div>
        <div class="muted">${shortDate(b.from)} – ${shortDate(b.to)}</div>
        <div class="lv-block__bar"><span style="width:${Math.min(100, Math.round(b.got / b.weeks * 100))}%"></span></div>
        <div><strong>${Math.min(b.got, b.weeks)} of ${b.weeks}</strong> <span class="muted">week${b.weeks === 1 ? "" : "s"}${b.mins ? ` · ${fmtHours(b.mins)}` : ""}</span></div>
      </div>`).join("")}
    </div>
    <p class="hint">A block week is any 7 days in a row — Mon–Sun, Fri–Thu, any start day — with every rostered shift on annual leave. Summer needs two weeks, together or separate.</p>`;

  const list = (state.leaveRequests || []).slice().sort((a, b) => b.from.localeCompare(a.from));
  const today = isoLocal(new Date());
  $("leaveList").innerHTML = list.length ? list.map(r => {
    const live = ["requested", "approved"].includes(r.status);
    const status = { requested: ["Requested", "chip-warn"], approved: ["Approved", "chip-ok"], declined: ["Declined", "chip-bad"], cancelled: ["Cancelled", "chip-plain"] }[r.status];
    return `
    <article class="card lv-item ${live ? "" : "lv-item--off"}">
      <div class="lv-item__head">
        <div>
          <div class="eyebrow">${esc(r.type)} · ${fmtHours(r.hours * 60)}</div>
          <h3>${r.from === r.to ? longDate(r.from) : `${longDate(r.from)} – ${longDate(r.to)}`}</h3>
          <div class="muted">${r.shifts.length} shift${r.shifts.length === 1 ? "" : "s"}${r.sentAt ? ` · emailed ${esc(new Date(r.sentAt).toLocaleDateString("en-IE"))}` : ""}${r.to < today && live ? " · taken" : ""}</div>
        </div>
        <span class="chip2 ${status[1]}">${status[0]}</span>
      </div>
      ${r.note ? `<p class="lv-note">${esc(r.note)}</p>` : ""}
      <div class="form-item__actions">
        ${r.status === "requested" ? `<button class="btn btn--small btn--primary" data-lv-status="approved" data-lv="${esc(r.id)}">Mark approved</button>
          <button class="btn btn--small" data-lv-status="declined" data-lv="${esc(r.id)}">Declined</button>` : ""}
        ${live ? `<button class="btn btn--small" data-lv-ics="${esc(r.id)}">Add to calendar</button>` : ""}
        ${live && r.to >= today ? `<button class="btn btn--small btn--danger-ghost" data-lv-cancel="${esc(r.id)}">Cancel leave</button>` : ""}
        ${live ? "" : `<button class="btn btn--small btn--danger-ghost" data-lv-delete="${esc(r.id)}">Delete</button>`}
      </div>
    </article>`;
  }).join("") : `<p class="hint">Leave you request here is listed with its status.</p>`;

  updateLeaveDot();
  $("lvTo").value = set.to || "";
  $("lvCcMe").checked = set.ccMe !== false;
  $("lvAl").value = set.alH ?? "";
  $("lvBh").value = set.bhH ?? "";
  $("lvCarried").value = set.carriedH || "";
  $("lvYearStart").innerHTML = MONTHS.map((m, i) => opt(String(i + 1), m, Number(set.yearStart) === i + 1)).join("");
}

function openLeaveEditor(startIso = "") {
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const from = startIso && startIso > isoLocal(tomorrow) ? startIso : isoLocal(tomorrow);
  const end = parseIso(from); if (startIso) end.setDate(end.getDate() + 6);     // a block: suggest a week
  lx.editing = { type: "Annual Leave", from, to: isoLocal(end), note: "", hoursOverride: "" };
  renderLeaveEditor();
  $("leaveEditor").hidden = false;
  $("leaveEditor").scrollIntoView({ behavior: "smooth", block: "start" });
}

function draftRequest() {
  const e = lx.editing;
  const to = e.to < e.from ? e.from : e.to;
  const shifts = rosteredShifts(e.from, to).filter(s => !(s.fixed && e.skip?.includes(s.date)));
  const mins = shifts.reduce((a, s) => a + s.mins, 0);
  const hours = e.hoursOverride !== "" && !isNaN(Number(e.hoursOverride)) ? Number(e.hoursOverride) : Math.round(mins / 6) / 10;
  const fixed = shifts.some(s => s.fixed);
  return { type: e.type, from: e.from, to, shifts, hours, note: e.note.trim(), unknown: shifts.some(s => s.unknown && !s.fixed), fixed };
}

function renderLeaveEditor() {
  const e = lx.editing, r = draftRequest(), set = leaveSettings();
  const overlap = (state.leaveRequests || []).find(x => ["requested", "approved"].includes(x.status) && x.from <= r.to && x.to >= r.from);
  $("leaveEditor").innerHTML = `
    <div class="form-ed__head">
      <div><div class="eyebrow">New request</div><h2>Request leave</h2></div>
      <button type="button" class="btn btn--ghost btn--small" data-lv-close>Close</button>
    </div>
    <div class="field"><label for="lvType">Type of leave</label><select id="lvType" data-lv-f="type">${REQUEST_TYPES.map(t => opt(t, t, t === e.type)).join("")}</select></div>
    <div class="grid-2">
      <div class="field"><label for="lvFrom">From</label><input type="date" id="lvFrom" data-lv-f="from" value="${esc(e.from)}"></div>
      <div class="field"><label for="lvToDate">To</label><input type="date" id="lvToDate" data-lv-f="to" value="${esc(r.to)}" min="${esc(e.from)}"></div>
    </div>
    <div class="lv-shifts">
      ${(() => {
        const all = rosteredShifts(e.from, r.to);
        if (!all.length) return `<p class="hint">No rostered shifts in these dates — they're all rest days.</p>`;
        return all.map(s => s.fixed
          ? `<label class="lv-fixed"><input type="checkbox" data-lv-day="${s.date}" ${e.skip?.includes(s.date) ? "" : "checked"}> <span>${longDate(s.date)}</span><span>Leave day · ${fmtHours(s.mins)}</span></label>`
          : `<div><span>${longDate(s.date)}</span><span>${s.unknown ? `<em class="muted">no roster set</em>` : `${esc(s.label)} ${esc(s.from)}–${esc(s.to)} · ${fmtHours(s.mins)}`}</span></div>`).join("")
          + (all.some(s => s.fixed) ? `<p class="hint">Your shifts aren't entered for these days yet, so each day counts as a 12h leave day. Untick any day you don't want.</p>` : "");
      })()}
    </div>
    <div class="field">
      <label for="lvHours">Hours of leave</label>
      <input type="number" id="lvHours" data-lv-f="hoursOverride" min="0" step="0.25" inputmode="decimal" value="${esc(e.hoursOverride !== "" ? e.hoursOverride : r.hours)}">
      <p class="hint">${r.unknown ? "Set your roster in My details to work this out, or enter the hours." : "Worked out from your roster — change it if needed."}</p>
    </div>
    <div class="field"><label for="lvNote">Note <span class="opt">optional</span></label><textarea id="lvNote" data-lv-f="note" rows="2" placeholder="e.g. Family holiday">${esc(e.note)}</textarea></div>
    ${noticeHint(r)}
    ${blockHint(r)}
    ${overlap ? `<p class="hint warn-text">You already have ${esc(overlap.type)} booked ${displayDate(overlap.from)} – ${displayDate(overlap.to)}.</p>` : ""}
    <details class="email-preview-wrap"><summary>Email preview</summary><div class="email-preview">${emailPreview(r)}</div></details>
    ${set.to ? "" : `<p class="hint warn-text">Add the workforce planning email in <strong>Leave settings</strong> first.</p>`}
    <div class="actions">
      <button type="button" class="btn btn--primary" data-lv-send ${set.to && state.profile.name ? "" : "disabled"}>Email request</button>
    </div>
    <p class="hint">Opens your email app with the request filled in. Once you send it, the leave goes on your timesheets for those weeks.</p>`;
}

// NASPO36 10.2: single days two weeks ahead, 48 hours at the latest.
function noticeHint(r) {
  const days = Math.round((parseIso(r.from) - parseIso(isoLocal(new Date()))) / 864e5);
  if (days < 2) return `<p class="hint warn-text">Leave should be booked at least 48 hours ahead (NASPO36 10.2).</p>`;
  if (days < 14 && r.type === "Annual Leave") return `<p class="hint">Single days should normally be booked two weeks ahead; 48 hours is the minimum.</p>`;
  return "";
}
// Which structured block this annual leave counts towards, and where that leaves it.
function blockHint(r) {
  if (r.type !== "Annual Leave" || !r.shifts.length) return "";
  const withThis = annualLeaveDates();
  r.shifts.forEach(s => withThis.add(s.date));
  const b = structuredBlocks(leaveYear(r.from), withThis).find(x => r.from >= x.from && r.from <= x.to);
  if (!b) return "";
  const before = structuredBlocks(leaveYear(r.from)).find(x => x.id === b.id);
  if (b.got > before.got) return `<p class="hint">✓ A full week off — your <strong>${esc(b.name)} ${esc(b.yearLabel)}</strong> block will be ${Math.min(b.got, b.weeks)} of ${b.weeks} week${b.weeks === 1 ? "" : "s"}.</p>`;
  return `<p class="hint">Counts as annual leave in ${esc(b.name)} ${esc(b.yearLabel)}, but isn't a full block week (7 days in a row with every rostered shift on leave).</p>`;
}

/* ---------- the email ---------- */

function requestEmail(r, cancel = false) {
  const p = state.profile;
  const when = r.from === r.to ? displayDate(r.from) : `${displayDate(r.from)} - ${displayDate(r.to)}`;
  const subject = `${p.name} ${r.type} ${when}${cancel ? " - CANCELLATION" : ""}`;
  const lines = r.shifts.length
    ? r.shifts.map(s => `${longDate(s.date)}${s.fixed ? ` (${fmtHours(s.mins)})` : s.unknown ? "" : ` - ${s.label} ${s.from}-${s.to} (${fmtHours(s.mins)})`}`)
    : [`${displayDate(r.from)}${r.from === r.to ? "" : ` to ${displayDate(r.to)}`}`];
  const body = [
    "Hello",
    "",
    cancel ? `I would like to cancel my ${r.type} for the following:` : `I would like to request ${r.type} for the following:`,
    "",
    ...lines,
    "",
    `Total: ${fmtHours(r.hours * 60)}`,
    ...(r.note && !cancel ? ["", r.note] : []),
    "",
    "Kind Regards",
    p.name,
    ...(p.number ? [`Personnel No: ${p.number}`] : [])
  ].join("\n");
  const set = leaveSettings();
  const cc = set.ccMe !== false && p.meEmail ? p.meEmail : "";
  return { to: set.to, cc, subject, body };
}
function emailPreview(r) {
  const m = requestEmail(r);
  return `<div><strong>To:</strong> ${esc(m.to || "—")}${m.cc ? ` · <strong>CC:</strong> ${esc(m.cc)}` : ""}</div><div><strong>Subject:</strong> ${esc(m.subject)}</div><pre>${esc(m.body)}</pre>`;
}
function openMail(m) {
  const q = [m.cc ? `cc=${encodeURIComponent(m.cc)}` : "", `subject=${encodeURIComponent(m.subject)}`, `body=${encodeURIComponent(m.body)}`].filter(Boolean).join("&");
  location.href = `mailto:${m.to.split(/[;,\s]+/).filter(Boolean).map(encodeURIComponent).join(",")}?${q}`;
}

function sendRequest() {
  const r = draftRequest();
  if (!state.profile.name) return toast("Add your name in My details first.", true);
  if (!leaveSettings().to) return toast("Add the workforce planning email in Leave settings.", true);
  if (!(r.hours > 0)) return toast("Enter the hours of leave.", true);
  const rec = { id: newId(), ...r, status: "requested", createdAt: new Date().toISOString(), sentAt: new Date().toISOString() };
  delete rec.unknown;
  state.leaveRequests = [...(state.leaveRequests || []), rec];
  openMail(requestEmail(rec));
  const res = setFormLeavePeriods(rec.id, [{ type: rec.type, from: rec.from, to: rec.to, ...(rec.fixed ? { days: rec.shifts.map(s => s.date) } : {}) }], "leave request", "request");
  lx.editing = null;
  $("leaveEditor").hidden = true;
  renderLeave();
  toast(res.published.length
    ? `Request emailed. Week ending ${res.published.map(displayDate).join(", ")} is already published — revise it to add the leave.`
    : "Request emailed — it's on your timesheets. Mark it approved when it's confirmed.");
}

function setRequestStatus(id, status) {
  const r = (state.leaveRequests || []).find(x => x.id === id);
  if (!r) return;
  r.status = status;
  r.decidedAt = new Date().toISOString();
  if (status === "declined" || status === "cancelled") setFormLeavePeriods(r.id, [], "");
  else saveState();
  renderLeave();
}

function cancelRequest(id) {
  const r = (state.leaveRequests || []).find(x => x.id === id);
  if (!r || !confirm(`Cancel ${r.type} ${displayDate(r.from)}${r.from === r.to ? "" : ` – ${displayDate(r.to)}`}?\n\nYour email app opens with a cancellation to send, and the leave comes off your draft timesheets.`)) return;
  openMail(requestEmail(r, true));
  setRequestStatus(id, "cancelled");
}

/* ---------- calendar ---------- */

function calendarFile(r) {
  const ymd = iso => iso.replace(/-/g, "");
  const end = parseIso(r.to); end.setDate(end.getDate() + 1);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const text = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//FiNASh Time//Leave//EN", "BEGIN:VEVENT",
    `UID:${r.id}@timesheet-hub`, `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${ymd(r.from)}`, `DTEND;VALUE=DATE:${ymd(isoLocal(end))}`,
    `SUMMARY:${r.type}${r.status === "requested" ? " (requested)" : ""}`,
    `DESCRIPTION:${fmtHours(r.hours * 60)} · ${r.shifts.length} shift${r.shifts.length === 1 ? "" : "s"}`,
    "TRANSP:TRANSPARENT", "END:VEVENT", "END:VCALENDAR"
  ].join("\r\n");
  return new File([text], appFileName(r.from, r.type, "ics"), { type: "text/calendar" });
}

/* ---------- wiring ---------- */

function saveLeaveSettings() {
  const set = leaveSettings();
  set.to = $("lvTo").value.trim();
  set.ccMe = $("lvCcMe").checked;
  set.alH = $("lvAl").value.trim();
  set.bhH = $("lvBh").value.trim();
  set.carriedH = $("lvCarried").value.trim();
  set.yearStart = Number($("lvYearStart").value) || 1;
  saveState();
  renderLeave();
  if (lx.editing) renderLeaveEditor();
}

function initLeave() {
  $("leaveNew").addEventListener("click", () => openLeaveEditor());
  updateLeaveDot();
  ["lvTo", "lvCcMe", "lvAl", "lvBh", "lvCarried", "lvYearStart"].forEach(id => $(id).addEventListener("change", saveLeaveSettings));
  // Note and hours just update the request (re-drawing on blur would swallow a tap on "Email request").
  $("leaveEditor").addEventListener("input", e => {
    const f = e.target.dataset.lvF;
    if (lx.editing && (f === "note" || f === "hoursOverride")) lx.editing[f] = e.target.value;
  });
  $("leaveEditor").addEventListener("change", e => {
    if (e.target.dataset.lvDay && lx.editing) {                     // tick / untick a fixed leave day
      const d = e.target.dataset.lvDay, skip = new Set(lx.editing.skip || []);
      e.target.checked ? skip.delete(d) : skip.add(d);
      lx.editing.skip = [...skip]; lx.editing.hoursOverride = "";
      return renderLeaveEditor();
    }
    const f = e.target.dataset.lvF;
    if (!f || !lx.editing || f === "note" || f === "hoursOverride") return;
    lx.editing[f] = e.target.value;
    if (f === "from" && lx.editing.to < lx.editing.from) lx.editing.to = lx.editing.from;
    if (f === "from" || f === "to") lx.editing.hoursOverride = "";
    renderLeaveEditor();
  });
  document.addEventListener("click", e => {
    const t = e.target.closest("[data-lv-close],[data-lv-send],[data-lv-status],[data-lv-ics],[data-lv-cancel],[data-lv-delete],[data-lv-block]");
    if (!t) return;
    const d = t.dataset;
    if (d.lvBlock) openLeaveEditor(d.lvBlockFrom);
    else if (d.lvClose !== undefined) { lx.editing = null; $("leaveEditor").hidden = true; }
    else if (d.lvSend !== undefined) sendRequest();
    else if (d.lvStatus) setRequestStatus(d.lv, d.lvStatus);
    else if (d.lvIcs) { const r = state.leaveRequests.find(x => x.id === d.lvIcs); if (r) downloadFile(calendarFile(r)); }
    else if (d.lvCancel) cancelRequest(d.lvCancel);
    else if (d.lvDelete && confirm("Delete this request from the list?")) { state.leaveRequests = state.leaveRequests.filter(x => x.id !== d.lvDelete); saveState(); renderLeave(); }
  });
}

document.addEventListener("DOMContentLoaded", initLeave);
