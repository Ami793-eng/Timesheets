/* Timesheet Hub — form-profiles.js
 * Made-to-measure setups for the official HSE leave forms in /forms.
 *
 * Each profile describes one PDF form:
 *   id, code, title      — e.g. "hr108p", "HR 108(p)", "Study Leave"
 *   file                 — the blank PDF bundled in the repo (built-in form)
 *   url                  — where the latest version lives on the HSE site
 *   match(names, title)  — recognises an uploaded copy of the same form
 *   fields               — per box (by its PDF name):
 *        label   what to call it in the app
 *        fill    what to pre-fill from My details (surname, first, name, number,
 *                grade, dept, base, email, phone, today, pps, ppsMain, ppsExtra)
 *        date    show a date picker
 *        others  manager / HR box — listed separately and usually left blank
 *        hide    not shown at all (decoration boxes, duplicates)
 *        group   belongs to an optional section, written only when ticked
 *        options labels for radio buttons, by their export value
 *        type    force a type ("text" / "signature")
 *        long    a large box — shown as a multi-line text area
 *   combos               — one value spread over several boxes, e.g. a date in
 *                          8 one-character squares: { id, label, parts: [...] }
 *   signatures           — where to draw the employee signature when the form
 *                          has a signature line but no box for it
 */
"use strict";

/* ---------- helpers to keep the profiles short ---------- */

