// Records the Timesheet Hub explainer: drives the app at phone size with caption overlays.
//   node media/record-explainer.js <output folder>            → the full explainer (~2½ min)
//   node media/record-explainer.js <output folder> --short    → the 30-second highlight reel
//                                                                (convert it with setpts=PTS/1.35 to play at 1.35×)
// (serve the repo first: python3 -m http.server 8123)
const { chromium } = require("playwright");
const OUT = process.argv[2];
const SHORT = process.argv.includes("--short");
const BASE = "http://localhost:8123/index.html";

const OVERLAY = () => {
  const css = document.createElement("style");
  css.textContent = `
    .ov { border: 0; padding: 0; margin: 0; background: transparent; overflow: visible; pointer-events: none; }
    .ov:not(:popover-open) { display: none !important; }
    .ov-cap { inset: auto 12px 22px 12px; width: auto; padding: 13px 15px; border-radius: 14px; background: rgba(12,20,28,.93); color: #fff;
      font: 600 17px/1.35 system-ui, -apple-system, Segoe UI, sans-serif; box-shadow: 0 8px 30px rgba(0,0,0,.35); }
    .ov-cap small { display: block; font-weight: 400; font-size: 14px; opacity: .85; margin-top: 3px; }
    .ov-card { inset: 0; width: 100vw; height: 100vh; max-width: none; max-height: none; display: grid; place-items: center; text-align: center;
      background: linear-gradient(160deg, #0b5f73, #0a3d4a); color: #fff; font-family: system-ui, -apple-system, sans-serif; }
    .ov-card h1 { font-size: 34px; margin: 0 0 10px; } .ov-card p { font-size: 18px; margin: 6px 24px; opacity: .92; line-height: 1.4; }
    .ov-card .ov-badge { display: inline-block; margin-top: 18px; padding: 6px 12px; border-radius: 999px; background: rgba(255,255,255,.15); font-size: 14px; }
    .ov-mail { inset: 70px 14px auto 14px; width: auto; border-radius: 14px; background: #fff; color: #17212b; box-shadow: 0 14px 50px rgba(0,0,0,.45);
      font: 14px/1.45 system-ui, -apple-system, sans-serif; overflow: hidden; }
    .ov-mail header { background: #0b5f73; color: #fff; padding: 10px 14px; font-weight: 700; font-size: 15px; }
    .ov-mail .row { padding: 7px 14px; border-bottom: 1px solid #e3e8ec; } .ov-mail .row b { color: #5d6b78; font-weight: 600; margin-right: 6px; }
    .ov-mail pre { margin: 0; padding: 10px 14px 14px; font: inherit; white-space: pre-wrap; }
    .ov-tap { inset: auto; width: 46px; height: 46px; border-radius: 50%; border: 4px solid #ffb703; background: rgba(255,183,3,.18); pointer-events: none;
      transition: transform .35s, opacity .35s; }`;
  document.head.appendChild(css);
  const mk = cls => { const el = document.createElement("div"); el.className = `ov ${cls}`; el.popover = "manual"; document.body.appendChild(el); return el; };
  const cap = mk("ov-cap"), card = mk("ov-card"), mail = mk("ov-mail"), tap = mk("ov-tap");
  const top = el => { try { el.hidePopover(); } catch {} el.showPopover(); };
  const esc = s => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  window.__ov = {
    cap(t, sub = "") { if (!t) { try { cap.hidePopover(); } catch {} return; } cap.innerHTML = esc(t) + (sub ? `<small>${esc(sub)}</small>` : ""); top(cap); },
    card(html) { if (!html) { try { card.hidePopover(); } catch {} return; } card.innerHTML = `<div>${html}</div>`; top(card); },
    mail(m) { if (!m) { try { mail.hidePopover(); } catch {} return; }
      mail.innerHTML = `<header>✉️ ${esc(m.title || "Email ready to send")}</header>${m.to ? `<div class="row"><b>To</b>${esc(m.to)}</div>` : ""}${m.cc ? `<div class="row"><b>CC</b>${esc(m.cc)}</div>` : ""}<div class="row"><b>Subject</b>${esc(m.subject)}</div><pre>${esc(m.body)}</pre>`;
      top(mail); if (cap.matches(":popover-open")) top(cap); },
    tap(x, y) { tap.style.left = (x - 23) + "px"; tap.style.top = (y - 23) + "px"; tap.style.transform = "scale(1)"; tap.style.opacity = "1"; top(tap);
      setTimeout(() => { tap.style.transform = "scale(1.5)"; tap.style.opacity = "0"; }, 420); setTimeout(() => { try { tap.hidePopover(); } catch {} }, 800); },
    raise() { if (cap.matches(":popover-open")) top(cap); }
  };
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true,
    recordVideo: { dir: OUT, size: { width: 780, height: 1688 } } });
  const page = await ctx.newPage();
  page.on("dialog", d => d.accept());
  page.on("pageerror", e => console.log("PAGE ERROR", e.message));
  await page.clock.setFixedTime(new Date("2026-11-09T09:00:00"));
  await page.addInitScript(() => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    const c = document.createElement("canvas"); c.width = 360; c.height = 90; const g = c.getContext("2d");
    g.fillStyle = "#1b2a6b"; g.font = "italic 46px Georgia, serif"; g.fillText("Alex Sample", 12, 60);
    localStorage.setItem("timesheetHub_v1", JSON.stringify({ profile: {
      name: "Alex Sample", number: "12345678", grade: "Paramedic", dept: "NAS West", base: "NEOC", pps: "1234567AB", phone: "0871234567",
      meEmail: "alex.sample@example.ie", meDefault: true, contacts: [{ id: "c1", role: "orm", name: "Pat Murphy", email: "pat.murphy@example.ie", default: true }],
      rosterId: "neoc-a", rosterAnchor: "2026-11-09", rosterAnchorLine: 7, signatureMode: "draw", signatureImage: c.toDataURL("image/png"),
      leave: { to: "workforce.planning@example.ie", ccMe: true, alH: "179.4", bhH: "78", yearStart: 4 }
    } }));
  });
  await page.goto(BASE);
  await page.evaluate(OVERLAY);
  await page.evaluate(() => { window.openMail = m => { window.__lastMail = m; }; });   // the leave email is shown as a card instead
  const P = SHORT ? 0.5 : 1;                                   // pace: the highlight reel moves twice as fast
  const wait = ms => page.waitForTimeout(Math.round(ms * P));
  const say = (t, sub = "") => page.evaluate(([t, s]) => window.__ov.cap(t, s), [t, SHORT ? "" : sub]);
  const raise = () => page.evaluate(() => window.__ov.raise());
  const show = async sel => { await page.locator(sel).first().evaluate(el => el.scrollIntoView({ behavior: "smooth", block: "center" })); await wait(700); };
  const tap = async (sel, opts = {}) => {
    const el = page.locator(sel).first();
    await el.evaluate(e => e.scrollIntoView({ behavior: "smooth", block: "center" })); await wait(500);
    const b = await el.boundingBox();
    if (b) await page.evaluate(([x, y]) => window.__ov.tap(x, y), [b.x + b.width / 2, b.y + b.height / 2]);
    await wait(450); await el.click(opts); await wait(350);
  };
  const pick = async (sel, value) => { await page.selectOption(sel, value); await wait(500); };
  const mailCard = async (m, title) => { await page.evaluate(([m, t]) => window.__ov.mail({ ...m, title: t }), [m, title]); await raise(); };

  // 0. Title
  await page.evaluate(short => window.__ov.card(short
    ? `<h1>Timesheet Hub</h1><p>Your timesheet, leave and HSE forms — done in minutes</p>`
    : `<h1>Timesheet Hub</h1><p>Weekly timesheets, leave and HSE forms — on your phone</p><span class="ov-badge">For NAS staff · works offline</span>`), SHORT);
  await wait(SHORT ? 4400 : 3800);
  await page.evaluate(() => window.__ov.card(""));

  // 1. Roster once (full only)
  if (!SHORT) {
    await tap('[data-tab="profile"]');
    await show("#pRoster");
    await say("Set your roster once in My details", "Fixed roster and line — or Non-rostered and enter your own shifts");
    await wait(3800);
    await tap('[data-tab="timesheet"]');
    await say("Start a week…", "It already knows your roster for that week");
    await show("#weekRoster"); await wait(2600);
  }

  // 2. Pre-filled timesheet
  await tap("#startBtn");
  await say(SHORT ? "Your week, filled in from your roster" : "…and it's filled in from your roster", "Shifts in, rest days ready to confirm with one tap");
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" })); await wait(1500);
  await show('[data-day-card="2"]'); await wait(2200);

  // 3. A week of Parent's Leave (taken in week blocks) → its form, with the week filled in
  await say("A week of Parent's Leave?", "Quick fill: tap the week's shifts, choose Parent's Leave");
  await page.evaluate(() => { $("quickFill").open = true; window.scrollTo({ top: 0, behavior: "smooth" }); });
  await show("#dayChips");
  for (const i of [0, 2, 3, 4]) await tap(`#dayChips [data-chip="${i}"]`);
  await pick("#qShift", "keep");
  await pick("#qActual", "leave:Parent's Leave");
  await tap("#applyBtn");
  await page.evaluate(() => { ui.expanded.clear(); ui.expanded.add(0); renderTimesheet(); });
  await show('[data-day-card="0"] .leave-form');
  await say("The leave offers the right HSE form", "HR 108(t) Parent's Leave · week block 09/11 – 15/11"); await wait(3000);
  await tap('[data-day-card="0"] [data-leave-form]');
  await page.waitForSelector("#formEditor:not([hidden])");
  await say(SHORT ? "Opens with your details and the leave dates in" : "It opens with your details and the leave dates filled in",
    "Name, personnel no, PPS — and Week one: 09/11 to 15/11/2026"); await wait(1200);
  await show('#formEditor [data-ff="week one date"]'); await wait(SHORT ? 3600 : 3400);
  await tap("#formEditor [data-form-make]");
  await page.waitForFunction(() => !!fx.file);
  await show("#formOut");
  await say("Signed — with a pre-written email"); await wait(700);
  await mailCard({ ...(await page.evaluate(() => formEmail())), to: "pat.murphy@example.ie" }, "Form email");
  await wait(SHORT ? 8400 : 4800);
  await page.evaluate(() => window.__ov.mail(null));
  if (!SHORT) {
    await tap('[data-tab="timesheet"]');
    await show('[data-day-card="0"] .leave-form');
    await say("Back on the timesheet, the leave shows the form is done"); await wait(3200);
  }

  // 4. Maternity form → timesheets (full only)
  if (!SHORT) {
    await tap('[data-tab="forms"]');
    await say("18 official HSE forms are built in", "Each set up box by box"); await show("#builtinForms"); await wait(3000);
    await tap('[data-form-fill="builtin:hr108i"]');
    await page.waitForSelector("#formEditor:not([hidden])");
    await say("Save a Maternity Leave form…");
    await show('#formEditor [data-ff="Maternity Leave-7"]');
    await page.fill('#formEditor [data-ff="Maternity Leave-7"]', "01/03/2027"); await wait(600);
    await page.fill('#formEditor [data-ff="Maternity Leave-13"]', "29/08/2027"); await wait(1400);
    await tap("#formEditor [data-form-make]");
    await page.waitForFunction(() => !!fx.file);
    await show("#formLeave");
    await say("…and the dates go onto your timesheets", "Every rostered shift from 01/03/2027 marked as Maternity Leave"); await wait(4200);
  }

  // 5. Leave tracker
  await tap('[data-tab="leave"]');
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await say(SHORT ? "Annual leave tracker" : "The annual leave tracker", "NAS policy NASPO36: 179.4h + 78h bank holidays, leave year April–March"); await wait(SHORT ? 4400 : 4000);
  if (!SHORT) {
    await show("#leaveSummary .lv-stats");
    await say("Taken, booked and left — at a glance"); await wait(2800);
    await show("#leaveBlocks");
    await say("Structured leave blocks: Summer, Autumn, Spring", "Any 7 days in a row counts as a block week"); await wait(3800);
    await show("#leaveReminder");
    await say("It reminds you when a block is due", "Spring applications are open until 30/11"); await wait(3000);
  }

  // 6. Book an annual leave block
  await tap("#leaveReminder [data-lv-block]");
  await page.fill("#lvFrom", "2027-01-08"); await page.dispatchEvent("#lvFrom", "change"); await wait(500);
  await page.fill("#lvToDate", "2027-01-14"); await page.dispatchEvent("#lvToDate", "change"); await wait(600);
  await show("#leaveEditor .lv-shifts");
  await say(SHORT ? "Book an annual leave week" : "Book a week of annual leave: shifts and hours worked out", "Fri 08/01 – Thu 14/01 · a full Spring block week"); await wait(SHORT ? 4000 : 4200);
  await tap("[data-lv-send]");
  await mailCard(await page.evaluate(() => window.__lastMail), "Leave request");
  await say(SHORT ? "Pre-written email to workforce planning" : "One tap: a pre-written email to workforce planning"); await wait(SHORT ? 9000 : 5500);
  await page.evaluate(() => window.__ov.mail(null));
  if (!SHORT) {
    await show("#leaveList .lv-item");
    await say("Tracked here: approve, cancel or add it to your calendar"); await wait(3200);
  }
  if (!SHORT) {
  await tap('[data-tab="timesheet"]');
  await page.evaluate(() => { state.currentId = null; renderTimesheet(); });
  await page.fill("#weekEnding", "2027-01-10"); await page.dispatchEvent("#weekEnding", "change");
  await tap("#startBtn");
  await say(SHORT ? "…and it's on your timesheet" : "…and it's already on the timesheet for that week", "Friday 08/01: Annual Leave, requested by email"); await wait(800);
  await page.evaluate(() => { ui.expanded.clear(); ui.expanded.add(4); renderTimesheet(); });
  await show('[data-day-card="4"] .leave-form'); await wait(3800);
  }

  // 7. Non-rostered (full only)
  if (!SHORT) {
    await tap('[data-tab="profile"]');
    await show("#pRoster");
    await say("Non-rostered? Choose 1, 2, 4 or 8 weeks…"); await wait(1500);
    await page.selectOption("#pRoster", "entered:4"); await wait(1200);
    await tap("#pEnteredWrap [data-roster-entry]");
    await page.waitForSelector("#rosterDialog[open]"); await raise();
    await say("…and enter your shifts when they come", "Station first, then that station's own shifts");
    await pick('[data-re-station="2026-11-09"]', "Sligo"); await raise();
    await pick('[data-re-shift="2026-11-09"]', "shift:21:00"); await raise();
    await pick('[data-re-shift="2026-11-10"]', "R"); await raise();
    await pick('[data-re-station="2026-11-11"]', "Manorhamilton"); await raise();
    await pick('[data-re-shift="2026-11-11"]', "shift:08:00"); await raise();
    await wait(2600);
    await page.evaluate(() => { $("rosterDialog").close(); Object.assign(state.profile, { rosterId: "neoc-a", rosterAnchor: "2026-11-09", rosterAnchorLine: 7 }); saveState(); renderRosterSettings(); });
  }

  // 8. Publish + email
  await tap('[data-tab="timesheet"]');
  await page.evaluate(() => { const s = state.sheets.find(x => x.weekEnding === "2026-11-15"); state.currentId = s.id; ui.expanded.clear(); renderTimesheet(); });
  await say(SHORT ? "Publish your timesheet…" : "When the week's done: Review & publish");
  await tap("#barPublish"); await wait(800);
  await page.check("#declaration"); await wait(600);
  await tap("#publishBtn");
  await page.waitForSelector("#publishedDialog[open]"); await raise();
  await say("A locked PDF of the official NAS timesheet"); await wait(SHORT ? 3000 : 2600);
  if (SHORT) await page.evaluate(() => { $("publishedDialog").close("email"); });
  else await tap('#publishedDialog button[value="email"]');
  await page.waitForSelector("#sendDialog[open]"); await raise();
  await say("…and its pre-written email to your manager", "Attached through your phone's share sheet"); await wait(1200);
  await show("#sendDialog .email-preview"); await raise(); await wait(SHORT ? 8000 : 4800);
  await page.evaluate(() => $("sendDialog").close());

  // 9. End
  await say("");
  await page.evaluate(() => window.__ov.card(`<h1>Timesheet Hub</h1><p>Roster-filled timesheets · leave tracker &amp; booker · HSE forms linked to your dates · pre-written emails</p><span class="ov-badge">ami793-eng.github.io/Timesheets</span>`));
  await wait(SHORT ? 6000 : 4200);
  const v = page.video();
  await ctx.close(); await browser.close();
  console.log("video:", await v.path());
})();
