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
const qrs = fs.existsSync(qrFile) ? JSON.parse(fs.readFileSync(qrFile, "utf8")).filter((q) => q.yt) : [];

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
    `<button type="button" class="qa" data-yt="${q.yt}" data-pg="${p.n}" title="Audioni tinglash" aria-label="Audioni tinglash" ` +
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
  #qa-player{position:fixed;right:16px;bottom:56px;z-index:700;width:min(356px,calc(100vw - 16px));background:#1E2430;border-radius:12px;
    box-shadow:0 10px 32px rgba(10,16,30,.35);overflow:hidden;font-family:"Malgun Gothic",sans-serif;display:none;touch-action:none}
  #qa-player.open{display:block}
  #qa-player.drag{box-shadow:0 16px 44px rgba(10,16,30,.5);opacity:.96}
  #qa-player .hd{display:flex;align-items:center;gap:6px;height:34px;padding:0 4px 0 8px;color:#E8ECF3;font-size:12.5px;font-weight:700;
    cursor:grab;user-select:none}
  #qa-player.drag .hd{cursor:grabbing}
  #qa-player .hd .grip{width:14px;height:14px;color:#7D8798;flex:none}
  #qa-player .hd .ic{width:15px;height:15px;color:#FF9A5C;flex:none}
  #qa-player .hd .ttl{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #qa-player .hd button{width:28px;height:26px;border:0;border-radius:7px;background:transparent;color:#C9D0DC;cursor:pointer;
    display:inline-flex;align-items:center;justify-content:center;padding:0}
  #qa-player .hd button:hover{background:rgba(255,255,255,.12);color:#fff}
  #qa-player .hd button:focus-visible{outline:2px solid #8DB8FF;outline-offset:1px}
  #qa-player .hd button svg{width:15px;height:15px}
  #qa-player .fr{position:relative;width:100%;height:200px;background:#000}
  #qa-player iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
  /* docked: the book narrows and the player sits in its own column, covering nothing */
  #qa-col{display:none;position:fixed;top:0;right:0;bottom:44px;width:380px;z-index:690;background:#F2F4F8;border-left:1px solid #E1E5EC}
  #qa-col .note{position:absolute;left:24px;right:24px;top:270px;font:12.5px/1.5 "Malgun Gothic",sans-serif;color:#5B6474}
  body.qa-dock #qa-col{display:block}
  body.qa-dock #stage-outer{right:380px}
  body.qa-dock #draw-toolbar{right:396px}
  body.qa-dock #qa-player{left:auto!important;right:12px!important;top:12px!important;bottom:auto!important;box-shadow:0 4px 16px rgba(10,16,30,.18)}
  body.qa-dock #qa-player .hd{cursor:default}
  body.qa-dock #qa-player .grip, body.qa-dock #qa-player .mv{display:none}
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

