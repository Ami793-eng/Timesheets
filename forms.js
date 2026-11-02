/* Timesheet Hub — forms.js
 * Fill official (fillable) PDF forms such as the HSE HR 108 series.
 * The user adds the PDF once; it is kept on this device (IndexedDB).
 * The app reads the form's boxes, pre-fills what it knows (name, staff
 * number, grade, base…), adds the signature, and makes a filled PDF.
 * Uses pdf-lib (lib/pdf-lib.min.js, loaded on demand).
 */
"use strict";

const OFFICIAL_FORMS = [
  { code: "HR 108(p)", name: "Study Leave", url: "https://assets.hse.ie/media/documents/HR_108p_employee_application_form_for_study_leave.pdf" },
  { code: "HR 108(e)", name: "Examination Leave", url: "https://assets.hse.ie/media/documents/HR_108e_application_form_for_examination_leave.pdf" },
  { code: "HR 108(s)", name: "Interview Leave", url: "https://assets.hse.ie/media/documents/HR_108s_employee_application_form_for_interview_leave.pdf" },
  { code: "HR 108(j)", name: "Parental Leave", url: "https://assets.hse.ie/media/documents/hr-108-j-parental-leave-application-form_V5.pdf" },
  { code: "HR 108(c)", name: "Carer's Leave", url: "https://assets.hse.ie/media/documents/HR_108c_employee_carers_leave_application_form.pdf" },
  { code: "HR 108(o)", name: "Special Unpaid Leave", url: "https://assets.hse.ie/media/documents/HR_108o_employee_application_form_for_unpaid_leave.pdf" },
  { code: "HR 108(g)", name: "Health & Safety Leave", url: "https://assets.hse.ie/media/documents/HR_108g_health_and_safety_leave_application_form_V5.pdf" },
  { code: "HR 108(l)", name: "Reserve Defence Forces Leave", url: "https://assets.hse.ie/media/documents/HR_108l_employee_application_form_for_reserve_defence_forces_leave.pdf" },
  { code: "All HR forms", name: "HSE HR forms page (maternity, paternity, parent's leave and more)", url: "https://healthservice.hse.ie/staff/benefits-and-services/hr-forms" }
];

const fx = { open: null, file: null, fields: [], values: {}, recordId: null };

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

async function readFields(bytes) {
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
    if (type === "text" && SIGN_RE.test(label + " " + name) && !/date/i.test(label)) type = "signature";
    fields.push({ name, label, type, options, page, x, y, w, h, others, readOnly: f.isReadOnly && f.isReadOnly() });
  }
  fields.sort((a, b) => a.page - b.page || (b.y - a.y) || (a.x - b.x));
  return { fields, pageCount: pages.length };
}

/* ---------- pre-filling from My details ---------- */

function guessValue(field) {
  if (field.others || field.type !== "text") return null;
  const p = state.profile;
  const l = ` ${(field.label + " " + field.name).toLowerCase().replace(/[^a-z]+/g, " ")} `;
  const [first, ...rest] = String(p.name || "").trim().split(/\s+/);
  const last = rest.join(" ");
  const today = displayDate(isoLocal(new Date()));
  if (/ (surname|last name|family name) /.test(l)) return last || null;
  if (/ (first name|forename|christian name|given name) /.test(l)) return first || null;
  if (/ (personnel|payroll|staff no|staff number|employee no|employee number|pers no|employee id|staff id) /.test(l)) return p.number || null;
  if (/ name /.test(l) && !/ (course|college|institution|child|children|spouse|partner|exam|company|organisation|organization|employer|interview|body|university|school|next of kin) /.test(l)) return p.name || null;
  if (/ (grade|job title|position|post title|title of post) /.test(l)) return p.grade || null;
  if (/ (department|dept|unit|service area|division|section) /.test(l)) return p.dept || null;
  if (/ (location|base|station|work place|workplace|place of work|hospital) /.test(l)) return profileBase() || null;
  if (/ (e mail|email) /.test(l)) return p.meEmail || null;
  if (/ (phone|mobile|telephone|tel|contact no|contact number) /.test(l)) return p.phone || null;
  const lbl = ` ${field.label.toLowerCase().replace(/[^a-z]+/g, " ").trim()} `;
  if (/^ (date|todays date|today s date|date signed|date of application|signature date|date of request|employee date) $/.test(lbl)) return today;
  return null;
}

