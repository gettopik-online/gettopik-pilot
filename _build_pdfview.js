// Rebuild the 서울대 teacher pages as PDF viewers: the book's own PDF is drawn with PDF.js, so the
// text stays vector and is re-rendered whenever the teacher zooms — exactly as sharp as the original.
// The surrounding shell (page navigation, zoom, pinch, draw tools) is reused unchanged.
const fs = require("fs");
const { execFileSync } = require("child_process");

const SITE = "D:/Users/User/Documents/topik mock/gh-site";
const PDFINFO = "C:/Users/User/AppData/Local/Microsoft/WinGet/Packages/oschwartz10612.Poppler_Microsoft.Winget.Source_8wekyb3d8bbwe/poppler-25.07.0/Library/bin/pdfinfo.exe";
process.chdir(SITE);

const BOOKS = [
  ["sd1a", "서울대 한국어 1A"],
  ["sd1b", "서울대 한국어 1B"],
  ["sd2a", "서울대 한국어 2A"],
  ["sd2b", "서울대 한국어 2B"],
  ["sd3a", "서울대 한국어 3A"],
  ["sd3b", "서울대 한국어 3B"],
];

const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.6.82";

const viewerCss = `
  .page.pdfpage{padding:0;overflow:hidden;background:#fff;height:auto;aspect-ratio:var(--pw)/var(--ph)}
  .page.pdfpage .prev{position:absolute;inset:0;width:100%;height:100%;display:block;object-fit:fill}
  .page.pdfpage canvas{position:absolute;inset:0;display:block;width:100%;height:100%}
  #pdf-note{position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:60;background:#1E4E8C;color:#fff;
    font:600 14px/1.4 "Segoe UI",sans-serif;padding:9px 18px;border-radius:999px;box-shadow:0 6px 18px rgba(0,0,0,.18);transition:opacity .3s}
  #pdf-note.hidden{opacity:0;pointer-events:none}
  #pdf-note.error{background:#C4263B}
`;

const viewerJs = (key, pages) => `
<script type="module">
// Draw each page from the book's PDF at the resolution it is actually displayed at, so zooming in
// re-renders sharply instead of magnifying pixels.
// PDF.js 4 relies on Promise.withResolvers (Chrome 119+, Safari 17.4+); older browsers get a shim.
if (!Promise.withResolvers) Promise.withResolvers = function () { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const pdfjsLib = await import("${PDFJS}/pdf.min.mjs");
pdfjsLib.GlobalWorkerOptions.workerSrc = "${PDFJS}/pdf.worker.min.mjs";

const PAGES = ${pages};
const note = document.getElementById("pdf-note");
const pageEls = Array.from({ length: PAGES }, (_, i) => document.querySelector('.page[data-key="p' + (i + 1) + '"]'));
const rendered = new Map();          // page number -> scale it was drawn at
const inflight = new Map();          // page number -> running render task
let doc = null;

const cssWidth = () => pageEls[0].clientWidth || 794;
function targetScale(viewportWidth) {
  const stage = document.getElementById("stage-inner");
  const m = /scale\\(([\\d.]+)\\)/.exec(stage.style.transform || "");
  const shown = (m ? +m[1] : 1) * cssWidth() * (window.devicePixelRatio || 1);
  return Math.min(4.5, Math.max(1.2, shown / viewportWidth));
}

async function draw(n) {
  if (!doc) return;
  const el = pageEls[n - 1];
  const page = await doc.getPage(n);
  const base = page.getViewport({ scale: 1 });
  const scale = targetScale(base.width);
  if ((rendered.get(n) || 0) >= scale - 0.05) return;
  const running = inflight.get(n);
  if (running) { try { running.cancel(); } catch (e) {} inflight.delete(n); }
  const viewport = page.getViewport({ scale });
  const canvas = el.querySelector("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const task = page.render({ canvasContext: canvas.getContext("2d", { alpha: false }), viewport });
  inflight.set(n, task);
  try {
    await task.promise;
    rendered.set(n, scale);
    el.classList.remove("pending");
    note.classList.add("hidden");                    // the first sharp page is on screen
  } catch (e) {
    rendered.delete(n);            // cancelled or failed — let a later pass retry
  } finally {
    if (inflight.get(n) === task) inflight.delete(n);
  }
}

// keep canvases only around the viewport; far pages give their memory back
function release(n) {
  if (inflight.has(n)) return;
  const c = pageEls[n - 1].querySelector("canvas");
  if (!c.width) return;
  c.width = c.height = 0;
  rendered.delete(n);
  pageEls[n - 1].classList.add("pending");
}

// pages on screen first, then the next few ahead (and one behind), so paging on shows a sharp page
function nearPages() {
  const onScreen = [];
  pageEls.forEach((el, i) => {
    const r = el.getBoundingClientRect();
    if (r.bottom > 0 && r.top < window.innerHeight) onScreen.push(i + 1);
  });
  if (!onScreen.length) return [];
  const lo = onScreen[0], hi = onScreen[onScreen.length - 1];
  const ahead = [];
  for (let n = hi + 1; n <= Math.min(PAGES, hi + 3); n++) ahead.push(n);
  if (lo > 1) ahead.push(lo - 1);
  return onScreen.concat(ahead);
}

let pass = 0;
async function refresh() {
  const mine = ++pass;
  const near = nearPages();
  const keep = new Set(near);
  for (let i = 0; i < near.length; i += 2) {
    if (mine !== pass) return;                       // a newer pass took over
    await Promise.all(near.slice(i, i + 2).map(draw));
  }
  if (!near.length) return;
  const lo = Math.min(...near), hi = Math.max(...near);
  rendered.forEach((_, n) => { if (!keep.has(n) && (n < lo - 4 || n > hi + 4)) release(n); });
}

let t = null;
const onChange = () => { clearTimeout(t); t = setTimeout(refresh, 180); };
document.getElementById("stage-outer").addEventListener("scroll", onChange, { passive: true });
window.addEventListener("resize", onChange);
new MutationObserver(onChange).observe(document.getElementById("stage-inner"), { attributes: true, attributeFilter: ["style"] });

(async () => {
  try {
    // linearized PDF + 1 MB range chunks: page 1 arrives in a couple of requests; after that the rest
    // of the book keeps downloading in the background, so later pages draw without waiting
    doc = await pdfjsLib.getDocument({ url: "books_pdf/${key}.pdf", rangeChunkSize: 1048576, disableAutoFetch: false }).promise;
    refresh();
  } catch (e) {
    note.textContent = "Kitob ochilmadi — sahifani yangilang (" + (e && e.message ? e.message : "xato") + ")";
    note.classList.add("error");
  }
})();
</script>
`;

