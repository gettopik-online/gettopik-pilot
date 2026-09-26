// Assemble an HTML-text teacher book from <dir>/<key>.pages.json (made by _pdf2html.py): each page is its
// text-free background picture with the words laid on top as real HTML text, inside the usual teacher
// shell (page navigation, zoom, pinch, draw tools).
//
//   node _build_htmlbook.js <dir> <key> <out.html> "<title>"
const fs = require("fs");
const [dir, key, outFile, title] = process.argv.slice(2);
process.chdir("D:/Users/User/Documents/topik mock/gh-site");

const PT = 96 / 72;                                     // PDF points -> CSS px
const pages = JSON.parse(fs.readFileSync(`${dir}/${key}.pages.json`, "utf8"));
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const px = (v) => (v * PT).toFixed(2) + "px";

// audio QR codes found by _find_qr.py: a clickable spot over each code plays its recording
const qrFile = `${dir}/${key}.qr.json`;
const qrs = (fs.existsSync(qrFile) ? JSON.parse(fs.readFileSync(qrFile, "utf8")) : [])
  .filter((q) => q.yt && fs.existsSync(`audio/${key}/${q.yt}.mp3`));

const pageHtml = pages.map((p, i) => {
  const runs = p.runs.map((r) => {
    const st = [
      `left:${px(r.x)}`, `top:${px(r.y)}`, `font-size:${px(r.s)}`, `line-height:${px(r.h)}`,
      r.b ? "font-weight:700" : "", r.c !== "#000000" ? `color:${r.c}` : "",
      r.r ? `--rot:${r.r}deg` : "",
    ].filter(Boolean).join(";");
    return `<span class="t" style="${st}" data-w="${(r.w * PT).toFixed(2)}">${esc(r.t)}</span>`;
  }).join("");
  const qa = qrs.filter((q) => q.page === i + 1).map((q) =>
    `<button type="button" class="qa" data-src="audio/${key}/${q.yt}.mp3" title="Audioni tinglash" aria-label="Audioni tinglash" ` +
    `style="left:${px(q.x - 3)};top:${px(q.y - 3)};width:${px(q.w + 6)};height:${px(q.h + 6)}"></button>`).join("");
  return `<div class="page hpage" data-key="p${i + 1}" style="height:${px(p.h)}"><img class="pbg" src="${dir}/${p.bg}" loading="lazy" decoding="async" alt="">${runs}${qa}</div>`;
});

const css = `
  .page.hpage{padding:0;position:relative;overflow:hidden;background-color:#fff;background-size:100% 100%;background-repeat:no-repeat}
  .page.hpage .t{position:absolute;white-space:pre;transform-origin:0 0;
    font-family:"Malgun Gothic","맑은 고딕","Noto Sans KR","Apple SD Gothic Neo",sans-serif;color:#231F20;
    -webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}
  .page.hpage .qa{position:absolute;z-index:3;padding:0;margin:0;border:0;border-radius:8px;background:transparent;cursor:pointer;
    box-shadow:0 0 0 2px rgba(242,107,42,.35);transition:box-shadow .15s ease,background .15s ease}
  .page.hpage .qa:hover{background:rgba(242,107,42,.10);box-shadow:0 0 0 3px rgba(242,107,42,.8)}
  .page.hpage .qa:focus-visible{outline:3px solid #1968D8;outline-offset:2px}
  .page.hpage .qa.on{background:rgba(242,107,42,.14);box-shadow:0 0 0 4px #F26B2A;animation:qaPulse 1.6s ease-in-out infinite}
  @keyframes qaPulse{50%{box-shadow:0 0 0 7px rgba(242,107,42,.45)}}
  @media (prefers-reduced-motion:reduce){.page.hpage .qa.on{animation:none}}
  .page.hpage .qa-pill{position:absolute;z-index:4;transform:translateX(-50%);display:inline-flex;align-items:center;gap:5px;
    height:24px;padding:0 10px 0 7px;border-radius:12px;background:#F26B2A;color:#fff;font:700 12.5px/1 "Malgun Gothic",sans-serif;
    font-variant-numeric:tabular-nums;box-shadow:0 2px 8px rgba(242,107,42,.35);cursor:pointer;white-space:nowrap;user-select:none}
  .page.hpage .qa-pill svg{width:12px;height:12px}
  .page.hpage .qa-pill.paused{background:#8A94A6;box-shadow:none}
`;

// fit every run to the width it has in the book, so lines end exactly where they did in print
const fitJs = `
<script id="fit-v2">
(function(){
  function fitPage(pg){
    var els = pg.querySelectorAll(".t"), w = [], i;
    for (i = 0; i < els.length; i++) w.push(els[i].offsetWidth);   // offsetWidth ignores transforms
    for (i = 0; i < els.length; i++) {
      var el = els[i], target = +el.dataset.w, natural = w[i];
      var rot = el.style.getPropertyValue("--rot");
      var sx = (natural > 0 && target > 0) ? target / natural : 1;
      if (Math.abs(sx - 1) < 0.01) sx = 1;
      el.style.transform = (rot ? "rotate(" + rot + ") " : "") + (sx !== 1 ? "scaleX(" + sx.toFixed(4) + ")" : "");
    }
  }
  function start(){
    var pages = document.querySelectorAll(".page.hpage");
    if (!("IntersectionObserver" in window)) { pages.forEach(fitPage); return; }
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(e){ if (e.isIntersecting) { io.unobserve(e.target); fitPage(e.target); } });
    }, { root: document.getElementById("stage-outer"), rootMargin: "1500px 0px" });
    pages.forEach(function(p){ io.observe(p); });
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(start); else window.addEventListener("load", start);
})();
</script>
`;

