/* Timesheet Hub — forms.js
 * Fill official (fillable) PDF forms such as the HSE HR 108 series.
 * The user adds the PDF once; it is kept on this device (IndexedDB).
 * The app reads the form's boxes, pre-fills what it knows (name, staff
 * number, grade, base…), adds the signature, and makes a filled PDF.
 * Uses pdf-lib (lib/pdf-lib.min.js, loaded on demand).
 */
"use strict";

// The form setups (FORM_PROFILES) and the list of other HSE forms live in form-profiles.js.

const fx = { open: null, file: null, fields: [], values: {}, recordId: null, groups: {} };

function findProfile(names, title = "") {
  return FORM_PROFILES.find(p => p.match(new Set(names), title)) || null;
}
const profileById = id => FORM_PROFILES.find(p => p.id === id) || null;
const profileName = p => `${p.code} ${p.title}`;

/* ---------- built-in forms (bundled blank PDFs in /forms) ---------- */

const builtinCache = new Map();
// A form template: a built-in form ("builtin:hr108p") or one the user added (IndexedDB).
async function getTemplate(id) {
  if (!String(id).startsWith("builtin:")) return idbGet(id);
  const p = profileById(id.slice(8));
  if (!p?.file) return null;
  if (!builtinCache.has(id)) {
    const res = await fetch(p.file);
    if (!res.ok) throw new Error(`Couldn't load ${p.file} (${res.status}).`);
    builtinCache.set(id, await res.arrayBuffer());
  }
  return { id, name: profileName(p), bytes: builtinCache.get(id), profile: p.id, builtin: true };
}

/* ---------- storage: blank PDFs in IndexedDB ---------- */

