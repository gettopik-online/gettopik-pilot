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
  .page.pdfpage{padding:0;overflow:hidden;background:#fff}
  .page.pdfpage canvas{display:block;width:100%;height:100%}
  .page.pdfpage.pending::after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(180deg,#fff,#fff 28px,#FAFBFD 28px,#FAFBFD 56px)}
  #pdf-note{position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:60;background:#0F1A2B;color:#fff;
    font:600 13px/1.4 "Segoe UI",sans-serif;padding:8px 16px;border-radius:999px;opacity:.92;transition:opacity .3s}
  #pdf-note.hidden{opacity:0;pointer-events:none}
`;

const viewerJs = (key, pages) => `
<script type="module">
// Draw each page from the book's PDF at the resolution it is actually displayed at, so zooming in
// re-renders sharply instead of magnifying pixels.
import * as pdfjsLib from "${PDFJS}/pdf.min.mjs";
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

function nearPages() {
  const out = [];
  pageEls.forEach((el, i) => {
    const r = el.getBoundingClientRect();
    if (r.bottom > -window.innerHeight && r.top < window.innerHeight * 2) out.push(i + 1);
  });
  return out;
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
  rendered.forEach((_, n) => { if (!keep.has(n) && (n < near[0] - 4 || n > near[near.length - 1] + 4)) release(n); });
}

let t = null;
const onChange = () => { clearTimeout(t); t = setTimeout(refresh, 180); };
document.getElementById("stage-outer").addEventListener("scroll", onChange, { passive: true });
window.addEventListener("resize", onChange);
new MutationObserver(onChange).observe(document.getElementById("stage-inner"), { attributes: true, attributeFilter: ["style"] });

(async () => {
  doc = await pdfjsLib.getDocument({ url: "books_pdf/${key}.pdf", disableAutoFetch: true, disableStream: false }).promise;
  note.classList.add("hidden");
  refresh();
})();
</script>
`;

for (const [key, name] of BOOKS) {
  const pages = +execFileSync(PDFINFO, [`books_pdf/${key}.pdf`]).toString().match(/^Pages:\s+(\d+)/m)[1];
  const src = fs.readFileSync(`${key}.html`, "utf8");
  const lines = src.split("\n");
  const first = lines.findIndex((l) => l.includes('class="page imgpage"') || l.includes('class="page pdfpage"'));
  const lastIdx = lines.length - 1 - [...lines].reverse().findIndex((l) => l.includes('class="page imgpage"') || l.includes('class="page pdfpage"'));
  const divs = Array.from({ length: pages }, (_, i) => `<div class="page pdfpage pending" data-key="p${i + 1}"><canvas></canvas></div>`);
  let out = [...lines.slice(0, first), ...divs, ...lines.slice(lastIdx + 1)].join("\n");

  out = out.replace("</style>", viewerCss + "</style>");
  out = out.replace('<div id="stage-outer">', '<div id="pdf-note">Kitob yuklanmoqda…</div>\n<div id="stage-outer">');
  out = out.replace(/<script type="module">[\s\S]*?<\/script>\n?(?=<\/body>)/, "");
  out = out.replace("</body>", viewerJs(key, pages) + "</body>");

  const order = Array.from({ length: pages }, (_, i) => "p" + (i + 1));
  const titles = Object.fromEntries(order.map((k, i) => [k, "Sahifa " + (i + 1)]));
  out = out.replace(/ {2}var ORDER = \[[^\]]*\];/, "  var ORDER = " + JSON.stringify(order) + ";");
  out = out.replace(/ {2}var TITLES = \{[^\n]*\};/, "  var TITLES = " + JSON.stringify(titles) + ";");
  out = out.replace(/<title>[^<]*<\/title>/, `<title>GETTOPIK · ${name} — o'qituvchi nusxasi</title>`);

  fs.writeFileSync(`${key}.html`, out);
  console.log(`${key}.html — ${pages} sahifa, ${(out.length / 1024).toFixed(0)} KB`);
}