// one small player for all codes: clicking a code plays it, clicking the same code again stops it
const qaJs = `
<div id="qa-col" aria-hidden="true"><div class="note">Audio tinglanmoqda. Pleyerni kitob ustida erkin joylashtirish uchun sarlavhadagi ⧉ tugmasini bosing.</div></div>
<div id="qa-player" role="region" aria-label="Audio">
  <div class="hd">
    <svg class="grip" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.7"/><circle cx="15" cy="6" r="1.7"/><circle cx="9" cy="12" r="1.7"/><circle cx="15" cy="12" r="1.7"/><circle cx="9" cy="18" r="1.7"/><circle cx="15" cy="18" r="1.7"/></svg>
    <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 14v-2a9 9 0 0 1 18 0v2"/><rect x="2.5" y="14" width="5" height="7" rx="1.5"/><rect x="16.5" y="14" width="5" height="7" rx="1.5"/></svg>
    <span class="ttl"></span>
    <button type="button" class="mv" title="Boshqa burchakka o'tkazish" aria-label="Boshqa burchakka o'tkazish"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6"/></svg></button>
    <button type="button" class="dk" title="" aria-label=""><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/></svg></button>
    <button type="button" class="x" title="Yopish" aria-label="Yopish"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
  </div>
  <div class="fr"></div>
</div>
<script id="qa-v3">
(function(){
  var box = document.getElementById("qa-player"), hd = box.querySelector(".hd"), frame = box.querySelector(".fr"),
      ttl = box.querySelector(".ttl"), dk = box.querySelector(".dk"), so = document.getElementById("stage-outer"),
      cur = null, M = innerWidth < 400 ? 8 : 12, BAR = 44, pos = null, corner = 0, mode = "dock";
  try { pos = JSON.parse(localStorage.getItem("qaPos") || "null"); mode = localStorage.getItem("qaMode") || "dock"; } catch (e) {}
  function canDock(){ return innerWidth >= 900; }
  function clamp(x, y){
    var w = box.offsetWidth, h = box.offsetHeight;
    return [Math.max(M, Math.min(x, innerWidth - w - M)), Math.max(M, Math.min(y, innerHeight - BAR - h - M))];
  }
  function place(x, y, save){
    var c = clamp(x, y); pos = { x: c[0], y: c[1] };
    box.style.left = c[0] + "px"; box.style.top = c[1] + "px"; box.style.right = "auto"; box.style.bottom = "auto";
    if (save) try { localStorage.setItem("qaPos", JSON.stringify(pos)); } catch (e) {}
  }
  function toCorner(i){                       // 0 bottom-right, 1 bottom-left, 2 top-left, 3 top-right
    var right = i === 0 || i === 3, bottom = i < 2;
    place(right ? innerWidth : 0, bottom ? innerHeight : 0, true);
  }
  // narrowing or widening the book keeps the reader on the same spot of the same page
  function setDock(on){
    if (document.body.classList.contains("qa-dock") === on) return;
    var ratio = so.scrollHeight ? so.scrollTop / so.scrollHeight : 0;
    document.body.classList.toggle("qa-dock", on);
    dispatchEvent(new Event("resize"));
    so.scrollTop = ratio * so.scrollHeight;
  }
  function layout(){
    var dock = box.classList.contains("open") && mode === "dock" && canDock();
    setDock(dock);
    dk.title = dk.ariaLabel = mode === "dock" ? "Kitob ustida erkin joylashtirish" : "Yon ustunga joylashtirish";
    dk.style.display = canDock() ? "" : "none";
    if (!dock && box.classList.contains("open")) { if (pos) place(pos.x, pos.y); else toCorner(0); }
  }
  function stop(){
    frame.innerHTML = ""; box.classList.remove("open");
    if (cur) cur.classList.remove("on"); cur = null;
    layout();
  }
  function play(btn){
    if (cur === btn) { stop(); return; }
    if (cur) cur.classList.remove("on");
    cur = btn; btn.classList.add("on");
    ttl.textContent = "Audio · " + btn.dataset.pg + "-bet";
    frame.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + btn.dataset.yt +
      '?autoplay=1&rel=0&playsinline=1&iv_load_policy=3" allow="autoplay; encrypted-media" allowfullscreen title="Audio"></iframe>';
    box.classList.add("open");
    layout();
    // docking narrows the book: bring the code that was clicked back into view
    var r = btn.getBoundingClientRect(), o = so.getBoundingClientRect();
    if (r.top < o.top + 20 || r.bottom > o.bottom - 60) so.scrollTop += r.top - o.top - 120;
  }
  document.addEventListener("click", function(e){
    var b = e.target.closest && e.target.closest(".qa");
    if (b) { e.preventDefault(); play(b); }
  });
  box.querySelector(".x").addEventListener("click", stop);
  box.querySelector(".mv").addEventListener("click", function(){ corner = (corner + 1) % 4; toCorner(corner); });
  dk.addEventListener("click", function(){
    mode = mode === "dock" ? "float" : "dock";
    try { localStorage.setItem("qaMode", mode); } catch (e) {}
    layout();
  });
  document.addEventListener("keydown", function(e){ if (e.key === "Escape" && cur) stop(); });
  var lastW = innerWidth;
  addEventListener("resize", function(){
    if (innerWidth === lastW) return; lastW = innerWidth;       // ignore the resize we dispatch ourselves
    if (box.classList.contains("open")) layout();
  });

  // floating mode: drag by the title bar (mouse, pen or finger); the video itself stays clickable
  var start = null;
  hd.addEventListener("pointerdown", function(e){
    if (e.target.closest("button") || document.body.classList.contains("qa-dock")) return;
    var r = box.getBoundingClientRect();
    start = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    hd.setPointerCapture(e.pointerId); box.classList.add("drag"); frame.style.pointerEvents = "none";
  });
  hd.addEventListener("pointermove", function(e){ if (start) place(e.clientX - start.dx, e.clientY - start.dy); });
  function end(){ if (!start) return; start = null; box.classList.remove("drag"); frame.style.pointerEvents = "";
    if (pos) place(pos.x, pos.y, true); }
  hd.addEventListener("pointerup", end); hd.addEventListener("pointercancel", end);
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