function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("timesheetHubForms", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("templates", { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbAll() {
  const db = await idb();
  return new Promise((res, rej) => { const r = db.transaction("templates").objectStore("templates").getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error); });
}
async function idbGet(id) {
  const db = await idb();
  return new Promise((res, rej) => { const r = db.transaction("templates").objectStore("templates").get(id); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
async function idbPut(rec) {
  const db = await idb();
  return new Promise((res, rej) => { const t = db.transaction("templates", "readwrite"); t.objectStore("templates").put(rec); t.oncomplete = res; t.onerror = () => rej(t.error); });
}
async function idbDel(id) {
  const db = await idb();
  return new Promise((res, rej) => { const t = db.transaction("templates", "readwrite"); t.objectStore("templates").delete(id); t.oncomplete = res; t.onerror = () => rej(t.error); });
}

function loadPdfLib() {
  if (window.PDFLib) return Promise.resolve(window.PDFLib);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "lib/pdf-lib.min.js?v=1.17.1";
    s.onload = () => resolve(window.PDFLib);
    s.onerror = () => reject(new Error("The PDF form library didn't load."));
    document.head.appendChild(s);
  });
}

/* ---------- reading a form's boxes ---------- */

// Fields that belong to the manager / HR — left blank for them.
const OTHERS_RE = /manager|line\s*man|supervisor|approv|authori[sz]|\bhr\b|human resources|office use|for official|witness|head of|director|signed on behalf|recommend|countersign/i;
const SIGN_RE = /sign/i;

async function readFields(bytes, profileId = null) {
  const { PDFDocument, PDFName, PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup, PDFOptionList, PDFSignature } = await loadPdfLib();
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  // Which page each widget sits on (many forms don't record it on the widget itself).
  const pageOfAnnot = new Map();
  pages.forEach((pg, i) => { try { pg.node.Annots()?.asArray().forEach(ref => pageOfAnnot.set(ref.toString(), i)); } catch { /* no annots */ } });
  const fields = [];
  for (const f of doc.getForm().getFields()) {
    const name = f.getName();
    let tip = "";
    try { const tu = f.acroField.dict.get(PDFName.of("TU")); if (tu) tip = (tu.decodeText ? tu.decodeText() : String(tu)).trim(); } catch { /* no tooltip */ }
    const label = (tip || name.replace(/[_.]+/g, " ")).replace(/\s+/g, " ").trim();
    let type = "text", options = [];
    if (f instanceof PDFCheckBox) type = "check";
    else if (f instanceof PDFDropdown) { type = "choice"; options = f.getOptions(); }
    else if (f instanceof PDFOptionList) { type = "choice"; options = f.getOptions(); }
    else if (f instanceof PDFRadioGroup) { type = "choice"; options = f.getOptions(); }
    else if (f instanceof PDFSignature) type = "signature";
    else if (!(f instanceof PDFTextField)) continue;
    // Position (page, top→bottom, left→right) so boxes are listed in reading order.
    let page = 0, x = 0, y = 0, w = 0, h = 0;
    const widget = f.acroField.getWidgets()[0];
    if (widget) {
      const r = widget.getRectangle();
      x = r.x; y = r.y; w = r.width; h = r.height;
      const wref = doc.context.getObjectRef(widget.dict);
      if (wref && pageOfAnnot.has(wref.toString())) page = pageOfAnnot.get(wref.toString());
      else { const pref = widget.P && widget.P(); if (pref) page = Math.max(0, pages.findIndex(pg => pg.ref === pref)); }
    }
    const others = OTHERS_RE.test(label) || OTHERS_RE.test(name);
    let maxLen = 0, comb = false;
    if (f instanceof PDFTextField) { try { maxLen = f.getMaxLength() || 0; comb = f.isCombed(); } catch { /* ignore */ } }
    if (type === "text" && SIGN_RE.test(label + " " + name) && !/date/i.test(label)) type = "signature";
    fields.push({ name, label, type, options, page, x, y, w, h, others, maxLen, comb, readOnly: f.isReadOnly && f.isReadOnly() });
  }
  const profile = (profileId && profileById(profileId)) || findProfile(fields.map(f => f.name), doc.getTitle() || "");
  if (profile) {
    for (const f of fields) {
      const o = profile.fields[f.name];
      if (!o) continue;
      if (o.hide) { f.hidden = true; continue; }
      if (o.label) f.label = o.label;
      if (o.others !== undefined) f.others = o.others;
      if (o.type) f.type = o.type;
      if (o.fill) f.fill = o.fill;
      if (o.date) f.date = true;
      if (o.long) f.long = true;
      if (o.group) f.group = o.group;
      if (o.options) f.optionLabels = o.options;
      f.noGuess = true;                              // profile decides; no guessing
    }
    // One value spread over several boxes (e.g. a date written one digit per square).
    for (const c of profile.combos || []) {
      const parts = c.parts.map(n => fields.find(f => f.name === n)).filter(Boolean);
      if (!parts.length) continue;
      parts.forEach(p => { p.hidden = true; });
      const first = parts[0];
      fields.push({ name: `__combo:${c.id}`, label: c.label, type: "text", options: [], combo: c.parts, fill: c.fill, date: !!c.date,
        others: !!c.others, group: c.group, noGuess: true, page: first.page, x: first.x, y: first.y, w: 0, h: first.h });
    }
    (profile.signatures || []).forEach((sg, k) => fields.push({ name: `__sig${k}`, label: sg.label, type: "signature", synthetic: true, options: [], page: sg.page, x: sg.x, y: sg.y, w: sg.w, h: sg.h, others: false, group: sg.group }));
  }
  const shown = fields.filter(f => !f.hidden);
  // Reading order: page, then line (boxes within 4pt count as one line), then left to right.
  shown.sort((a, b) => a.page - b.page || (Math.abs(b.y - a.y) > 4 ? b.y - a.y : a.x - b.x));
  return { fields: shown, pageCount: pages.length, profile: profile ? { id: profile.id, title: profileName(profile), groups: profile.groups || {} } : null };
}

/* ---------- pre-filling from My details ---------- */

// What a box should be pre-filled with: a key (surname, number, today…) or null.
function guessKey(field) {
  if (field.others || field.type !== "text") return null;
  if (field.fill) return field.fill;
  if (field.noGuess) return null;
  const l = ` ${(field.label + " " + field.name).toLowerCase().replace(/[^a-z]+/g, " ")} `;
  const lbl = ` ${field.label.toLowerCase().replace(/[^a-z]+/g, " ").trim()} `;
  if (/ (surname|last name|family name) /.test(l)) return "surname";
  if (/ (first name|forename|christian name|given name) /.test(l)) return "first";
  if (/ (personnel|payroll|staff no|staff number|employee no|employee number|pers no|employee id|staff id) /.test(l)) return "number";
  if (/ pps /.test(l)) return "pps";
  if (/ name /.test(l) && !/ (course|college|institution|child|children|spouse|partner|exam|company|organisation|organization|employer|interview|body|university|school|next of kin|deceased) /.test(l)) return "name";
  if (/ (grade|job title|position|post title|title of post) /.test(l)) return "grade";
  if (/ (department|dept|unit|service area|division|section) /.test(l)) return "dept";
  if (/ (location|base|station|work place|workplace|place of work|hospital) /.test(l)) return "base";
  if (/ (e mail|email) /.test(l)) return "email";
  if (/ (phone|mobile|telephone|tel|contact no|contact number) /.test(l)) return "phone";
  if (/^ (date|todays date|today s date|date signed|date of application|signature date|date of request|employee date) $/.test(lbl)) return "today";
  return null;
}

function valueFor(key) {
  const p = state.profile;
  const [first, ...rest] = String(p.name || "").trim().split(/\s+/);
  const pps = String(p.pps || "").replace(/\s+/g, "").toUpperCase();
  return {
    surname: rest.join(" "), first, name: p.name, number: p.number, grade: p.grade, dept: p.dept,
    base: profileBase(), email: p.meEmail, phone: p.phone, today: displayDate(isoLocal(new Date())),
    pps, ppsMain: pps.slice(0, 7), ppsExtra: pps.slice(7, 9)
  }[key] || null;
}

/* ---------- making the filled PDF ---------- */

// Fit a value into a box with a character limit (e.g. 8 one-character date squares).
function fitText(v, maxLen) {
  v = String(v ?? "");
  if (!maxLen || v.length <= maxLen) return { text: v, ok: true };
  const m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/.exec(v.trim());
  if (m) {
    const dd = m[1].padStart(2, "0"), mm = m[2].padStart(2, "0"), yyyy = m[3].length === 2 ? "20" + m[3] : m[3];
    if (maxLen >= 8) return { text: dd + mm + yyyy, ok: true };
    if (maxLen >= 6) return { text: dd + mm + yyyy.slice(2), ok: true };
  }
  const squeezed = v.replace(/[\s\-\/.]/g, "");
  if (squeezed.length <= maxLen) return { text: squeezed, ok: true };
  return { text: squeezed.slice(0, maxLen), ok: false };
}

// Standard PDF fonts can't draw some characters; swap them for safe ones.
function pdfSafe(t) {
  return String(t ?? "").replace(/[–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, "...").replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "");
}

async function buildFilledPdf(template, values, fields) {
  const { PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup, PDFOptionList, StandardFonts, rgb, PDFName, PDFNumber } = await loadPdfLib();
  const doc = await PDFDocument.load(template.bytes, { ignoreEncryption: true });
  const form = doc.getForm();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  const tooLong = [];
  for (const fd of fields) {
    if (!groupOn(values, fd)) continue;              // optional section not ticked: leave it blank
    const v = values[fd.name];
    if (fd.combo) { fillCombo(form, fd, v, tooLong); continue; }
    let f; try { f = form.getField(fd.name); } catch { continue; }
    try {
      if (fd.type === "signature") continue;
      if (f instanceof PDFTextField) {
        if (v != null && v !== "") {
          const fit = fitText(pdfSafe(v), f.getMaxLength());
          if (!fit.ok) tooLong.push(`${fd.label}: "${v}" (max ${f.getMaxLength()} characters)`);
          f.setText(fit.text);
          tameAutoSize(f);
        }
      }
      else if (f instanceof PDFCheckBox) { v ? f.check() : f.uncheck(); }
      else if ((f instanceof PDFDropdown || f instanceof PDFOptionList || f instanceof PDFRadioGroup) && v) f.select(v);
    } catch (err) { console.warn("Skipped field", fd.name, err); }
  }
  try { form.updateFieldAppearances(font); } catch (err) { console.warn(err); }
  // Employee signature: drawn into the employee's signature box(es); manager boxes are left blank.
  const sig = state.profile.signatureImage;
  if (sig) {
    const png = await doc.embedPng(sig);
    for (const fd of fields.filter(f => f.type === "signature" && !f.others && fd_isOn(values, f) && groupOn(values, f))) {
      const page = pages[fd.page] || pages[0];
      const scale = Math.min((fd.w - 4) / png.width, (fd.h - 2) / png.height);
      const w = png.width * scale, h = png.height * scale;
      // The empty signature box would be drawn on top of the image, so remove it and keep its outline.
      if (!fd.synthetic) try {
        const fld = form.getField(fd.name);
        fld.acroField.getWidgets().forEach(w => w.dict.set(PDFName.of("F"), PDFNumber.of(2)));   // 2 = hidden
        if (fld.enableReadOnly) fld.enableReadOnly();
      } catch { /* leave as is */ }
      if (!fd.synthetic) page.drawRectangle({ x: fd.x, y: fd.y, width: fd.w, height: fd.h, borderColor: rgb(0, 0, 0), borderWidth: 1 });
      page.drawImage(png, { x: fd.x + 2, y: fd.y + (fd.h - h) / 2, width: w, height: h });
    }
  }
  if (tooLong.length) alert("These didn't fit their boxes and were shortened — please check:\n\n• " + tooLong.join("\n• "));
  const out = await doc.save();
  const base = (template.name || "Form").replace(/\.pdf$/i, "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "");
  const who = String(state.profile.name || "").replace(/[^a-zA-Z0-9]+/g, "");
  return new File([out], `${base}_${who}_${isoLocal(new Date())}.pdf`, { type: "application/pdf" });
}
function fd_isOn(values, fd) { return values[`__sign:${fd.name}`] !== false; }
// Boxes set to "auto" text size fill their whole height, which looks shouted on tall boxes.
// Give them a normal size instead (fixed-size boxes are left as the form has them).
function tameAutoSize(f) {
  try {
    const da = f.acroField.getDefaultAppearance() || "";
    const m = /([\d.]+)\s+Tf/.exec(da);
    if (m && Number(m[1]) > 0) return;
    const h = f.acroField.getWidgets()[0]?.getRectangle().height || 20;
    f.setFontSize(Math.max(7, Math.min(11, Math.round(h * 0.55))));
  } catch { /* leave as is */ }
}

// Optional sections (e.g. a postponement page) are only written when ticked.
function groupOn(values, fd) { return !fd.group || values[`__group:${fd.group}`] === true; }

// Spread one value over several boxes: a date becomes ddmmyyyy, then each box takes
// as many characters as it holds (1 if it has no limit); the last box takes the rest.
function fillCombo(form, fd, v, tooLong) {
  let text = pdfSafe(v ?? "").trim();
  if (!text) return;
  const d = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/.exec(text);
  if (fd.date && d) text = d[1].padStart(2, "0") + d[2].padStart(2, "0") + (d[3].length === 2 ? "20" + d[3] : d[3]);
  else text = text.replace(/\s+/g, "");
  const boxes = fd.combo.map(n => { try { return form.getTextField(n); } catch { return null; } }).filter(Boolean);
  let rest = text;
  boxes.forEach((b, i) => {
    const max = b.getMaxLength() || 0;
    const take = i === boxes.length - 1 ? rest.length : (max || 1);
    let chunk = rest.slice(0, take);
    rest = rest.slice(take);
    if (max && chunk.length > max) { tooLong.push(`${fd.label}: "${v}" doesn't fit the boxes`); chunk = chunk.slice(0, max); }
    try {
      // A box holding several squares (e.g. 7 of a date's 8) spreads its characters one per square.
      if (max > 1 && !b.isCombed()) b.enableCombing();
      b.setText(chunk);
      tameAutoSize(b);
    } catch (err) { console.warn("Skipped box", b.getName(), err); }
  });
}

/* ---------- screens ---------- */

async function renderForms() {
  let templates = [];
  try { templates = await idbAll(); } catch (err) { console.error(err); }
  templates.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  // An uploaded copy of a built-in form (e.g. a newer version) is used instead of the bundled one.
  const own = new Map(templates.filter(t => t.profile).map(t => [t.profile, t]));
  $("builtinForms").innerHTML = FORM_PROFILES.filter(p => p.file).map(p => {
    const mine = own.get(p.id);
    return `<li class="bf">
      <button type="button" class="bf__main" data-form-fill="${esc(mine ? mine.id : "builtin:" + p.id)}">
        <strong>${esc(p.code)}</strong> <span>${esc(p.title)}</span>${mine ? ` <span class="opt">your copy</span>` : ""}
      </button>
      <a class="bf__link" href="${esc(p.url)}" target="_blank" rel="noopener" title="Check the latest version on the HSE site" aria-label="Check the latest ${esc(p.title)} form on the HSE site">HSE ↗</a>
    </li>`;
  }).join("");
  $("officialForms").innerHTML = OTHER_HSE_FORMS.map(f => `
    <li><a href="${esc(f.url)}" target="_blank" rel="noopener"><strong>${esc(f.code)}</strong> ${esc(f.title)}${f.note ? ` <span class="opt">${esc(f.note)}</span>` : ""}</a></li>`).join("");
  $("formTemplates").innerHTML = templates.length ? templates.map(t => `
    <article class="card form-item">
      <div>
        <div class="eyebrow">${t.fieldCount ? `${t.fieldCount} boxes to fill` : "Not fillable"}${t.profile ? " · replaces the built-in copy" : ""}</div>
        <h3>${esc(t.name)}</h3>
        <div class="muted">Added ${esc(new Date(t.addedAt).toLocaleDateString("en-IE"))} · ${t.pageCount || "?"} page${t.pageCount === 1 ? "" : "s"}</div>
      </div>
      <div class="form-item__actions">
        <button class="btn btn--primary btn--small" data-form-fill="${esc(t.id)}" ${t.fieldCount ? "" : "disabled"}>Fill in</button>
        <button class="btn btn--danger-ghost btn--small" data-form-del="${esc(t.id)}">Remove</button>
      </div>
      ${t.fieldCount ? "" : `<p class="hint">This PDF has no fillable boxes, so the app can't fill it automatically yet. Send it in the chat and a layout can be added for it.</p>`}
    </article>`).join("")
    : `<p class="hint">Only needed for a form that isn't built in, or a newer version of one that is.</p>`;

  const done = (state.forms || []).slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  $("filledForms").innerHTML = done.length ? done.map(r => {
    const periods = (state.leavePeriods || []).filter(p => p.formId === r.id);
    return `
    <article class="card form-item">
      <div>
        <div class="eyebrow">Filled form</div>
        <h3>${esc(r.templateName)}</h3>
        ${periods.length ? `<div class="leave-note">On your timesheets: ${describePeriods(periods)} <button type="button" class="link-btn" data-form-unleave="${esc(r.id)}">Remove</button></div>` : ""}
        <div class="muted">${esc(new Date(r.updatedAt).toLocaleString("en-IE", { dateStyle: "short", timeStyle: "short" }))}${r.sends?.length ? ` · sent ${esc(new Date(r.sends.at(-1)).toLocaleString("en-IE", { dateStyle: "short", timeStyle: "short" }))}` : ""}</div>
      </div>
      <div class="form-item__actions">
        <button class="btn btn--small" data-form-open="${esc(r.id)}">Open</button>
        <button class="btn btn--danger-ghost btn--small" data-form-forget="${esc(r.id)}">Delete</button>
      </div>
    </article>`;
  }).join("") : `<p class="hint">Forms you fill in are kept here so you can resend or change them.</p>`;
}

async function addFormFile(file) {
  if (!file) return;
  if (!/pdf/i.test(file.type) && !/\.pdf$/i.test(file.name)) return toast("Please choose a PDF file.", true);
  toast("Reading the form…");
  try {
    const bytes = await file.arrayBuffer();
    const { fields, pageCount, profile } = await readFields(bytes);
    const real = fields.filter(f => !f.synthetic && !f.combo);
    const rec = { id: newId(), name: profile ? profile.title : file.name.replace(/\.pdf$/i, ""), addedAt: new Date().toISOString(), bytes, fieldCount: real.length, pageCount, profile: profile?.id || null };
    await idbPut(rec);
    await renderForms();
    toast(real.length ? `Added${profile ? ` — recognised as ${profile.title}` : ` — ${real.length} boxes found`}.` : "Added, but this PDF has no fillable boxes.", !real.length);
    if (real.length) openFormEditor(rec.id);
  } catch (err) {
    console.error(err);
    alert("That PDF couldn't be read:\n\n" + err.message);
  }
}

// From a leave day on the timesheet: open its HSE form with the dates and days filled in,
// or the form already made for that leave.
async function openLeaveForm(i) {
  const sheet = currentSheet();
  if (!sheet) return;
  let run = leaveRun(sheet, i);
  const p = leaveFormProfile(run.type);
  if (!p) return;
  if (p.leaveWeek) run = weekBlock(run);                                // e.g. Parent's Leave: the whole week
  const done = linkedLeaveForm(sheet, run);
  showTab("forms");
  if (done) return openFormEditor(done.templateId, done.id);
  let templateId = "builtin:" + p.id;
  try { const own = (await idbAll()).find(t => t.profile === p.id); if (own) templateId = own.id; } catch { /* use the built-in copy */ }
  const values = {};
  for (const [box, what] of Object.entries(p.leaveFill || {})) {
    values[box] = what === "from" ? displayDate(run.from) : what === "to" ? displayDate(run.to)
      : what === "days" ? String(run.days) : `${run.days} day${run.days === 1 ? "" : "s"}`;
  }
  openFormEditor(templateId, null, { values, link: { sheetId: sheet.id, type: run.type, from: run.from, to: run.to } });
}

async function openFormEditor(templateId, recordId = null, extra = null) {
  let t;
  try { t = await getTemplate(templateId); } catch (err) { console.error(err); return toast("That form couldn't be loaded — check your connection and try again.", true); }
  if (!t) return toast("That form isn't on this device any more — add it again.", true);
  const { fields, profile } = await readFields(t.bytes, t.profile || null);
  const rec = recordId ? (state.forms || []).find(r => r.id === recordId) : null;
  fx.open = t; fx.fields = fields; fx.recordId = recordId; fx.file = null; fx.groups = profile?.groups || {};
  fx.values = rec ? { ...rec.values } : {};
  fx.prefilled = new Set();
  if (!rec) {
    // Each detail goes in the first (top-most) matching box only — e.g. "Name" but not a later "Name1".
    const used = new Set();
    for (const f of fields) {
      const k = guessKey(f);
      if (!k || (used.has(k) && !f.fill)) continue;
      const v = valueFor(k);
      if (v) { fx.values[f.name] = v; fx.prefilled.add(f.name); used.add(k); }
    }
  }
  fx.link = rec?.link || extra?.link || null;
  fx.fromSheet = new Set();
  for (const [k, v] of Object.entries(extra?.values || {})) { fx.values[k] = v; fx.fromSheet.add(k); }
  renderFormEditor();
  $("formEditor").hidden = false;
  $("formEditor").scrollIntoView({ behavior: "smooth", block: "start" });
}

function fieldInput(f) {
  const v = fx.values[f.name];
  const id = `ff_${btoa(unescape(encodeURIComponent(f.name))).replace(/[^a-z0-9]/gi, "")}`;
  const tag = fx.fromSheet?.has(f.name) ? ` <span class="opt">from your timesheet</span>`
    : fx.prefilled?.has(f.name) ? ` <span class="opt">from My details</span>` : "";
  if (f.type === "signature") {
    const mine = !f.others;
    return `<div class="field form-sig">
      <span class="label">${esc(f.label)}</span>
      ${mine ? (state.profile.signatureImage
        ? `<label class="check check--small"><input type="checkbox" data-ff-sign="${esc(f.name)}" ${fx.values[`__sign:${f.name}`] === false ? "" : "checked"}> <span>Add my signature here</span></label><img class="form-sig__img" src="${state.profile.signatureImage}" alt="Your signature">`
        : `<p class="hint">Add your signature in My details to sign this automatically.</p>`)
        : `<p class="hint">Left blank for them to sign.</p>`}
    </div>`;
  }
  if (f.type === "check") return `<label class="check check--small form-check"><input type="checkbox" data-ff="${esc(f.name)}" ${v ? "checked" : ""}> <span>${esc(f.label)}</span></label>`;
  if (f.type === "choice") return `<div class="field"><label for="${id}">${esc(f.label)}</label><select id="${id}" data-ff="${esc(f.name)}">${opt("", "— Select —", !v)}${f.options.map(o => opt(o, f.optionLabels?.[o] || o, v === o)).join("")}</select></div>`;
  if (f.long) return `<div class="field field--wide"><label for="${id}">${esc(f.label)}${tag}</label><textarea id="${id}" data-ff="${esc(f.name)}" rows="6">${esc(v ?? "")}</textarea></div>`;
  const isDate = f.noGuess ? !!f.date : f.date || (/date|commenc|start|finish|end|from|until|return/i.test(f.label) && !/name|reason|course|days/i.test(f.label));
  const lim = f.maxLen ? ` <span class="opt">${f.comb ? `${f.maxLen} boxes` : `max ${f.maxLen}`}</span>` : "";
  return `<div class="field"><label for="${id}">${esc(f.label)}${tag}${isDate ? "" : lim}</label>
    <div class="ff-row"><input type="text" id="${id}" data-ff="${esc(f.name)}" value="${esc(v ?? "")}" ${isDate ? `placeholder="dd/mm/yyyy"` : ""}>
    ${isDate ? `<input type="date" class="ff-date" data-ff-date="${esc(f.name)}" aria-label="Pick a date">` : ""}</div></div>`;
}

function renderFormEditor() {
  const t = fx.open;
  const mine = fx.fields.filter(f => !f.others && !f.group);
  const theirs = fx.fields.filter(f => f.others);
  // Optional sections: shown folded, and only written to the PDF when ticked.
  const optional = Object.entries(fx.groups || {}).map(([g, title]) => {
    const list = fx.fields.filter(f => !f.others && f.group === g);
    if (!list.length) return "";
    const on = fx.values[`__group:${g}`] === true;
    return `<details class="form-others form-opt" ${on ? "open" : ""}><summary>${esc(title)}</summary>
      <label class="check check--small"><input type="checkbox" data-ff-group="${esc(g)}" ${on ? "checked" : ""}> <span>Include this section on the form</span></label>
      <div class="form-fields">${list.map(fieldInput).join("")}</div></details>`;
  }).join("");
  $("formEditor").innerHTML = `
    <div class="form-ed__head">
      <div><div class="eyebrow">Fill in</div><h2>${esc(t.name)}</h2>
      <p class="muted">${fx.prefilled?.size ? `${fx.prefilled.size} boxes filled from My details. ` : ""}Boxes are listed in the order they appear on the form.</p></div>
      <button type="button" class="btn btn--ghost btn--small" data-form-close>Close</button>
    </div>
    <div class="form-fields">${mine.map(fieldInput).join("")}</div>
    ${optional}
    ${theirs.length ? `<details class="form-others"><summary>Manager / HR sections (${theirs.length}) — usually left blank</summary><div class="form-fields">${theirs.map(fieldInput).join("")}</div></details>` : ""}
    <div class="actions">
      <button type="button" class="btn btn--primary" data-form-make>Save &amp; make PDF</button>
    </div>
    <div id="formOut" hidden class="form-out">
      <p class="muted" id="formOutName"></p>
      <p class="hint leave-note" id="formLeave" hidden></p>
      <div class="actions">
        <button type="button" class="btn btn--primary" data-form-share>Email with PDF attached</button>
        <button type="button" class="btn" data-form-download>Download PDF</button>
      </div>
      <p class="hint">Email: pick your email app — the PDF is attached. Your default recipients' addresses are copied, so press and hold To and tap Paste.</p>
    </div>`;
}

function readEditorValues() {
  document.querySelectorAll("#formEditor [data-ff]").forEach(el => {
    fx.values[el.dataset.ff] = el.type === "checkbox" ? el.checked : el.value;
  });
  document.querySelectorAll("#formEditor [data-ff-sign]").forEach(el => { fx.values[`__sign:${el.dataset.ffSign}`] = el.checked; });
  document.querySelectorAll("#formEditor [data-ff-group]").forEach(el => { fx.values[`__group:${el.dataset.ffGroup}`] = el.checked; });
}

async function saveAndMake() {
  readEditorValues();
  const now = new Date().toISOString();
  state.forms = state.forms || [];
  let rec = state.forms.find(r => r.id === fx.recordId);
  if (!rec) { rec = { id: newId(), templateId: fx.open.id, templateName: fx.open.name, createdAt: now, sends: [] }; state.forms.push(rec); fx.recordId = rec.id; }
  rec.values = { ...fx.values };
  if (fx.link) rec.link = fx.link;
  rec.updatedAt = now;
  saveState();
  try {
    fx.file = await buildFilledPdf(fx.open, fx.values, fx.fields);
    $("formOut").hidden = false;
    $("formOutName").textContent = `${fx.file.name} is ready.`;
    const lv = putLeaveOnTimesheets(rec);
    $("formLeave").hidden = !lv;
    $("formLeave").innerHTML = lv || "";
    renderForms();
    toast("Form saved and PDF made.");
  } catch (err) {
    console.error(err);
    alert("The filled PDF couldn't be made:\n\n" + err.message);
  }
}

/* ---------- leave dates in a filled form → timesheets ---------- */

function isoFromDisplay(v) {
  const t = String(v || "").trim();
  const m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/.exec(t) || /^(\d{2})(\d{2})(\d{4})$/.exec(t);
  if (!m) return "";
  const y = m[3].length === 2 ? "20" + m[3] : m[3];
  const d = new Date(Number(y), Number(m[2]) - 1, Number(m[1]));
  return d.getDate() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 ? isoLocal(d) : "";
}
// The leave dates a filled form asks for (e.g. maternity leave start → end).
function formLeaveRanges(values, profileId) {
  const p = profileId && profileById(profileId);
  if (!p?.leaveRanges) return null;
  return p.leaveRanges(n => values[n], g => values[`__group:${g}`] === true)
    .map(r => ({ type: r.type, from: isoFromDisplay(r.from), to: isoFromDisplay(r.to) }))
    .filter(r => r.from && r.to && r.from <= r.to);
}
function describePeriods(periods) {
  return periods.map(p => `${esc(p.type)} ${displayDate(p.from)} – ${displayDate(p.to)}`).join("; ");
}
// Save the form's leave dates as leave periods and mark them on the timesheets. Returns a message (HTML) or "".
function putLeaveOnTimesheets(rec) {
  const ranges = formLeaveRanges(rec.values, fx.open.profile);
  if (!ranges) return "";
  const had = (state.leavePeriods || []).some(p => p.formId === rec.id);
  if (!ranges.length && !had) return "";
  const r = setFormLeavePeriods(rec.id, ranges, fx.open.name);
  if (!ranges.length) return "The leave dates were removed from your timesheets.";
  return `<strong>Added to your timesheets:</strong> ${describePeriods(r.periods)}.
    ${r.days ? `${r.days} rostered shift${r.days === 1 ? "" : "s"} on ${r.sheets} draft timesheet${r.sheets === 1 ? "" : "s"} marked as leave. ` : ""}Timesheets you start for these weeks will fill it in for you.
    ${r.published.length ? `<br><span class="warn-text">Already published, so not changed: week ending ${r.published.map(displayDate).join(", ")}. Use <strong>Revise</strong> in the Library to update ${r.published.length === 1 ? "it" : "them"}.</span>` : ""}`;
}
// Take a form's leave dates off the timesheets again.
function removeFormLeave(formId) {
  setFormLeavePeriods(formId, [], "");
  renderForms();
  toast("Leave taken off your timesheets.");
}

// The leave dates a filled form is for: from the timesheet day it was opened from, the form's leave
// ranges (e.g. maternity), or its from / to boxes. { from, to } (ISO) or null.
function formLeaveDates() {
  if (fx.link?.from) return { from: fx.link.from, to: fx.link.to || fx.link.from };
  const ranges = formLeaveRanges(fx.values, fx.open.profile) || [];
  if (ranges.length) return { from: ranges.map(r => r.from).sort()[0], to: ranges.map(r => r.to).sort().at(-1) };
  const prof = fx.open.profile && profileById(fx.open.profile);
  const box = what => Object.entries(prof?.leaveFill || {}).find(([, w]) => w === what)?.[0];
  const from = box("from") ? isoFromDisplay(fx.values[box("from")]) : "";
  const to = box("to") ? isoFromDisplay(fx.values[box("to")]) : "";
  return from ? { from, to: to && to >= from ? to : from } : null;
}

// The email for a filled form, e.g.
//   Subject: Andrew Mitchell Study Leave Dec 26   (the month the leave starts, else this month)
//   Body:    Hello / Please find Study Leave application attached for 7/12/26. / Regards / <Name>
function formEmail() {
  const p = state.profile;
  const prof = fx.open.profile && profileById(fx.open.profile);
  const type = prof ? prof.title : fx.open.name;
  const dates = formLeaveDates();
  const d = dates ? parseIso(dates.from) : new Date();
  const when = `${"Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ")[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
  const short = iso => { const x = parseIso(iso); return `${x.getDate()}/${x.getMonth() + 1}/${String(x.getFullYear()).slice(2)}`; };
  const forDates = dates ? ` for ${short(dates.from)}${dates.to !== dates.from ? ` – ${short(dates.to)}` : ""}` : "";
  return {
    subject: `${p.name} ${type} ${when}`,
    body: `Hello\n\nPlease find ${type} application attached${forDates}.\n\nRegards\n${p.name}`
  };
}

// Called straight from the tap so phones allow sharing.
function shareForm() {
  if (!fx.file) return toast("Tap “Save & make PDF” first.", true);
  const p = state.profile;
  const { subject, body } = formEmail();
  const emails = [...(p.contacts || []).filter(c => c.default && c.email).map(c => c.email), ...(p.meDefault && p.meEmail ? [p.meEmail] : [])];
  if (emails.length && navigator.clipboard) navigator.clipboard.writeText(emails.join(", ")).catch(() => {});
  const rec = (state.forms || []).find(r => r.id === fx.recordId);
  const log = () => { if (rec) { rec.sends = [...(rec.sends || []), new Date().toISOString()]; saveState(); renderForms(); } };
  if (navigator.canShare && navigator.share && navigator.canShare({ files: [fx.file] })) {
    navigator.share({ files: [fx.file], title: subject, text: body })
      .then(() => { log(); toast(emails.length ? "Addresses copied — press and hold To, then Paste." : "Shared."); })
      .catch(err => { if (err.name !== "AbortError") alert("Couldn't share: " + err.message); });
    return;
  }
  downloadFile(fx.file);
  log();
  setTimeout(() => { location.href = `mailto:${emails.map(encodeURIComponent).join(",")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`; }, 600);
  toast("Email opened — attach the PDF from Downloads.");
}

function initForms() {
  $("formUpload").addEventListener("change", e => { addFormFile(e.target.files[0]); e.target.value = ""; });
  document.addEventListener("click", async e => {
    const lf = e.target.closest("[data-leave-form]");
    if (lf) return openLeaveForm(Number(lf.dataset.leaveForm));
    const lp = e.target.closest("[data-leave-period]");
    if (lp) {
      const p = (state.leavePeriods || []).find(x => x.id === lp.dataset.leavePeriod);
      const r = p && (state.forms || []).find(x => x.id === p.formId);
      if (r) { showTab("forms"); openFormEditor(r.templateId, r.id); }
      return;
    }
    const ul = e.target.closest("[data-form-unleave]");
    if (ul) { if (confirm("Take this leave off your draft timesheets? (Published ones aren't changed.)")) removeFormLeave(ul.dataset.formUnleave); return; }
    const t = e.target.closest("[data-form-fill],[data-form-del],[data-form-open],[data-form-forget],[data-form-close],[data-form-make],[data-form-share],[data-form-download]");
    if (!t) return;
    const d = t.dataset;
    if (d.formFill) openFormEditor(d.formFill);
    else if (d.formOpen) { const r = (state.forms || []).find(x => x.id === d.formOpen); if (r) { showTab("forms"); openFormEditor(r.templateId, r.id); } }
    else if (d.formDel) { if (confirm("Remove this blank form from the app? (Filled copies stay.)")) { await idbDel(d.formDel); renderForms(); } }
    else if (d.formForget) {
      const hasLeave = (state.leavePeriods || []).some(p => p.formId === d.formForget);
      if (confirm(hasLeave ? "Delete this filled form? Its leave will also be taken off your draft timesheets." : "Delete this filled form?")) {
        if (hasLeave) setFormLeavePeriods(d.formForget, [], "");
        state.forms = (state.forms || []).filter(r => r.id !== d.formForget); saveState(); renderForms();
      }
    }
    else if (d.formClose !== undefined) { readEditorValues(); $("formEditor").hidden = true; }
    else if (d.formMake !== undefined) saveAndMake();
    else if (d.formShare !== undefined) shareForm();
    else if (d.formDownload !== undefined) { if (fx.file) downloadFile(fx.file); }
  });
  document.addEventListener("change", e => {
    const el = e.target.closest("[data-ff-date]");
    if (!el || !el.value) return;
    const box = document.querySelector(`#formEditor [data-ff="${CSS.escape(el.dataset.ffDate)}"]`);
    if (box) { box.value = displayDate(el.value); fx.values[el.dataset.ffDate] = box.value; }
  });
}

document.addEventListener("DOMContentLoaded", initForms);