const HEAD_LABELS = {
  surname: "Surname", first: "First name", grade: "Grade", number: "Personnel No", base: "Location",
  pps: "PPS No", ppsMain: "PPS No", ppsExtra: "PPS No – letters", name: "Name", phone: "Phone", email: "E-mail", today: "Date (signed)"
};
// Employee boxes filled from My details: { key: "PDF box name" }.
function head(map, extra = {}) {
  const o = {};
  for (const [k, n] of Object.entries(map)) o[n] = { label: HEAD_LABELS[k], fill: k, ...(k === "today" ? { date: true } : {}), ...extra };
  return o;
}
// Manager / HR boxes: { "PDF box name": "label" }. Labels with "date" get a date picker.
function mgr(map, extra = {}) {
  const o = {};
  for (const [n, l] of Object.entries(map)) o[n] = { label: l, others: true, ...(/\bdate\b/i.test(l) ? { date: true } : {}), ...extra };
  return o;
}
function hide(...names) { return Object.fromEntries(names.map(n => [n, { hide: true }])); }
function circulation(names) { return mgr(Object.fromEntries(names.map((n, i) => [n, `Circulation list ${i + 1}`]))); }
const CIRC = ["1", "2", "3", "4", "5", "6", "7", "8"];
const YES_NO = { Yes: "Yes", No: "No", yes: "Yes", no: "No", Y: "Yes" };
const nums = (prefix, from, to) => Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${from + i}`);

// The usual line-manager block on HR 108 forms.
function lineManager({ approved, reason, date, name, grade, phone, mobile, email }) {
  return {
    ...(approved ? { [approved]: { label: "Application approved", others: true, options: YES_NO } } : {}),
    ...mgr({
      ...(reason ? { [reason]: "If not approved, reason" } : {}),
      ...(date ? { [date]: "Manager date" } : {}),
      ...(name ? { [name]: "Manager name" } : {}),
      ...(grade ? { [grade]: "Manager grade" } : {}),
      ...(phone ? { [phone]: "Manager contact phone no" } : {}),
      ...(mobile ? { [mobile]: "Manager mobile no" } : {}),
      ...(email ? { [email]: "Manager e-mail address" } : {})
    })
  };
}
// The usual HR Personnel Administration block.
function hrAdmin({ by, name, phone, date, comments }) {
  return mgr({
    ...(by ? { [by]: "HR: system updated by" } : {}),
    ...(name ? { [name]: "HR: name" } : {}),
    ...(phone ? { [phone]: "HR: contact phone no" } : {}),
    ...(date ? { [date]: "HR: date" } : {}),
    ...(comments ? { [comments]: "HR: comments" } : {})
  });
}
const has = (names, ...want) => want.every(w => names.has(w));
const titled = (title, re) => re.test(title || "");

const HSE = "https://healthservice.hse.ie/documents/";

const FORM_PROFILES = [

  /* ---------------- HR 108(a) Adoptive Leave ---------------- */
  {
    id: "hr108a", code: "HR 108(a)", title: "Adoptive Leave",
    file: "forms/HR_108a_adoptive_leave_application_form.pdf", url: HSE + "758/HR_108a_adoptive_leave_application_form.pdf",
    match: (n, t) => titled(t, /108\s*a\b/i) || has(n, "Expected Date of Placement", "Additional Adoptive Leave (Foreign Adoption)"),
    fields: {
      ...head({ surname: "Surname", first: "First Name", grade: "Grade", number: "Personnel No", base: "Location", ppsMain: "PPS No", ppsExtra: "pps1" }),
      "Adoptive Leave":                               { label: "Adoptive Leave (tick)" },
      "Start Date":                                   { label: "Adoptive Leave – start date", date: true },
      "End Date":                                     { label: "Adoptive Leave – end date", date: true },
      "Additional Adoptive Leave":                    { label: "Additional Adoptive Leave (tick)" },
      "Start Date1":                                  { label: "Additional Adoptive Leave – start date", date: true },
      "End Date1":                                    { label: "Additional Adoptive Leave – end date", date: true },
      "Additional Adoptive Leave (Foreign Adoption)": { label: "Additional Adoptive Leave – foreign adoption (tick)" },
      "Start Date2":                                  { label: "Foreign adoption – start date", date: true },
      "End Date2":                                    { label: "Foreign adoption – end date", date: true },
      "Start Date3":                                  { label: "Leave in lieu of public holidays – start date", date: true },
      "End Date3":                                    { label: "Leave in lieu of public holidays – end date", date: true },
      "Expected Date of Placement":                   { label: "Expected date of placement", date: true },
      "Please Tick":                                  { label: "I have enclosed certification to confirm the expected date of placement" },
      ...head({ today: "Date", name: "Name (Print)", phone: "Contact Tel No" }),
      "Employee Name":  { label: "Name (top of page 2)", fill: "name" },
      "Personnel No1":  { label: "Personnel No (top of page 2)", fill: "number" },
      "Employee Name1": { label: "Name (top of page 3)", fill: "name" },
      "Personnel No2":  { label: "Personnel No (top of page 3)", fill: "number" },
      ...mgr({
        "Placement Cert received": "Class A: placement cert received", "AB1 to Dept S.W": "Class A: AB1 to Dept S.W.",
        "Placement Cert received1": "Class D: placement cert received", "Average Hours worked per week": "Average hours worked per week",
        "If this employee on a fixed term or specified purpose conract please indicate if the period of leave applied for is covered by the tenure of their contract": "Fixed-term contract covers the leave?",
        "If no please provide expiry date of contract": "If not, contract expiry date"
      }),
      ...lineManager({ name: "Name (Capitals)", grade: "Grade1", phone: "Contact Phone No", mobile: "Mobile No", email: "e-mail address" }),
      ...mgr({ "Name (Print)1": "Delegated officer: name", "Date1": "Delegated officer: date", "Tel No": "Delegated officer: tel no", "Decision No": "Decision no",
               "Location Code": "Payroll: location code", "Name (Print)2": "Payroll: name", "Tel No1": "Payroll: tel no", "Date2": "Payroll: date" }),
      ...hrAdmin({ by: "System updated by", name: "Name (Print)3", phone: "Contact Phone No1", date: "Date3", comments: "Comments" }),
      ...circulation(CIRC)
    },
    signatures: [{ label: "Employee signature", page: 0, x: 92, y: 198, w: 204, h: 20 }]
  },

  /* ---------------- HR 108(c) Carer's Leave ---------------- */
  {
    id: "hr108c", code: "HR 108(c)", title: "Carer's Leave",
    file: "forms/HR_108c_employee_carers_leave_application_form.pdf", url: HSE + "779/HR_108c_employee_carers_leave_application_form.pdf",
    match: (n, t) => titled(t, /108\s*c\b/i) || has(n, "Please print Name here", "Othert"),
    fields: {
      ...head({ surname: "Surname", first: "First Name", grade: "Grade", base: "Location" }),
      "My request is to allow me to provide full time car":      { label: "Full-time care and attention to (relationship)" },
      "Please print Name here":                                  { label: "Name of the person cared for" },
      "One continuous period of 104 weeks":                      { label: "One continuous period of 104 weeks" },
      "ChkBox":                                                  { label: "In periods of weeks / months (each at least 13 weeks)" },
      "duration  the aggregate of which does not exceed 1":      { label: "Periods – details" },
      "Employee will be engaging in employment up to 185":       { label: "I will be working (up to 18.5 hours a week) during Carer's Leave" },
      "Employee will be engaging in employment up to 185-0":     { label: "Hours a week" },
      "Othert":                                                  { label: "Other" },
      "Othert-0":                                                { label: "Other – details" },
      "If Other please outline how you propose to take ca":      { label: "If Other, how you propose to take the leave" },
      "Textfield-3":                                             { label: "(continued)" },
      "Textfield-4":                                             { label: "(continued)" },
      "Signature":                                               { label: "Employee signature" },
      // Confirmation Agreement (page 3) — done once agreed with the manager.
      ...head({ surname: "Surname-0", first: "First Name-0" }, { group: "agreement" }),
      ...Object.fromEntries(nums("Textfield-", 50, 56).map((n, i) => [n, { label: `Agreed manner and duration (line ${i + 1})`, group: "agreement" }])),
      "Signature-3":                                             { label: "Employee signature (agreement)", group: "agreement" },
      // Manager / HR
      ...mgr({ "leave approved complies with the terms outlined in": "Leave complies with HR policy",
               "CheckBox1": "Application approved", "CheckBox3": "Application refused",
               "Comments if application is refused state reason": "If refused, reason", "Textfield-14": "Reason (continued)",
               "Signature-0": "Manager signature", "Name Capitals": "Manager name", "Grade-8": "Manager grade",
               "Contact Phone No": "Manager contact phone no", "Mobile No": "Manager mobile no", "Email Address": "Manager e-mail address",
               "Name Print": "Delegated officer: name", "Signature-1": "Delegated officer: signature", "Tel No": "Delegated officer: tel no", "Decision No": "Decision no",
               "Location Code": "Payroll: location code", "Textfield-31": "Payroll: location code (2)", "Textfield-32": "Payroll: location code (3)", "Textfield-33": "Payroll: location code (4)",
               "CheckBox4": "Checked by local payroll", "Name Print-0": "Payroll: name", "Signature-2": "Payroll: signature", "Tel No-0": "Payroll: tel no",
               "Signature-4": "Manager signature (agreement)", "Name Print-1": "Manager name (agreement)", "Tel No-1": "Manager tel no (agreement)",
               "email address": "Manager e-mail (agreement)", "Mobile No-0": "Manager mobile (agreement)" }),
      ...circulation(CIRC),
      ...hide("be completed by the employee_RB", "be completed by Line Manager_RB", "be completed by Employee_RB", "be completed by Employee_RB-0",
              "be completed by Line Manager on behalf of HSE_RB", "The employee is required to notify the HSE of any",
              "To", "To-0", "Date", "Date-0", "Date-1", "Date-2", "Section 2 Proposed Manner in which you would like", "One continuous period of 104 weeks-0", "Section 3 Confirmation",
              "Textfield-13", "Application Approved tick box", "Application Refused tick box", "Section 5 Delegated Officer Approval",
              "Section 6 Payroll Section", "Section 7 Circulation List", "Checked by Local Payroll")
    },
    // This form uses one square per character for numbers and dates.
    combos: [
      { id: "pno",   label: "Personnel No", fill: "number", parts: ["Grade-0", "Grade-1", "Grade-2", "Grade-3", "Grade-4", "Grade-5", "Grade-6", "Grade-7"] },
      { id: "pps",   label: "PPS No", fill: "pps", parts: nums("Location-", 0, 7) },
      { id: "from",  label: "From date", date: true, parts: ["Textfield", "Textfield-0"] },
      { id: "to",    label: "To date", date: true, parts: ["Textfield-1", "Textfield-2"] },
      { id: "sdate", label: "Date (signed)", fill: "today", date: true, parts: nums("Textfield-", 5, 12) },
      { id: "pno2",  label: "Personnel No (agreement)", fill: "number", group: "agreement", parts: ["Textfield-42", "Textfield-43"] },
      { id: "pps2",  label: "PPS No (agreement)", fill: "pps", group: "agreement", parts: ["Textfield-44", "Textfield-45"] },
      { id: "from2", label: "Agreed from date", date: true, group: "agreement", parts: ["Textfield-46", "Textfield-47"] },
      { id: "to2",   label: "Agreed to date", date: true, group: "agreement", parts: ["Textfield-48", "Textfield-49"] },
      { id: "sdate2", label: "Date (agreement signed)", fill: "today", date: true, group: "agreement", parts: nums("Textfield-", 57, 64) },
      { id: "mdate", label: "Manager date", date: true, others: true, parts: nums("Textfield-", 15, 22) },
      { id: "ddate", label: "Delegated officer: date", date: true, others: true, parts: nums("Textfield-", 23, 30) },
      { id: "pdate", label: "Payroll: date", date: true, others: true, parts: nums("Textfield-", 34, 41) },
      { id: "mdate2", label: "Manager date (agreement)", date: true, others: true, parts: nums("Textfield-", 65, 72) }
    ],
    groups: { agreement: "Confirmation Agreement (page 3) — once agreed with your manager" }
  },

  /* ---------------- HR 108(d) Bereavement Leave ---------------- */
  {
    id: "hr108d", code: "HR 108(d)", title: "Bereavement Leave",
    file: "forms/HR108d_Bereavement_leave_application_form.pdf", url: HSE + "1227/HR108d_Bereavement_leave_application_form.pdf",
    match: names => has(names, "Relationship of deceased to employee", "Date of death"),
    fields: {
      "Surname":                              { label: "Surname", fill: "surname" },
      "First name":                           { label: "First name", fill: "first" },
      "Grade":                                { label: "Grade", fill: "grade" },
      "personnel no":                         { label: "Personnel No", fill: "number" },
      "location":                             { label: "Location", fill: "base" },
      "PPS no":                               { label: "PPS No", fill: "ppsMain" },
      "Text8":                                { label: "PPS No – letters", fill: "ppsExtra" },
      "Relationship of deceased to employee": { label: "Relationship of deceased to employee" },
      "Date of death":                        { label: "Date of death", date: true },
      "No of days leave applied for":         { label: "No. of days leave applied for" },
      "Date from":                            { label: "Date from", date: true },
      "Date to":                              { label: "Date to", date: true },
      "Date":                                 { label: "Date (signed)", fill: "today", date: true },
      "Application Approved":                 { label: "Application approved", others: true },
      "Days of Leave":                        { label: "No. of days leave approved", others: true },
      "Date From Leave":                      { label: "Approved date from", others: true, date: true },
      "Date to Leave":                        { label: "Approved date to", others: true, date: true },
      "Leave not approved":                   { label: "If not approved, reason", others: true },
      "Leave not approved 2":                 { label: "Reason (continued)", others: true },
      "Name1":                                { label: "Manager name", others: true },
      "Date1":                                { label: "Manager date", others: true, date: true },
      "Contact phone no":                     { label: "Manager contact phone no", others: true },
      "Grade1":                               { label: "Manager grade", others: true },
      "E-mail address":                       { label: "Manager e-mail address", others: true }
    },
    // The employee "Signature:" line has no box on this form — sign beside the label, left of "Date :".
    signatures: [{ label: "Employee signature", page: 0, x: 100, y: 462, w: 196, h: 20 }]
  },

  /* ---------------- HR 108(e) Examination Leave ---------------- */
  {
    id: "hr108e", code: "HR 108(e)", title: "Examination Leave",
    file: "forms/HR_108e_application_form_for_examination_leave.pdf", url: HSE + "3008/HR_108e_application_form_for_examination_leave.pdf",
    match: (n, t) => titled(t, /108\s*e\b/i) || has(n, "no. of days leave", "Name capital"),
    fields: {
      ...head({ surname: "surname", first: "first name", grade: "Grade", number: "personnel number", base: "Location", ppsMain: "pps no", ppsExtra: "PPS1", today: "date" }),
      "no. of days leave": { label: "Number of days leave applied for" },
      "from date":      { label: "From date", date: true },
      "to date":        { label: "To date", date: true },
      ...lineManager({ approved: "Application Approved", reason: "if no give reason", date: "date1", name: "Name capital", grade: "grade", phone: "contact number", mobile: "Mobile number", email: "email address" })
    },
    signatures: [{ label: "Employee signature", page: 0, x: 97, y: 455, w: 202, h: 20 }]
  },

  /* ---------------- HR 108(f) Force Majeure Leave ---------------- */
  {
    id: "hr108f", code: "HR 108(f)", title: "Force Majeure Leave",
    file: "forms/HR_108f_application_form_for_force_majeure_leave.pdf", url: HSE + "422/HR_108f_application_form_for_force_majeure_leave.pdf",
    match: (n, t) => titled(t, /108\s*f\b/i) || has(n, "Names injured/ill* person"),
    fields: {
      ...head({ surname: "Surname", first: "First Name", grade: "Grade", number: "Personnel No", base: "Location", ppsMain: "PPS no", ppsExtra: "Text4", today: "Date" }),
      "Names injured/ill* person":       { label: "Name of injured / ill person" },
      "Address of injured/ill* person":  { label: "Address of injured / ill person" },
      "Address of injured/ill* person1": { label: "Address (line 2)" },
      "Address of injured/ill* person2": { label: "Address (line 3)" },
      "relationship to employee":        { label: "Relationship to you" },
      "nature of injury/illness*":       { label: "Nature of injury / illness" },
      "no of days applied for":          { label: "No. of days applied for" },
      "from":                            { label: "Leave from", date: true },
      "to":                              { label: "Leave to", date: true },
      "Name":                            { label: "Name (top of page 2)", fill: "name" },
      "personnel no1":                   { label: "Personnel No (top of page 2)", fill: "number" },
      ...mgr({ "Application Approved": "Application approved", "Application Refused": "Application refused",
               "comments": "If refused, reason", "comments1": "Reason (continued)" }),
      ...lineManager({ date: "Date1", name: "Name(capitals)", grade: "Grade1", phone: "Contact phone no", mobile: "Mobile no", email: "Email address" })
    },
    signatures: [{ label: "Employee signature", page: 0, x: 105, y: 177, w: 201, h: 20 }]
  },

  /* ---------------- HR 108(g) Health & Safety Leave ---------------- */
  {
    id: "hr108g", code: "HR 108(g)", title: "Health & Safety Leave",
    file: "forms/HR_108g_health_and_safety_leave_application_form_V5.pdf", url: HSE + "777/HR_108g_health_and_safety_leave_application_form_V5.pdf",
    match: (n, t) => titled(t, /108\s*g\b/i) || has(n, "Name of employee's Doctor"),
    fields: {
      ...head({ surname: "surname", first: "First Name", grade: "Grade", number: "Personnel No", base: "Locaion", ppsMain: "PPS No", ppsExtra: "pps1", today: "Date" }),
      "Pregnant":                  { label: "Pregnant" },
      "Recently given birth":      { label: "Recently given birth" },
      "Breastfeeding":             { label: "Breastfeeding" },
      "From date":                 { label: "From date", date: true },
      "to date":                   { label: "To date", date: true },
      "Name of employee's Doctor": { label: "Your doctor's name" },
      ...mgr({ "Workplace risk assessment completed": "Workplace risk assessment completed",
               "Nightwork risk assessment completed": "Nightwork risk assessment completed" }),
      "Employee's Doctor has certified that nightwork poses a risk to the employees health an safety": { label: "Doctor has certified nightwork poses a risk", others: true, options: YES_NO },
      ...lineManager({ approved: "Application Approved", date: "Date1", name: "Name1", grade: "Grade1", phone: "Contact Phone No", mobile: "Mobile No", email: "Email Address" })
    },
    signatures: [{ label: "Employee signature", page: 0, x: 97, y: 470, w: 202, h: 20 }]
  },

  /* ---------------- HR 108(h) Jury Service ---------------- */
  {
    id: "hr108h", code: "HR 108(h)", title: "Jury Service Leave",
    file: "forms/HR_108h_application_for_jury_service_leave_form.pdf", url: HSE + "423/HR_108h_application_for_jury_service_leave_form.pdf",
    match: (n, t) => titled(t, /108\s*h\b/i) || has(n, "Number of days called for jury service"),
    fields: {
      ...head({ surname: "Surname", first: "First Name", grade: "Grade", number: "Personnel No", base: "Location", ppsMain: "PPS No", ppsExtra: "PPS1`", today: "Date" }),
      "Number of days called for jury service": { label: "Number of days called for jury service" },
      "From date":                              { label: "From date", date: true },
      "To Date":                                { label: "To date", date: true },
      ...lineManager({ approved: "application approved", reason: "If no give reason", date: "Date1", name: "Name", grade: "Grade1", phone: "Contact Phone No", mobile: "Mobile No", email: "Email Address" }),
      "Nurses":                { label: "Nurses", group: "excused" },
      "Dentists":              { label: "Dentists", group: "excused" },
      "Pharmacists":           { label: "Pharmacists", group: "excused" },
      "Medical Practitioners": { label: "Medical practitioners", group: "excused" }
    },
    groups: { excused: "Professions excused as of right (page 2) — only if it applies" },
    signatures: [{ label: "Employee signature", page: 0, x: 100, y: 491, w: 203, h: 20 }]
  },

  /* ---------------- HR 108(i) Maternity Leave ---------------- */
  {
    id: "hr108i", code: "HR 108(i)", title: "Maternity Leave",
    file: "forms/HR_108i_maternity_leave_application_form_V10.pdf", url: HSE + "424/HR_108i_maternity_leave_application_form_V10.pdf",
    match: (n, t) => titled(t, /108\s*i\b/i) || has(n, "Doctors Stamp", "Premature Maternity Leave-0"),
    fields: {
      ...head({ surname: "Surname", first: "First Name", grade: "Grade", number: "Grade-0", base: "Location", pps: "Location-7", today: "Textfield-7", name: "Name", phone: "Contact Tel No" }),
      "CheckBox14":                     { label: "Maternity Leave (tick)" },
      "Maternity Leave-7":              { label: "Maternity Leave – start date", date: true },
      "Maternity Leave-13":             { label: "Maternity Leave – end date", date: true },
      "CheckBox15":                     { label: "Additional Maternity Leave (tick)" },
      "Additional Maternity Leave-5":   { label: "Additional Maternity Leave – start date", date: true },
      "Additional Maternity Leave-10":  { label: "Additional Maternity Leave – end date", date: true },
      "CheckBox16":                     { label: "Premature Maternity Leave (tick)" },
      "Premature Maternity Leave-0":    { label: "Premature Maternity Leave – start date", date: true },
      "Premature Maternity Leave-8":    { label: "Premature Maternity Leave – end date", date: true },
      "Textfield-6":                    { label: "Expected date of delivery", date: true },
      "Doctors Name":                   { label: "Doctor's name" },
      "CheckBox12":                     { label: "I have enclosed certification confirming the expected date of delivery" },
      "CheckBox13":                     { label: "I have read and understand the maternity leave policy and explanatory notes" },
      "Signature":                      { label: "Employee signature" },
      // Section 5 — postponement for serious illness (employee part)
      "CheckBox4":                             { label: "First postponement (tick)", group: "postpone" },
      "First Postponement-7":                  { label: "First postponement – start date", date: true, group: "postpone" },
      "First Postponement-9":                  { label: "First postponement – end date", date: true, group: "postpone" },
      "CheckBox5":                             { label: "Second postponement (tick)", group: "postpone" },
      "Second Postponement if applicable-0":   { label: "Second postponement – start date", date: true, group: "postpone" },
      "Second Postponement if applicable-14":  { label: "Second postponement – end date", date: true, group: "postpone" },
      "CheckBox6":                             { label: "Revised Maternity Leave (tick)", group: "postpone" },
      "Maternity Leave-18":                    { label: "Revised Maternity Leave – start date", date: true, group: "postpone" },
      "Maternity Leave-27":                    { label: "Revised Maternity Leave – end date", date: true, group: "postpone" },
      "CheckBox7":                             { label: "Revised Additional Maternity Leave (tick)", group: "postpone" },
      "Additional Maternity Leave-20":         { label: "Revised Additional Maternity Leave – start date", date: true, group: "postpone" },
      "Additional Maternity Leave-26":         { label: "Revised Additional Maternity Leave – end date", date: true, group: "postpone" },
      "CheckBox8":                             { label: "Revised Premature Maternity Leave (tick)", group: "postpone" },
      "Premature Maternity Leave-22":          { label: "Revised Premature Maternity Leave – start date", date: true, group: "postpone" },
      "Premature Maternity Leave-25":          { label: "Revised Premature Maternity Leave – end date", date: true, group: "postpone" },
      "Signature-2":                           { label: "Employee signature (postponement)", group: "postpone" },
      ...head({ today: "Textfield-31", name: "Name-0", phone: "Contact Tel No-0" }, { group: "postpone" }),
      // Section 6 — postponement for hospitalisation of the child (employee part)
      "Textfield-41": { label: "Postponement – start date", date: true, group: "hospital" },
      "Textfield-46": { label: "Postponement – end date", date: true, group: "hospital" },
      // Doctor, manager and HR
      ...mgr({ "Doctors Signature": "Doctor's signature (your GP)", "Doctors Stamp": "Doctor's stamp (your GP)",
               "CheckBox1": "All PRSI Class A employees", "CheckBox2": "EDD received", "CheckBox3": "MB1/AB1 to Dept S.W.",
               "Textfield-15": "Average hours worked per week", "Textfield-16": "Hours to be paid on maternity leave",
               "Please list allowances not payable": "Allowances not payable", "Textfield-17": "Allowances (continued)", "Textfield-18": "Allowances (continued)",
               "Textfield-26": "If not, expected contract expiry date",
               "Signature-0": "Manager signature", "Name Capitals": "Manager name", "Grade-8": "Manager grade",
               "Contact Phone No": "Manager contact phone no", "Mobile No": "Manager mobile no", "Email address": "Manager e-mail address",
               "CheckBox9": "Postponement: complies with HR Circular 28/2024", "CheckBox10": "Postponement: sick leave entered by TRO", "CheckBox11": "Postponement: within maximum entitlement",
               "Signature-3": "Manager signature (postponement)", "Name Capitals-0": "Manager name (postponement)", "Grade-9": "Manager grade (postponement)",
               "Contact Phone No-0": "Manager phone (postponement)", "Mobile No-0": "Manager mobile (postponement)", "Email address-0": "Manager e-mail (postponement)",
               "Signature-5": "Manager signature (hospitalisation)", "Name Capitals-1": "Manager name (hospitalisation)", "Grade-10": "Manager grade (hospitalisation)",
               "Contact Phone No-1": "Manager phone (hospitalisation)", "Mobile No-1": "Manager mobile (hospitalisation)", "Email address-1": "Manager e-mail (hospitalisation)" }),
      "RadioButton4": { label: "Allowances not payable during the leave?", others: true, options: { "0": "Yes", "2": "No", "1": "N/A" } },
      "RadioButton5": { label: "Fixed-term contract covers the leave?", others: true, options: { "0": "Yes", "1": "No" } }
    },
    groups: {
      postpone: "Section 5: Postpone for serious illness — only if needed",
      hospital: "Section 6: Postpone as baby is in hospital — only if needed"
    }
  },

  /* ---------------- HR 108(j) Parental Leave ---------------- */
  {
    id: "hr108j", code: "HR 108(j)", title: "Parental Leave",
    file: "forms/hr-108-j-parental-leave-application-form_V5.pdf", url: HSE + "212/hr-108-j-parental-leave-application-form_V5.pdf",
    match: (n, t) => titled(t, /108\s*j\b/i) || has(n, "Name of child", "Date of adoption order if applicable"),
    fields: {
      ...head({ surname: "Surname", first: "First Name", grade: "Grade", number: "Grade-0", base: "Location", pps: "PPS No", today: "Textfield-16" }),
      "Name of child":                          { label: "Name of child" },
      "Date of birth of child":                 { label: "Date of birth of child", date: true },
      "Date of adoption order if applicable":   { label: "Date of adoption order (if applicable)", date: true },
      "Textfield":                              { label: "How you propose to take the leave" },
      "Textfield-0":                            { label: "(continued)" },
      "Textfield-1":                            { label: "(continued)" },
      "Textfield-2":                            { label: "Duration of the proposed leave" },
      "Textfield-4":                            { label: "Duration – from", date: true },
      "Textfield-6":                            { label: "Duration – to", date: true },
      "Textfield-7":                            { label: "Duration (continued)" },
      "Textfield-8":                            { label: "Proposed commencement date", date: true },
      "Signature":                              { label: "Employee signature" },
      "Personnel No":                           { label: "Name / Personnel No (top of page 2)", fill: "number" },
      // Confirmation Agreement (page 3)
      ...head({ surname: "Surname-0", first: "First Name-0", grade: "Grade-9", number: "Grade-10", base: "Location-8", pps: "PPS No-0",
                today: "Textfield-63", name: "Name please Print", email: "email address", phone: "Mobile No-0" }, { group: "agreement" }),
      "Name of Child":                          { label: "Name of child", group: "agreement" },
      "Date of birth of child-7":               { label: "Date of birth of child", date: true, group: "agreement" },
      "Date of adoption order if applicable-7": { label: "Date of adoption order (if applicable)", date: true, group: "agreement" },
      "Textfield-53":                           { label: "Agreed from", date: true, group: "agreement" },
      "Textfield-55":                           { label: "Agreed to", date: true, group: "agreement" },
      ...Object.fromEntries(nums("Textfield-", 56, 62).map((n, i) => [n, { label: `Agreed manner and duration (line ${i + 1})`, group: "agreement" }])),
      "Date of commencement":                   { label: "Date of commencement", date: true, group: "agreement" },
      "Date of termination":                    { label: "Date of termination", date: true, group: "agreement" },
      "Signature-3":                            { label: "Employee signature (agreement)", group: "agreement" },
      "Tel No-1":                               { label: "Tel no", group: "agreement" },
      // Manager / HR
      ...mgr({ "ChkBox": "Application approved", "ChkBox-0": "Application refused", "ChkBox-1": "Birth cert / adoption order received and returned",
               "Comments if application is refused state reason": "If refused, reason", "Textfield-24": "Reason (continued)",
               "Signature-0": "Manager signature", "Textfield-25": "Manager date", "Name Capitals": "Manager name", "Grade-8": "Manager grade",
               "Contact Phone No": "Manager contact phone no", "Mobile No": "Manager mobile no", "Email Address": "Manager e-mail address",
               "Name Print": "Delegated officer: name", "Signature-1": "Delegated officer: signature", "Tel No": "Delegated officer: tel no",
               "Textfield-33": "Delegated officer: date", "Decision No": "Decision no",
               "Signature-4": "Manager signature (agreement)", "Textfield-71": "Manager date (agreement)", "Name please Print-0": "Manager name (agreement)",
               "Tel No-2": "Manager tel no (agreement)", "email address-0": "Manager e-mail (agreement)", "Mobile No-1": "Manager mobile (agreement)" })
    },
    groups: { agreement: "Confirmation Agreement (page 3) — once agreed with your manager" }
  },

  /* ---------------- HR 108(k) Paternity Leave ---------------- */
  {
    id: "hr108k", code: "HR 108(k)", title: "Paternity Leave",
    file: "forms/Paternity_leave_application_form.pdf", url: HSE + "219/Paternity_leave_application_form.pdf",
    match: (n, t) => titled(t, /108\s*k\b|paternity/i) || has(n, "Paternity leave start date"),
    fields: {
      ...head({ surname: "Surname", first: "First Name", grade: "Grade", number: "Personnel No", base: "Location", ppsMain: "PPS No", ppsExtra: "pps1", today: "Date" }),
      "Expected date of confinement or date of birth":          { label: "Expected date of birth, or date of birth", date: true },
      "Expected date of adoption placement or date of adoption": { label: "Expected date of adoption placement, or date of adoption", date: true },
      "Paternity leave start date":                             { label: "Paternity leave start date", date: true },
      "Paternity leave end date":                               { label: "Paternity leave end date", date: true },
      "The fater of the child":                                 { label: "I am: the father of the child" },
      "The spouse, civil partner or cohabitant of the mother of the child regardless of gender": { label: "I am: the spouse, civil partner or cohabitant of the mother" },
      "A parent of the child as defined under section 5 of the children and family relationships act 2015": { label: "I am: a parent of the child (s.5 Children and Family Relationships Act 2015)" },
      "A person (other than the mother of the child) who is the spouse, civil partner or cohabitant of the adopting mother or sole male adopter of the child": { label: "I am: the spouse, civil partner or cohabitant of the adopting mother or sole male adopter" },
      "Where the child is adopted jointly by a married couple of the same sex, the spouse chosen by that couple to be the relevant parent for the purpose of Paternity Leave and Benefit": { label: "I am: the spouse chosen by a same-sex married couple adopting jointly" },
      "Copy of the medical certifiacte signed by a registered medical practitioner confirming the pregnancy of the expectant mother and specifying the expected week of confinement": { label: "Enclosed: medical certificate confirming the pregnancy and expected week of birth" },
      "Copy of the birth certificate":                          { label: "Enclosed: copy of the birth certificate" },
      "Copy of certificate of placement (adoption)":            { label: "Enclosed: certificate of placement (adoption)" },
      "Particulars in writing of the placement (intercountry adoption)": { label: "Enclosed: particulars of the placement (intercountry adoption)" },
      "Copy of an applicable decleration of eligibility and suitability (intercountry adoption)": { label: "Enclosed: declaration of eligibility and suitability (intercountry adoption)" },
      ...lineManager({ date: "Date1", name: "Name", grade: "Grade1", phone: "Contact Phone Number", mobile: "Mobile No", email: "Email Address" }),
      ...mgr({ "Name (Print)": "Delegated officer: name", "Date2": "Delegated officer: date", "Tel No": "Delegated officer: tel no", "Decision No": "Decision no" }),
      ...hrAdmin({ by: "System Updated by", phone: "Tel No1", date: "Date3", comments: "Comments" }),
      ...circulation(CIRC)
    },
    signatures: [{ label: "Employee signature", page: 0, x: 100, y: 483, w: 198, h: 20 }]
  },

  /* ---------------- HR 108(m) Serious Physical Assault Scheme ---------------- */
  {
    id: "hr108m", code: "HR 108(m)", title: "Serious Physical Assault Scheme",
    file: "forms/HR108m_serious-physical-assault-scheme-leave-formv4.pdf", url: HSE + "222/HR108m_serious-physical-assault-scheme-leave-formv4.pdf",
    match: (n, t) => titled(t, /108\s*m\b|assault/i) || has(n, "Date of assault"),
    fields: {
      ...head({ surname: "Surname", first: "First Name", grade: "Grade", number: "Personnel No", base: "Location", ppsMain: "PPS No", ppsExtra: "Text2", today: "Date" }),
      "Date of assault":          { label: "Date of assault", date: true },
      "Icident Report Completed": { label: "Incident report completed" },
      ...mgr({ "Incident Report Noted": "Incident report noted",
               "No of Calander days": "Full pay: no. of calendar days", "No of Calander days1": "1st extension: no. of calendar days", "No of Calander days2": "2nd extension: no. of calendar days" }),
      "Assault on Duty Full Pay":      { label: "Assault on duty – full pay (max 6 months)", others: true, options: YES_NO },
      "Assault on Duty 1st Extension": { label: "1st extension (max 3 months)", others: true, options: { Yes1: "Yes", No1: "No" } },
      "Assault on Duty 2nd Extension": { label: "2nd extension (max 3 months)", others: true, options: { Yes2: "Yes", No2: "No" } },
      "Application Approved":          { label: "Application approved", others: true, options: { Yes3: "Yes", No3: "No" } },
      ...lineManager({ date: "Date1", name: "Name", grade: "Garde1", phone: "Contact Phone No", mobile: "Mobile No", email: "Email Address" }),
      ...mgr({ "CheckBox1": "Senior service manager: recommend – yes", "CheckBox2": "Senior service manager: recommend – no",
               "name text": "Senior service manager: name", "Text6date": "Senior service manager: date", "Text3 tel": "Senior service manager: tel no", "decisoion no": "Decision no",
               "CheckBox3": "Senior HR manager: approve – yes", "CheckBox4": "Senior HR manager: approve – no",
               "CheckBox5": "Senior HR manager: refuse – yes", "CheckBox6": "Senior HR manager: refuse – no",
               "refusal 1": "Reason for refusal", "Text9 refusal 32": "Reason (continued)", "Text10ref": "Reason (continued)",
               "CheckBox7": "Line manager authorised to start payment", "Text11": "Payment from (date)", "Text12": "Payment to (date)",
               "Text1311": "Senior HR manager: signature", "Text16": "Senior HR manager: date", "Text14": "Senior HR manager: name",
               "Text17": "Senior HR manager: grade", "Text15": "Senior HR manager: tel no", "Text18": "Senior HR manager: e-mail",
               "CheckBox8": "Employee informed of outcome", "CheckBox19": "Copy e-mailed to Employee Relations",
               "CheckBox20": "Pay arranged", "CheckBox21": "Pay arranged (2)", "CheckBox22": "SAP infotype entered" }),
      "Text4 signature": { label: "Senior service manager: signature", others: true }
    },
    signatures: [{ label: "Employee signature", page: 0, x: 97, y: 545, w: 201, h: 20 }]
  },

  /* ---------------- HR 108(n) Special Leave on Marriage ---------------- */
  {
    id: "hr108n", code: "HR 108(n)", title: "Special Leave on Marriage",
    file: "forms/HR_108n_employee_application_form_for_special_leave_on_marriage.pdf", url: HSE + "775/HR_108n_employee_application_form_for_special_leave_on_marriage.pdf",
    match: (n, t) => titled(t, /108\s*n\b|marriage/i) || has(n, "Name (PRINT)", "Checked by Payroll"),
    fields: {
      ...head({ surname: "Surname", first: "First Name", grade: "Grade", number: "Personnel No", base: "Location", ppsMain: "PPS No", ppsExtra: "pps1", today: "Date" }),
      "Number of days leave applied for": { label: "Number of days leave applied for" },
      "From Date":                        { label: "From date", date: true },
      "To Date":                          { label: "To date", date: true },
      "Name2":                            { label: "Name (top of page 2)", fill: "name" },
      "Personnel No1":                    { label: "Personnel No (top of page 2)", fill: "number" },
      ...lineManager({ approved: "Application Approved", reason: "If no give reason", date: "Date1", name: "Name", grade: "Grade1", phone: "Contact Phone No", mobile: "Mobile No", email: "Email Address" }),
      ...mgr({ "Name (PRINT)": "Delegated officer: name", "Tel No": "Delegated officer: tel no", "Date2": "Delegated officer: date", "Decision No": "Decision no",
               "Location Code": "Payroll: location code", "Checked by Payroll": "Checked by payroll", "Name (Print)1": "Payroll: name", "Tel No1": "Payroll: tel no", "Date4": "Payroll: date" }),
      ...hrAdmin({ by: "System Updated by", name: "Name1", phone: "Contact Phone No1", date: "Date3", comments: "Comments" }),
      ...circulation(CIRC)
    },
    signatures: [{ label: "Employee signature", page: 0, x: 97, y: 411, w: 201, h: 20 }]
  },

  /* ---------------- HR 108(p) Study Leave ---------------- */
  {
    id: "hr108p", code: "HR 108(p)", title: "Study Leave",
    file: "forms/HR_108p_employee_application_form_for_study_leave.pdf", url: HSE + "773/HR_108p_employee_application_form_for_study_leave.pdf",
    match: (n, t) => titled(t, /108\s*p\b|study leave/i),
    fields: {
      ...head({ surname: "Surname", first: "First Name", grade: "Grade", number: "Personnel No", base: "Location", pps: "PPS no", today: "Date" }),
      "Number of days leave applied for": { label: "Number of days leave applied for" },
      "From Date":                        { label: "From date", date: true },
      "To Date":                          { label: "To date", date: true },
      ...lineManager({ approved: "Application Approved", date: "Date1", name: "Name", grade: "Grade1", phone: "Contact Phone No", mobile: "Mobile No", email: "Email Address" }),
      ...hrAdmin({ by: "System Updated by", name: "Name1", phone: "Contact Phone No1", date: "Date2", comments: "Comments" }),
      ...circulation(CIRC)
    },
    signatures: [{ label: "Employee signature", page: 0, x: 99, y: 455, w: 203, h: 20 }]
  },

  /* ---------------- HR 108(q) Trade Union Leave ---------------- */
  {
    id: "hr108q", code: "HR 108(q)", title: "Trade Union Leave",
    file: "forms/HR_108q_trade_union_leave_form.pdf", url: HSE + "772/HR_108q_trade_union_leave_form.pdf",
    match: (n, t) => titled(t, /108\s*q\b|trade union/i) || has(n, "Leave applied for", "Name (CAPITALS)"),
    fields: {
      ...head({ surname: "Surname", first: "First Name", grade: "Grade", number: "Personnel No", base: "Location", ppsMain: "PPS No", ppsExtra: "Text1", today: "Date" }),
      "Leave applied for":                { label: "Leave applied for", options: { "Executive meetings": "Executive meetings", "Annual delegated conference": "Annual delegate conference", "Special delegated conference": "Special delegate conference" } },
      "Number of days leave applied for": { label: "Number of days leave applied for" },
      "From date":                        { label: "From date", date: true },
      "To date":                          { label: "To date", date: true },
      ...lineManager({ approved: "Application Approved", reason: "If no give reason", date: "Date1", name: "Name (CAPITALS)", grade: "Grade1", phone: "Contact Phone No", mobile: "Mobile No", email: "Email Address" }),
      ...hrAdmin({ by: "System Updated by", name: "Name", phone: "Contact Phone No1", date: "Date2", comments: "Comments" }),
      ...circulation(CIRC)
    },
    signatures: [{ label: "Employee signature", page: 0, x: 97, y: 432, w: 202, h: 20 }]
  },

  /* ---------------- HR 108(r) Carry-over of Annual Leave ---------------- */
  {
    id: "hr108r", code: "HR 108(r)", title: "Carry-over of Annual Leave",
    file: "forms/Carry_over_of_annual_leave_application_form_HR108r.pdf", url: HSE + "771/Carry_over_of_annual_leave_application_form_HR108r.pdf",
    match: (n, t) => titled(t, /108\s*r\b|carry over/i) || has(n, "Reasionnig"),
    fields: {
      ...head({ surname: "Surname", first: "First Name", grade: "Grade", number: "Personnel Number", base: "Location", ppsMain: "PPS Number", ppsExtra: "pps no. 1", today: "Date - section 1" }),
      "Number of days carried out":  { label: "Number of days carried over" },
      "Number of days carried over": { label: "Number of hours carried over" },
      "Reasionnig":                  { label: "Reason for carrying over annual leave" },
      "Signature":                   { label: "Employee signature" },
      ...mgr({ "Yes": "Application approved – yes", "No": "Application approved – no", "Signature 2": "Manager signature" }),
      ...lineManager({ date: "Date - section 2", name: "Name", grade: "Grade 2", phone: "Contact phone  section 2", mobile: "Mobile Number", email: "Email" }),
      ...hrAdmin({ by: "System updated", name: "Name -section 3", phone: "Contact phone  section 3", date: "Date - section 3", comments: "Comments" }),
      ...circulation(["circulation List 1", "circulation List 2", "circulation List 3", "circulation List 4", "circulation List 5", "circulation List  6", "circulation List 7", "circulation List 8"])
    }
  },

  /* ---------------- HR 108(s) Interview Leave ---------------- */
  {
    id: "hr108s", code: "HR 108(s)", title: "Interview Leave",
    file: "forms/HR_108s_employee_application_form_for_interview_leave.pdf", url: HSE + "770/HR_108s_employee_application_form_for_interview_leave.pdf",
    match: (n, t) => titled(t, /108\s*s\b|interview/i) || has(n, "name(capitals)", "if no, give reason"),
    fields: {
      ...head({ surname: "Surname", first: "first name", grade: "grade", number: "personnel no", base: "location", ppsMain: "PPS1", ppsExtra: "Text2", today: "date" }),
      "from date": { label: "From date", date: true },
      "to date":   { label: "To date", date: true },
      ...lineManager({ approved: "Application Approved", reason: "if no, give reason", date: "date1", name: "name(capitals)", grade: "Grade1", phone: "contact phone no", mobile: "mobile no" })
    },
    signatures: [{ label: "Employee signature", page: 0, x: 94, y: 409, w: 205, h: 20 }]
  },

  /* ---------------- HR 108(t) Parent's Leave ---------------- */
  {
    id: "hr108t", code: "HR 108(t)", title: "Parent's Leave",
    file: "forms/hr_108t_employee_application_form_for_parents_leave_V3.pdf", url: HSE + "4508/hr_108t_employee_application_form_for_parents_leave_V3.pdf",
    match: (n, t) => titled(t, /108\s*t\b|parents leave/i) || has(n, "Employee Sig Date", "week one date"),
    fields: {
      ...head({ surname: "SURNAME", first: "FIRST NAME", grade: "grade", number: "personnel No", base: "Location", ppsMain: "pps.no", today: "Employee Sig Date" }),
      "date of childs birth":   { label: "Expected date of birth, or date of birth", date: true },
      "date of adoption order": { label: "Expected date of adoption placement, or date of adoption", date: true },
      "relevant parent":        { label: "Adoption — I am", options: { ptc: "the qualifying adopter of the child", "the spouse": "the spouse, civil partner or cohabitant of the qualifying adopter" } },
      "any other case 1":       { label: "Any other case — I am a parent of the child", options: { Choice1: "a parent of the child" } },
      "any other case":         { label: "Any other case — I am", options: { Choice1: "the spouse, civil partner or cohabitant of the parent", Choice2: "a parent of a donor-conceived child (CFRA 2015)" } },
      ...Object.fromEntries([
        ["week one date", "week one to"], ["week two date", "week two to"], ["week three date", "week three to"], ["week four date", "week four to"],
        ["week five date", "week five to"], ["week Six date", "week Six to"], ["week Seven date", "week Seven to"], ["week8", "week8f"], ["Teweek9t", "week9f"]
      ].flatMap(([f, t], i) => [[f, { label: `Week ${i + 1} from`, date: true }], [t, { label: `Week ${i + 1} to`, date: true }]])),
      "RadioButton1yes":     { label: "Allowances not payable during the leave?", others: true, options: { "0": "Yes", "1": "No", "2": "N/A" } },
      "Signature Section 4": { label: "Manager name", others: true, type: "text" },
      ...mgr({ "Text2": "Allowances not payable", "Text3": "Allowances (continued)", "birthcert": "Relevant document noted",
               "Date": "Manager date", "Grade 1": "Manager grade", "Contact number": "Manager contact phone no", "email address": "Manager e-mail address" })
    },
    signatures: [{ label: "Employee signature", page: 1, x: 100, y: 466, w: 163, h: 20 }]
  },

  /* ---------------- HR 108(u) Unpaid Leave for Medical Care Purposes ---------------- */
  {
    id: "hr108u", code: "HR 108(u)", title: "Unpaid Leave for Medical Care Purposes",
    file: "forms/Unpaid_Leave_for_Medical_Care_Purposes.pdf", url: HSE + "3006/Unpaid_Leave_for_Medical_Care_Purposes.pdf",
    match: (n, t) => titled(t, /medical care purposes/i) || has(n, "Please give a statement of the facts entitling you"),
    fields: {
      ...head({ surname: "Surname", first: "First Name", grade: "Grade", number: "Personnel", base: "Location", pps: "PPSN", today: "Date" }),
      "CheckBox5": { label: "Person in need of care: someone of whom I am the relevant parent" },
      "CheckBox6": { label: "Person in need of care: my spouse or civil partner" },
      "CheckBox7": { label: "Person in need of care: my cohabitant" },
      "CheckBox8": { label: "Person in need of care: my parent or grandparent" },
      "CheckBox9": { label: "Person in need of care: my brother or sister" },
      "Please give a statement of the facts entitling you": { label: "Statement of the facts entitling you to the leave", long: true },
      "Number of working days": { label: "Number of working days" },
      "from16":    { label: "From", date: true },
      "from17":    { label: "To", date: true },
      "Signature": { label: "Employee signature" },
      ...mgr({ "Surname-0": "Manager surname", "First Name-0": "Manager first name", "Grade-0": "Manager grade",
               "Textfield-18": "Manager contact phone no", "Date 19": "Manager date" }),
      "Textfield-17": { label: "Manager signature", others: true, type: "signature" },
      ...hide("Textfield-15")
    }
  }
];