const qaJs = `
<script id="qa-v4">
(function(){
  // one recording at a time: clicking a code plays it, clicking it (or its time pill) again pauses and resumes;
  // starting another code stops the first. A pill under the code shows the time left.
  var PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l12.5-7.5z"/></svg>',
      PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="5.5" y="4.5" width="4.5" height="15" rx="1"/><rect x="14" y="4.5" width="4.5" height="15" rx="1"/></svg>';
  var cur = null;                                   // { btn, audio, pill }
  function fmt(t){ t = Math.max(0, Math.ceil(t || 0)); return Math.floor(t / 60) + ":" + ("0" + t % 60).slice(-2); }
  function draw(){
    if (!cur) return;
    var a = cur.audio, left = (a.duration || 0) - a.currentTime;
    cur.pill.innerHTML = (a.paused ? PLAY : PAUSE) + "<span>" + (a.duration ? fmt(left) : "…") + "</span>";
    cur.pill.classList.toggle("paused", a.paused);
    cur.btn.classList.toggle("on", !a.paused);
  }
  function stop(){
    if (!cur) return;
    cur.audio.pause(); cur.audio.removeAttribute("src"); cur.audio.load();
    cur.pill.remove(); cur.btn.classList.remove("on"); cur = null;
  }
  function start(btn){
    stop();
    var pill = document.createElement("span"), audio = new Audio(btn.dataset.src);
    pill.className = "qa-pill"; pill.setAttribute("role", "button"); pill.title = "To'xtatish / davom ettirish";
    pill.style.left = (btn.offsetLeft + btn.offsetWidth / 2) + "px";
    pill.style.top = (btn.offsetTop + btn.offsetHeight + 6) + "px";
    btn.parentNode.appendChild(pill);
    cur = { btn: btn, audio: audio, pill: pill };
    ["play", "pause", "timeupdate", "loadedmetadata"].forEach(function(ev){ audio.addEventListener(ev, draw); });
    audio.addEventListener("ended", stop);
    audio.addEventListener("error", function(){ if (cur && cur.audio === audio) { pill.innerHTML = "<span>Audio ochilmadi</span>"; btn.classList.remove("on"); } });
    draw();
    audio.play().catch(function(){ draw(); });
  }
  function toggle(){ if (cur.audio.paused) cur.audio.play(); else cur.audio.pause(); }
  document.addEventListener("click", function(e){
    if (!e.target.closest) return;
    var pill = e.target.closest(".qa-pill");
    if (pill && cur && cur.pill === pill) { e.preventDefault(); toggle(); return; }
    var b = e.target.closest(".qa");
    if (!b) return;
    e.preventDefault();
    if (cur && cur.btn === b) toggle(); else start(b);
  });
  document.addEventListener("keydown", function(e){ if (e.key === "Escape") stop(); });
})();
</script>
`;

const tpl = fs.readFileSync("yozish.html", "utf8");
const lines = tpl.split("\n");
const coverLine = lines.findIndex((l) => l.includes('data-key="cover"'));
const firstImg = lines.findIndex((l) => l.includes('class="page imgpage"'));
const lastImg = lines.length - 1 - [...lines].reverse().findIndex((l) => l.includes('class="page imgpage"'));
if (coverLine < 0 || firstImg < 0) throw new Error("template markers not found");

let out = [...lines.slice(0, coverLine), ...pageHtml, ...lines.slice(lastImg + 1)].join("\n");
out = out.replace("</style>", css + "</style>");
out = out.replace("</body>", fitJs + (qrs.length ? qaJs : "") + "</body>");
// no tap-to-translate on these books: skip the dictionary pass over book pages
out = out.replace("    var root = pagesEls[key];", "    var root = pagesEls[key];\n    if (root.classList.contains(\"hpage\")) return;");
const order = pages.map((_, i) => "p" + (i + 1));
const titles = Object.fromEntries(pages.map((p, i) => ["p" + (i + 1), "Sahifa " + p.n]));
out = out.replace(/ {2}var ORDER = \[[^\]]*\];/, "  var ORDER = " + JSON.stringify(order) + ";");
out = out.replace(/ {2}var TITLES = \{[^\n]*\};/, "  var TITLES = " + JSON.stringify(titles) + ";");
out = out.replace(/<title>[^<]*<\/title>/, `<title>GETTOPIK · ${title}</title>`);
fs.writeFileSync(outFile, out);
console.log(`${outFile}: ${pages.length} sahifa, ${pages.reduce((a, p) => a + p.runs.length, 0)} ta matn bo'lagi, ${qrs.length} ta audio QR, ${(out.length / 1024).toFixed(0)} KB`);