for (const [key, name] of BOOKS) {
  const info = execFileSync(PDFINFO, [`books_pdf/${key}.pdf`]).toString();
  const pages = +info.match(/^Pages:\s+(\d+)/m)[1];
  // the page box takes the book's real proportions (3B is shorter than A4)
  const [pw, ph] = info.match(/^Page size:\s+([\d.]+) x ([\d.]+)/m).slice(1).map(Number);
  const src = fs.readFileSync(`${key}.html`, "utf8");
  const lines = src.split("\n");
  const first = lines.findIndex((l) => l.includes('class="page imgpage"') || l.includes('class="page pdfpage'));
  const lastIdx = lines.length - 1 - [...lines].reverse().findIndex((l) => l.includes('class="page imgpage"') || l.includes('class="page pdfpage'));
  // a light preview image shows the page at once; the sharp vector render is drawn over it
  const pad = (i) => String(i).padStart(String(pages).length < 3 ? 3 : String(pages).length, "0");
  const divs = Array.from({ length: pages }, (_, i) => `<div class="page pdfpage pending" data-key="p${i + 1}"><img class="prev" src="books_prev/${key}/p-${pad(i + 1)}.webp" alt="" loading="${i < 3 ? "eager" : "lazy"}" decoding="async"><canvas></canvas></div>`);
  if (first < 0) throw new Error(`${key}.html: no page divs found`);
  let out = [...lines.slice(0, first), ...divs, ...lines.slice(lastIdx + 1)].join("\n");

  // drop the viewer CSS / script a previous run added, so re-running never stacks copies
  out = out.replace(/\r?\n {2}\.page\.pdfpage\{[\s\S]*?#pdf-note\.(?:error|hidden)\{[^}]*\}(?:\r?\n {2}#pdf-note\.error\{[^}]*\})?/g, "");
  out = out.replace(/<script type="module">[\s\S]*?<\/script>\r?\n?(?=<\/body>)/g, "");
  out = out.replace(/\r?\n {2}:root\{--pw:[^}]*\}/g, "");
  out = out.replace("</style>", viewerCss + `  :root{--pw:${pw};--ph:${ph}}\n` + "</style>");
  if (!out.includes('id="pdf-note"')) out = out.replace('<div id="stage-outer">', '<div id="pdf-note"></div>\n<div id="stage-outer">');
  // the preview is already on screen, so the note only announces the sharp version
  out = out.replace(/<div id="pdf-note">[^<]*<\/div>/, `<div id="pdf-note">Tiniq ko'rinish yuklanmoqda…</div>`);
  out = out.replace("</body>", viewerJs(key, pages) + "</body>");

  const order = Array.from({ length: pages }, (_, i) => "p" + (i + 1));
  const titles = Object.fromEntries(order.map((k, i) => [k, "Sahifa " + (i + 1)]));
  out = out.replace(/ {2}var ORDER = \[[^\]]*\];/, "  var ORDER = " + JSON.stringify(order) + ";");
  out = out.replace(/ {2}var TITLES = \{[^\n]*\};/, "  var TITLES = " + JSON.stringify(titles) + ";");
  out = out.replace(/<title>[^<]*<\/title>/, `<title>GETTOPIK · ${name} — o'qituvchi nusxasi</title>`);

  fs.writeFileSync(`${key}.html`, out);
  console.log(`${key}.html — ${pages} sahifa, ${(out.length / 1024).toFixed(0)} KB`);
}