/* ---------- making the filled PDF ---------- */

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
  for (const fd of fields) {
    let f; try { f = form.getField(fd.name); } catch { continue; }
    const v = values[fd.name];
    try {
      if (fd.type === "signature") continue;
      if (f instanceof PDFTextField) { if (v != null && v !== "") f.setText(pdfSafe(v)); }
      else if (f instanceof PDFCheckBox) { v ? f.check() : f.uncheck(); }
      else if ((f instanceof PDFDropdown || f instanceof PDFOptionList || f instanceof PDFRadioGroup) && v) f.select(v);
    } catch (err) { console.warn("Skipped field", fd.name, err); }
  }
  try { form.updateFieldAppearances(font); } catch (err) { console.warn(err); }
  // Employee signature: drawn into the employee's signature box(es); manager boxes are left blank.
  const sig = state.profile.signatureImage;
  if (sig) {
    const png = await doc.embedPng(sig);
    for (const fd of fields.filter(f => f.type === "signature" && !f.others && fd_isOn(values, f))) {
      const page = pages[fd.page] || pages[0];
      const scale = Math.min((fd.w - 4) / png.width, (fd.h - 2) / png.height);
      const w = png.width * scale, h = png.height * scale;
      // The empty signature box would be drawn on top of the image, so remove it and keep its outline.
      try {
        const fld = form.getField(fd.name);
        fld.acroField.getWidgets().forEach(w => w.dict.set(PDFName.of("F"), PDFNumber.of(2)));   // 2 = hidden
        if (fld.enableReadOnly) fld.enableReadOnly();
      } catch { /* leave as is */ }
      page.drawRectangle({ x: fd.x, y: fd.y, width: fd.w, height: fd.h, borderColor: rgb(0, 0, 0), borderWidth: 1 });
      page.drawImage(png, { x: fd.x + 2, y: fd.y + (fd.h - h) / 2, width: w, height: h });
    }
  }
  const out = await doc.save();
  const base = (template.name || "Form").replace(/\.pdf$/i, "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "");
  const who = String(state.profile.name || "").replace(/[^a-zA-Z0-9]+/g, "");
  return new File([out], `${base}_${who}_${isoLocal(new Date())}.pdf`, { type: "application/pdf" });
}
function fd_isOn(values, fd) { return values[`__sign:${fd.name}`] !== false; }

/* ---------- screens ---------- */

