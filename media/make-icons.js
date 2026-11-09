// Renders the FiNASh Time app icons (from the design canvas's "Final logo: breakout" board) to PNG.
const { chromium } = require("playwright");
const OUT = process.argv[2];
// The app icon's mark, in a 96×96 box (white breakout ring with 12/3/6/9 marks, orange tick).
const mark = (detail = true) => `
  <circle cx="46" cy="50" r="30" fill="none" stroke="#FFFFFF" stroke-width="${detail ? 5 : 8}" stroke-dasharray="155 33" stroke-linecap="round"/>
  ${detail ? `<line x1="46" y1="24" x2="46" y2="28" stroke="#FFFFFF" stroke-width="3.5" stroke-linecap="round"/>
  <line x1="72" y1="50" x2="68" y2="50" stroke="#FFFFFF" stroke-width="3.5" stroke-linecap="round"/>
  <line x1="46" y1="76" x2="46" y2="72" stroke="#FFFFFF" stroke-width="3.5" stroke-linecap="round"/>
  <line x1="20" y1="50" x2="24" y2="50" stroke="#FFFFFF" stroke-width="3.5" stroke-linecap="round"/>` : ""}
  <path d="M35 52 L44 61 L76 22" fill="none" stroke="#FF9F1C" stroke-width="${detail ? 8 : 12}" stroke-linecap="round" stroke-linejoin="round"/>`;
const icons = [
  // name, size, rounded corners?, scale of the mark (maskable keeps it inside the safe zone), detail
  ["icon-512.png", 512, true, 1, true],
  ["icon-192.png", 192, true, 1, true],
  ["icon-maskable-512.png", 512, false, 0.78, true],
  ["apple-touch-icon.png", 180, false, 0.92, true],
  ["favicon-32.png", 32, true, 1, false],
];
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  for (const [name, size, rounded, scale, detail] of icons) {
    const t = `translate(${48 * (1 - scale)} ${48 * (1 - scale)}) scale(${scale})`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 96 96">
      <rect width="96" height="96" ${rounded ? 'rx="22"' : ""} fill="#2D1B4E"/><g transform="${t}">${mark(detail)}</g></svg>`;
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
    await p.locator("svg").screenshot({ path: `${OUT}/${name}`, omitBackground: true });
    if (name === "icon-512.png") require("fs").writeFileSync(`${OUT}/icon.svg`, svg.replace(/width="512" height="512"/, 'width="96" height="96"'));
    console.log(name, size);
  }
  await b.close();
})();
