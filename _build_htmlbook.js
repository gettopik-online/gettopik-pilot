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
  .page.hpage .qa-bar{position:absolute;z-index:5;display:flex;align-items:center;gap:8px;width:230px;height:34px;
    padding:0 11px 0 5px;border-radius:17px;background:#fff;border:1px solid #F3CDB6;box-shadow:0 3px 12px rgba(30,20,10,.16);
    font:700 12.5px/1 "Malgun Gothic",sans-serif;color:#3A2A20;user-select:none}
  .page.hpage .qa-bar .pp{flex:none;width:26px;height:26px;border:0;border-radius:50%;background:#F26B2A;color:#fff;cursor:pointer;
    display:flex;align-items:center;justify-content:center;padding:0}
  .page.hpage .qa-bar .pp svg{width:11px;height:11px}
  .page.hpage .qa-bar .pp:focus-visible,.page.hpage .qa-bar input:focus-visible{outline:2px solid #1968D8;outline-offset:2px}
  .page.hpage .qa-bar input{flex:1;min-width:0;height:18px;margin:0;background:transparent;cursor:pointer;-webkit-appearance:none;appearance:none}
  .page.hpage .qa-bar input::-webkit-slider-runnable-track{height:5px;border-radius:3px;
    background:linear-gradient(to right,#F26B2A 0 var(--p,0%),#F3DDD0 var(--p,0%) 100%)}
  .page.hpage .qa-bar input::-moz-range-track{height:5px;border-radius:3px;background:#F3DDD0}
  .page.hpage .qa-bar input::-moz-range-progress{height:5px;border-radius:3px;background:#F26B2A}
  .page.hpage .qa-bar input::-webkit-slider-thumb{-webkit-appearance:none;width:13px;height:13px;margin-top:-4px;border-radius:50%;
    background:#fff;border:2.5px solid #F26B2A}
  .page.hpage .qa-bar input::-moz-range-thumb{width:9px;height:9px;border-radius:50%;background:#fff;border:2.5px solid #F26B2A}
  .page.hpage .qa-bar .tm{flex:none;min-width:34px;text-align:right;font-variant-numeric:tabular-nums}
  .page.hpage .qa-bar.paused .pp{background:#8A94A6}
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
<script id="qa-v6">
(function(){
  // one recording at a time. Clicking a code plays it; a bar above the code shows play/pause, a line that can be
  // dragged or clicked to jump anywhere in the recording, and the time left. Clicking the code again pauses/resumes;
  // starting another code stops the first.
  var PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l12.5-7.5z"/></svg>',
      PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="5.5" y="4.5" width="4.5" height="15" rx="1"/><rect x="14" y="4.5" width="4.5" height="15" rx="1"/></svg>';
  var W = 230, H = 34, cur = null;                  // { btn, audio, bar, pp, range, tm, seeking }
  function fmt(t){ t = Math.max(0, Math.ceil(t || 0)); return Math.floor(t / 60) + ":" + ("0" + t % 60).slice(-2); }
  function draw(){
    if (!cur) return;
    var a = cur.audio, d = a.duration || 0;
    if (cur.shown !== a.paused) {                  // redraw the icon only when the state flips, so a click in progress lands
      cur.shown = a.paused;
      cur.pp.innerHTML = a.paused ? PLAY : PAUSE;
      cur.pp.title = cur.pp.ariaLabel = a.paused ? "Davom ettirish" : "Pauza";
    }
    cur.bar.classList.toggle("paused", a.paused);
    cur.btn.classList.toggle("on", !a.paused);
    if (d) {
      cur.range.max = d;
      if (!cur.seeking) cur.range.value = a.currentTime;
      cur.range.style.setProperty("--p", (100 * cur.range.value / d) + "%");
      cur.tm.textContent = fmt(d - cur.range.value);
    } else cur.tm.textContent = "…";
  }
  function stop(){
    if (!cur) return;
    cur.audio.pause(); cur.audio.removeAttribute("src"); cur.audio.load();
    cur.bar.remove(); cur.btn.classList.remove("on"); cur = null;
  }
  function start(btn){
    stop();
    var page = btn.parentNode, audio = new Audio(btn.dataset.src), bar = document.createElement("div");
    bar.className = "qa-bar";
    bar.innerHTML = '<button type="button" class="pp"></button><input type="range" min="0" max="1" step="0.05" value="0" ' +
      'aria-label="Audio joyi"><span class="tm">…</span>';
    // above the code, kept inside the page
    var cx = btn.offsetLeft + btn.offsetWidth / 2, top = btn.offsetTop - H - 8;
    if (top < 4) top = btn.offsetTop + btn.offsetHeight + 8;
    bar.style.left = Math.max(6, Math.min(cx - W / 2, page.offsetWidth - W - 6)) + "px";
    bar.style.top = top + "px";
    page.appendChild(bar);
    cur = { btn: btn, audio: audio, bar: bar, pp: bar.querySelector(".pp"), range: bar.querySelector("input"),
            tm: bar.querySelector(".tm"), seeking: false, shown: null };
    var c = cur;
    ["play", "pause", "timeupdate", "loadedmetadata", "durationchange"].forEach(function(ev){ audio.addEventListener(ev, draw); });
    audio.addEventListener("ended", stop);
    audio.addEventListener("error", function(){ if (cur === c) { c.tm.textContent = "xato"; btn.classList.remove("on"); } });
    c.range.addEventListener("pointerdown", function(){ c.seeking = true; });
    c.range.addEventListener("input", function(){ c.seeking = true; draw(); });
    c.range.addEventListener("change", function(){ audio.currentTime = +c.range.value; c.seeking = false; draw(); });
    c.range.addEventListener("pointerup", function(){ audio.currentTime = +c.range.value; c.seeking = false; });
    c.pp.addEventListener("click", function(e){ e.stopPropagation(); toggle(); });
    bar.addEventListener("click", function(e){ e.stopPropagation(); });
    draw();
    audio.play().catch(function(){ draw(); });
  }
  function toggle(){ if (cur.audio.paused) cur.audio.play(); else cur.audio.pause(); }
  document.addEventListener("click", function(e){
    var b = e.target.closest && e.target.closest(".qa");
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