async function renderForms() {
  $("officialForms").innerHTML = OFFICIAL_FORMS.map(f => `
    <li><a href="${esc(f.url)}" target="_blank" rel="noopener"><strong>${esc(f.code)}</strong> ${esc(f.name)}</a></li>`).join("");
  let templates = [];
  try { templates = await idbAll(); } catch (err) { console.error(err); }
  templates.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  $("formTemplates").innerHTML = templates.length ? templates.map(t => `
    <article class="card form-item">
      <div>
        <div class="eyebrow">${t.fieldCount ? `${t.fieldCount} boxes to fill` : "Not fillable"}</div>
        <h3>${esc(t.name)}</h3>
        <div class="muted">Added ${esc(new Date(t.addedAt).toLocaleDateString("en-IE"))} · ${t.pageCount || "?"} page${t.pageCount === 1 ? "" : "s"}</div>
      </div>
      <div class="form-item__actions">
        <button class="btn btn--primary btn--small" data-form-fill="${esc(t.id)}" ${t.fieldCount ? "" : "disabled"}>Fill in</button>
        <button class="btn btn--danger-ghost btn--small" data-form-del="${esc(t.id)}">Remove</button>
      </div>
      ${t.fieldCount ? "" : `<p class="hint">This PDF has no fillable boxes, so the app can't fill it automatically yet. Send it in the chat and a layout can be added for it.</p>`}
    </article>`).join("")
    : `<div class="card empty">No forms added yet. Download a form from the list above, then tap <strong>Add a form</strong>.</div>`;

  const done = (state.forms || []).slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  $("filledForms").innerHTML = done.length ? done.map(r => `
    <article class="card form-item">
      <div>
        <div class="eyebrow">Filled form</div>
        <h3>${esc(r.templateName)}</h3>
        <div class="muted">${esc(new Date(r.updatedAt).toLocaleString("en-IE", { dateStyle: "short", timeStyle: "short" }))}${r.sends?.length ? ` · sent ${esc(new Date(r.sends.at(-1)).toLocaleString("en-IE", { dateStyle: "short", timeStyle: "short" }))}` : ""}</div>
      </div>
      <div class="form-item__actions">
        <button class="btn btn--small" data-form-open="${esc(r.id)}">Open</button>
        <button class="btn btn--danger-ghost btn--small" data-form-forget="${esc(r.id)}">Delete</button>
      </div>
    </article>`).join("") : `<p class="hint">Forms you fill in are kept here so you can resend or change them.</p>`;
}

async function addFormFile(file) {
  if (!file) return;
  if (!/pdf/i.test(file.type) && !/\.pdf$/i.test(file.name)) return toast("Please choose a PDF file.", true);
  toast("Reading the form…");
  try {
    const bytes = await file.arrayBuffer();
    const { fields, pageCount } = await readFields(bytes);
    const rec = { id: newId(), name: file.name.replace(/\.pdf$/i, ""), addedAt: new Date().toISOString(), bytes, fieldCount: fields.length, pageCount };
    await idbPut(rec);
    await renderForms();
    toast(fields.length ? `Added — ${fields.length} boxes found.` : "Added, but this PDF has no fillable boxes.", !fields.length);
    if (fields.length) openFormEditor(rec.id);
  } catch (err) {
    console.error(err);
    alert("That PDF couldn't be read:\n\n" + err.message);
  }
}

async function openFormEditor(templateId, recordId = null) {
  const t = await idbGet(templateId);
  if (!t) return toast("That form isn't on this device any more — add it again.", true);
  const { fields } = await readFields(t.bytes);
  const rec = recordId ? (state.forms || []).find(r => r.id === recordId) : null;
  fx.open = t; fx.fields = fields; fx.recordId = recordId; fx.file = null;
  fx.values = rec ? { ...rec.values } : {};
  fx.prefilled = new Set();
  if (!rec) for (const f of fields) { const g = guessValue(f); if (g) { fx.values[f.name] = g; fx.prefilled.add(f.name); } }
  renderFormEditor();
  $("formEditor").hidden = false;
  $("formEditor").scrollIntoView({ behavior: "smooth", block: "start" });
}

function fieldInput(f) {
  const v = fx.values[f.name];
  const id = `ff_${btoa(unescape(encodeURIComponent(f.name))).replace(/[^a-z0-9]/gi, "")}`;
  const tag = fx.prefilled?.has(f.name) ? ` <span class="opt">from My details</span>` : "";
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
  if (f.type === "choice") return `<div class="field"><label for="${id}">${esc(f.label)}</label><select id="${id}" data-ff="${esc(f.name)}">${opt("", "— Select —", !v)}${f.options.map(o => opt(o, o, v === o)).join("")}</select></div>`;
  const isDate = /date|commenc|start|finish|end|from|until|return/i.test(f.label) && !/name|reason|course/i.test(f.label);
  return `<div class="field"><label for="${id}">${esc(f.label)}${tag}</label>
    <div class="ff-row"><input type="text" id="${id}" data-ff="${esc(f.name)}" value="${esc(v ?? "")}" ${isDate ? `placeholder="dd/mm/yyyy"` : ""}>
    ${isDate ? `<input type="date" class="ff-date" data-ff-date="${esc(f.name)}" aria-label="Pick a date">` : ""}</div></div>`;
}

function renderFormEditor() {
  const t = fx.open;
  const mine = fx.fields.filter(f => !f.others);
  const theirs = fx.fields.filter(f => f.others);
  $("formEditor").innerHTML = `
    <div class="form-ed__head">
      <div><div class="eyebrow">Fill in</div><h2>${esc(t.name)}</h2>
      <p class="muted">${fx.prefilled?.size ? `${fx.prefilled.size} boxes filled from My details. ` : ""}Boxes are listed in the order they appear on the form.</p></div>
      <button type="button" class="btn btn--ghost btn--small" data-form-close>Close</button>
    </div>
    <div class="form-fields">${mine.map(fieldInput).join("")}</div>
    ${theirs.length ? `<details class="form-others"><summary>Manager / HR sections (${theirs.length}) — usually left blank</summary><div class="form-fields">${theirs.map(fieldInput).join("")}</div></details>` : ""}
    <div class="actions">
      <button type="button" class="btn btn--primary" data-form-make>Save &amp; make PDF</button>
    </div>
    <div id="formOut" hidden class="form-out">
      <p class="muted" id="formOutName"></p>
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
}

async function saveAndMake() {
  readEditorValues();
  const now = new Date().toISOString();
  state.forms = state.forms || [];
  let rec = state.forms.find(r => r.id === fx.recordId);
  if (!rec) { rec = { id: newId(), templateId: fx.open.id, templateName: fx.open.name, createdAt: now, sends: [] }; state.forms.push(rec); fx.recordId = rec.id; }
  rec.values = { ...fx.values };
  rec.updatedAt = now;
  saveState();
  try {
    fx.file = await buildFilledPdf(fx.open, fx.values, fx.fields);
    $("formOut").hidden = false;
    $("formOutName").textContent = `${fx.file.name} is ready.`;
    renderForms();
    toast("Form saved and PDF made.");
  } catch (err) {
    console.error(err);
    alert("The filled PDF couldn't be made:\n\n" + err.message);
  }
}

// Called straight from the tap so phones allow sharing.
function shareForm() {
  if (!fx.file) return toast("Tap “Save & make PDF” first.", true);
  const p = state.profile;
  const subject = `${p.name} – ${fx.open.name}`;
  const body = `Hello\n\nPlease find my ${fx.open.name} attached.\n\nKind Regards\n${p.name}`;
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
    const t = e.target.closest("[data-form-fill],[data-form-del],[data-form-open],[data-form-forget],[data-form-close],[data-form-make],[data-form-share],[data-form-download]");
    if (!t) return;
    const d = t.dataset;
    if (d.formFill) openFormEditor(d.formFill);
    else if (d.formOpen) { const r = (state.forms || []).find(x => x.id === d.formOpen); if (r) openFormEditor(r.templateId, r.id); }
    else if (d.formDel) { if (confirm("Remove this blank form from the app? (Filled copies stay.)")) { await idbDel(d.formDel); renderForms(); } }
    else if (d.formForget) { if (confirm("Delete this filled form?")) { state.forms = (state.forms || []).filter(r => r.id !== d.formForget); saveState(); renderForms(); } }
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