// Forms on the HSE list that aren't built in yet (no fillable PDF here).
const OTHER_HSE_FORMS = [
  { code: "HR 108(b)", title: "Anticipation of Annual Leave", url: HSE + "757/HR_108b_anticipation_of_annual_leave_application_form.pdf" },
  { code: "HR 108(l)", title: "Reserve Defence Forces Leave", url: HSE + "776/HR_108l_employee_application_form_for_reserve_defence_forces_leave.pdf", note: "not fillable" },
  { code: "HR 108(o)", title: "Special Unpaid Leave", url: HSE + "774/HR_108o_employee_application_form_for_unpaid_leave.pdf" },
  { code: "HR 110", title: "Special Leave with Nominal Pay", url: HSE + "768/HR_110_application_for_special_leave_with_nominal_pay.pdf" },
  { code: "HR 117", title: "Breastfeeding Breaks", url: HSE + "419/hr117-breastfeeding-breaks-application-form.doc", note: "Word document" },
  { code: "HR 108(k1)", title: "Paternity Leave guidance", url: HSE + "761/hr-108k1-guide-to-assist-employees-when-applying-for-paternity-leave.docx", note: "guide" },
  { code: "All HR forms", title: "HSE HR forms page", url: "https://healthservice.hse.ie/staff/benefits-and-services/hr-forms" }
];
