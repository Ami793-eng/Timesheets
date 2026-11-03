/* Timesheet Hub — leave.js
 * Leave tab: request annual (and other) leave by email, put it on the timesheets,
 * add it to the phone's calendar, and keep count of annual leave hours.
 *
 * A request is { id, type, from, to, shifts: [{ date, label, mins }], hours, note,
 *   status: "requested" | "approved" | "declined" | "cancelled", createdAt, sentAt, decidedAt }.
 * Sending a request saves it as a leave period (see setFormLeavePeriods in app.js), so every
 * rostered shift in its dates is marked as that leave on draft and future timesheets.
 */
"use strict";

const REQUEST_TYPES = ["Annual Leave", "Parental Leave", "Force Majeure", "Study Leave", "Examination Leave", "Interview Leave", "Marriage Leave"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const lx = { editing: null };   // the request being made in the editor

function leaveSettings() {
  state.profile.leave = { to: "", ccMe: true, entitlementH: "", carriedH: "", yearStart: 1, ...(state.profile.leave || {}) };
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
function rosteredShifts(fromIso, toIso) {
  return datesBetween(fromIso, toIso).map(date => {
    const sheet = state.sheets.find(s => s.status === "draft" && s.weekEnding === weekEndingOf(date));
    const d = sheet?.days.find(x => x.date === date);
    if (d && d.roster === "times") return { date, label: d.rosterLabel || "Shift", from: d.rosterFrom, to: d.rosterTo, mins: shiftMins(d.rosterFrom, d.rosterTo) };
    if (d && d.roster === "rest") return null;
    const rw = rosterWeek(weekEndingOf(date));
    if (!rw) return { date, label: "", mins: 0, unknown: true };
    const sh = ROSTER_SHIFTS[rw.codes[dayIndex(date)]];
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

// Annual leave hours in a leave year: booked through the app (taken / still to come), plus any
// annual leave on published timesheets that wasn't booked here.
function leaveTotals(year = leaveYear()) {
  const today = isoLocal(new Date());
  let taken = 0, upcoming = 0, requested = 0, other = 0;
  for (const r of state.leaveRequests || []) {
    if (r.type !== "Annual Leave" || !["requested", "approved"].includes(r.status)) continue;
    const scale = r.shifts.reduce((a, s) => a + s.mins, 0) ? (r.hours * 60) / r.shifts.reduce((a, s) => a + s.mins, 0) : 0;
    for (const s of r.shifts) {
      if (s.date < year.start || s.date > year.end) continue;
      const m = s.mins * scale;
      if (s.date < today) taken += m; else upcoming += m;
      if (r.status === "requested") requested += m;
    }
    if (!r.shifts.length && r.from >= year.start && r.from <= year.end) { const m = r.hours * 60; r.from < today ? taken += m : upcoming += m; if (r.status === "requested") requested += m; }
  }
  const counted = new Set();
  for (const s of state.sheets.filter(s => s.status === "published" && !state.sheets.some(o => o.revisionOf === s.id))) {
    for (const d of s.days) {
      if (d.date < year.start || d.date > year.end || counted.has(d.date)) continue;
      if (d.actual === "leave" && d.actualLeave === "Annual Leave" && !d.leaveSource) { other += shiftMins(d.rosterFrom, d.rosterTo); counted.add(d.date); }
    }
  }
  const set = leaveSettings();
  const entitlement = (Number(set.entitlementH) || 0) * 60 + (Number(set.carriedH) || 0) * 60;
  return { taken: taken + other, upcoming, requested, other, entitlement, left: entitlement - taken - upcoming - other };
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
    ${t.entitlement ? "" : `<p class="hint">Add your annual leave entitlement in <strong>Leave settings</strong> below to see how much is left.</p>`}`;

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

  $("lvTo").value = set.to || "";
  $("lvCcMe").checked = set.ccMe !== false;
  $("lvEnt").value = set.entitlementH || "";
  $("lvCarried").value = set.carriedH || "";
  $("lvYearStart").innerHTML = MONTHS.map((m, i) => opt(String(i + 1), m, Number(set.yearStart) === i + 1)).join("");
}

function openLeaveEditor() {
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  lx.editing = { type: "Annual Leave", from: isoLocal(tomorrow), to: isoLocal(tomorrow), note: "", hoursOverride: "" };
  renderLeaveEditor();
  $("leaveEditor").hidden = false;
  $("leaveEditor").scrollIntoView({ behavior: "smooth", block: "start" });
}

function draftRequest() {
  const e = lx.editing;
  const to = e.to < e.from ? e.from : e.to;
  const shifts = rosteredShifts(e.from, to);
  const mins = shifts.reduce((a, s) => a + s.mins, 0);
  const hours = e.hoursOverride !== "" && !isNaN(Number(e.hoursOverride)) ? Number(e.hoursOverride) : Math.round(mins / 6) / 10;
  return { type: e.type, from: e.from, to, shifts, hours, note: e.note.trim(), unknown: shifts.some(s => s.unknown) };
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
      ${r.shifts.length ? r.shifts.map(s => `<div><span>${longDate(s.date)}</span><span>${s.unknown ? `<em class="muted">no roster set</em>` : `${esc(s.label)} ${esc(s.from)}–${esc(s.to)} · ${fmtHours(s.mins)}`}</span></div>`).join("")
        : `<p class="hint">No rostered shifts in these dates — they're all rest days.</p>`}
    </div>
    <div class="field">
      <label for="lvHours">Hours of leave</label>
      <input type="number" id="lvHours" data-lv-f="hoursOverride" min="0" step="0.25" inputmode="decimal" value="${esc(e.hoursOverride !== "" ? e.hoursOverride : r.hours)}">
      <p class="hint">${r.unknown ? "Set your roster in My details to work this out, or enter the hours." : "Worked out from your roster — change it if needed."}</p>
    </div>
    <div class="field"><label for="lvNote">Note <span class="opt">optional</span></label><textarea id="lvNote" data-lv-f="note" rows="2" placeholder="e.g. Family holiday">${esc(e.note)}</textarea></div>
    ${overlap ? `<p class="hint warn-text">You already have ${esc(overlap.type)} booked ${displayDate(overlap.from)} – ${displayDate(overlap.to)}.</p>` : ""}
    <details class="email-preview-wrap"><summary>Email preview</summary><div class="email-preview">${emailPreview(r)}</div></details>
    ${set.to ? "" : `<p class="hint warn-text">Add the workforce planning email in <strong>Leave settings</strong> first.</p>`}
    <div class="actions">
      <button type="button" class="btn btn--primary" data-lv-send ${set.to && state.profile.name ? "" : "disabled"}>Email request</button>
    </div>
    <p class="hint">Opens your email app with the request filled in. Once you send it, the leave goes on your timesheets for those weeks.</p>`;
}

/* ---------- the email ---------- */

function requestEmail(r, cancel = false) {
  const p = state.profile;
  const when = r.from === r.to ? displayDate(r.from) : `${displayDate(r.from)} - ${displayDate(r.to)}`;
  const subject = `${p.name} ${r.type} ${when}${cancel ? " - CANCELLATION" : ""}`;
  const lines = r.shifts.length
    ? r.shifts.map(s => `${longDate(s.date)}${s.unknown ? "" : ` - ${s.label} ${s.from}-${s.to} (${fmtHours(s.mins)})`}`)
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
  const res = setFormLeavePeriods(rec.id, [{ type: rec.type, from: rec.from, to: rec.to }], "leave request", "request");
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
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Timesheet Hub//Leave//EN", "BEGIN:VEVENT",
    `UID:${r.id}@timesheet-hub`, `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${ymd(r.from)}`, `DTEND;VALUE=DATE:${ymd(isoLocal(end))}`,
    `SUMMARY:${r.type}${r.status === "requested" ? " (requested)" : ""}`,
    `DESCRIPTION:${fmtHours(r.hours * 60)} · ${r.shifts.length} shift${r.shifts.length === 1 ? "" : "s"}`,
    "TRANSP:TRANSPARENT", "END:VEVENT", "END:VCALENDAR"
  ].join("\r\n");
  return new File([text], `${r.type.replace(/\s+/g, "-")}-${r.from}.ics`, { type: "text/calendar" });
}

/* ---------- wiring ---------- */

function saveLeaveSettings() {
  const set = leaveSettings();
  set.to = $("lvTo").value.trim();
  set.ccMe = $("lvCcMe").checked;
  set.entitlementH = $("lvEnt").value.trim();
  set.carriedH = $("lvCarried").value.trim();
  set.yearStart = Number($("lvYearStart").value) || 1;
  saveState();
  renderLeave();
  if (lx.editing) renderLeaveEditor();
}

function initLeave() {
  $("leaveNew").addEventListener("click", openLeaveEditor);
  ["lvTo", "lvCcMe", "lvEnt", "lvCarried", "lvYearStart"].forEach(id => $(id).addEventListener("change", saveLeaveSettings));
  // Note and hours just update the request (re-drawing on blur would swallow a tap on "Email request").
  $("leaveEditor").addEventListener("input", e => {
    const f = e.target.dataset.lvF;
    if (lx.editing && (f === "note" || f === "hoursOverride")) lx.editing[f] = e.target.value;
  });
  $("leaveEditor").addEventListener("change", e => {
    const f = e.target.dataset.lvF;
    if (!f || !lx.editing || f === "note" || f === "hoursOverride") return;
    lx.editing[f] = e.target.value;
    if (f === "from" && lx.editing.to < lx.editing.from) lx.editing.to = lx.editing.from;
    if (f === "from" || f === "to") lx.editing.hoursOverride = "";
    renderLeaveEditor();
  });
  document.addEventListener("click", e => {
    const t = e.target.closest("[data-lv-close],[data-lv-send],[data-lv-status],[data-lv-ics],[data-lv-cancel],[data-lv-delete]");
    if (!t) return;
    const d = t.dataset;
    if (d.lvClose !== undefined) { lx.editing = null; $("leaveEditor").hidden = true; }
    else if (d.lvSend !== undefined) sendRequest();
    else if (d.lvStatus) setRequestStatus(d.lv, d.lvStatus);
    else if (d.lvIcs) { const r = state.leaveRequests.find(x => x.id === d.lvIcs); if (r) downloadFile(calendarFile(r)); }
    else if (d.lvCancel) cancelRequest(d.lvCancel);
    else if (d.lvDelete && confirm("Delete this request from the list?")) { state.leaveRequests = state.leaveRequests.filter(x => x.id !== d.lvDelete); saveState(); renderLeave(); }
  });
}

document.addEventListener("DOMContentLoaded", initLeave);
