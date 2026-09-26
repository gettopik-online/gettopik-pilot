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

// 대본 / 정답 for listening codes (html_books/<key>/<key>.listen.json, keyed by YouTube id)
const lsFile = `${dir}/${key}.listen.json`;
const LISTEN = fs.existsSync(lsFile) ? JSON.parse(fs.readFileSync(lsFile, "utf8")) : {};
delete LISTEN._;

// answer marks look drawn by hand: a loop that overshoots its start, a stroke with a slight bow
function handCircle([cx, cy, rx, ry], seed) {
  const rnd = (k) => { const v = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v) - 0.5; };
  const pts = [];
  for (let k = 0; k <= 14; k++) {
    const a = -0.5 + k * (2 * Math.PI + 0.7) / 14, j = 1 + 0.06 * rnd(k);
    pts.push([cx + Math.cos(a) * (rx + 3) * j, cy + Math.sin(a) * (ry + 2.5) * j * (1 + 0.06 * k / 14)]);
  }
  let d = "";
  for (let k = 1; k < pts.length - 1; k++) {                       // Catmull-Rom through the points
    const p0 = pts[k - 1], p1 = pts[k], p2 = pts[k + 1], p3 = pts[Math.min(k + 2, pts.length - 1)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    if (k === 1) d = `M${p1[0].toFixed(1)},${p1[1].toFixed(1)}`;
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}
function handLine([x1, y1, x2, y2]) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1;
  return `M${x1},${y1} Q${(mx - dy * 0.12).toFixed(1)},${(my + dx * 0.12).toFixed(1)} ${x2},${y2}`;
}

// reading time per section (minutes); a book can override it in html_books/<key>/<key>.timers.json {"읽기 1": 3, ...}
const tmFile = `${dir}/${key}.timers.json`;
const TIMER = Object.assign({ "읽기 1": 3, "읽기 2": 5 }, fs.existsSync(tmFile) ? JSON.parse(fs.readFileSync(tmFile, "utf8")) : {});
const ALLQR = fs.existsSync(qrFile) ? JSON.parse(fs.readFileSync(qrFile, "utf8")) : [];
// 정답 for 읽기 sections, keyed "<page>:<section>" (html_books/<key>/<key>.answers.json)
const anFile = `${dir}/${key}.answers.json`;
const ANSWERS = fs.existsSync(anFile) ? JSON.parse(fs.readFileSync(anFile, "utf8")) : {};
const CLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">' +
  '<circle cx="12" cy="13" r="8.5"/><path d="M12 8.5V13l3 2M9.5 2.5h5"/></svg>';

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
  const tools = qrs.filter((q) => q.page === i + 1 && LISTEN[q.yt]).map((q, n) => {
    const L = LISTEN[q.yt];
    const marks = (L.marks || []).map((m, k) => m.circle ? `<path pathLength="1" d="${handCircle(m.circle, i * 7 + n * 3 + k + 1)}"/>`
      : `<path pathLength="1" d="${handLine(m.line)}"/>`).join("");
    return `<span class="qa-tools" data-yt="${q.yt}" style="left:${px(q.x + q.w / 2)};top:${px(q.y + q.h + 4)}">` +
      `<button type="button" class="qt-sc" title="대본 — tinglash matni">대본</button>` +
      `<button type="button" class="qt-an" title="정답 — to'g'ri javob">정답</button></span>` +
      (marks ? `<svg class="qa-marks" data-yt="${q.yt}" viewBox="0 0 ${p.w} ${p.h}" preserveAspectRatio="none" aria-hidden="true">${marks}</svg>` : "");
  }).join("");
  const timers = p.runs.filter((r) => /^\s*읽기\s*[12]\s*$/.test(r.t)).map((r) => {
    const sec = r.t.replace(/\s+/g, " ").trim(), min = TIMER[sec];
    if (!min) return "";
    const code = ALLQR.find((q) => q.page === i + 1 && new RegExp(sec.replace(" ", "\\s*") + "(\\s|$)").test(q.title || ""));
    const id = `${i + 1}:${sec}`, A = ANSWERS[id];
    const cx = code ? code.x + code.w / 2 : r.x - 1 + 12 / PT, cy = code ? code.y + code.h + 4 : r.y + r.h + 3;
    const answer = !A ? "" :
      `<button type="button" class="rt-an" data-id="${id}" hidden title="정답 — to'g'ri javob" style="left:${px(cx + 15 / PT * 1.3)};top:${px(cy)}">정답</button>` +
      `<svg class="qa-marks" data-id="${id}" viewBox="0 0 ${p.w} ${p.h}" preserveAspectRatio="none" aria-hidden="true">` +
      (A.marks || []).map((m, k) => m.circle ? `<path pathLength="1" d="${handCircle(m.circle, i * 5 + k + 11)}"/>` : `<path pathLength="1" d="${handLine(m.line)}"/>`).join("") + `</svg>`;
    return code
      ? answer + `<button type="button" class="rt c" data-id="${id}" data-min="${min}" title="${sec}: ${min} daqiqa — bosing, taymer boshlanadi" aria-label="${sec} taymeri, ${min} daqiqa" style="left:${px(code.x + code.w / 2)};top:${px(code.y + code.h + 4)}">${CLOCK}</button>`
      : answer + `<button type="button" class="rt" data-id="${id}" data-min="${min}" title="${sec}: ${min} daqiqa — bosing, taymer boshlanadi" aria-label="${sec} taymeri, ${min} daqiqa" style="left:${px(r.x - 1)};top:${px(r.y + r.h + 3)}">${CLOCK}</button>`;
  }).join("");
  return `<div class="page hpage" data-key="p${i + 1}" style="height:${px(p.h)}"><img class="pbg" src="${dir}/${p.bg}" loading="lazy" decoding="async" alt="">${runs}${qa}${tools}${timers}</div>`;
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
  .page.hpage .qa-bar{position:absolute;z-index:5;display:flex;align-items:center;gap:7px;width:276px;height:34px;
    padding:0 4px 0 3px;cursor:grab;touch-action:none;border-radius:17px;background:#fff;border:1px solid #F3CDB6;box-shadow:0 3px 12px rgba(30,20,10,.16);
    font:700 12.5px/1 "Malgun Gothic",sans-serif;color:#3A2A20;user-select:none}
  .page.hpage .qa-bar .pp{flex:none;width:26px;height:26px;border:0;border-radius:50%;background:#F26B2A;color:#fff;cursor:pointer;
    display:flex;align-items:center;justify-content:center;padding:0}
  .page.hpage .qa-bar .pp svg{width:11px;height:11px}
  .page.hpage .qa-bar .pp:focus-visible,.page.hpage .qa-bar input:focus-visible{outline:2px solid #1968D8;outline-offset:2px}
  .page.hpage .qa-bar input{flex:1;min-width:0;height:28px;margin:0;background:transparent;cursor:pointer;-webkit-appearance:none;appearance:none;
    touch-action:none}
  .page.hpage .qa-bar input::-webkit-slider-runnable-track{height:5px;border-radius:3px;
    background:linear-gradient(to right,#F26B2A 0 var(--p,0%),#F3DDD0 var(--p,0%) 100%)}
  .page.hpage .qa-bar input::-moz-range-track{height:5px;border-radius:3px;background:#F3DDD0}
  .page.hpage .qa-bar input::-moz-range-progress{height:5px;border-radius:3px;background:#F26B2A}
  .page.hpage .qa-bar input::-webkit-slider-thumb{-webkit-appearance:none;width:15px;height:15px;margin-top:-5px;border-radius:50%;
    background:#fff;border:2.5px solid #F26B2A}
  .page.hpage .qa-bar input::-moz-range-thumb{width:9px;height:9px;border-radius:50%;background:#fff;border:2.5px solid #F26B2A}
  .page.hpage .qa-bar .tm{flex:none;min-width:34px;text-align:right;font-variant-numeric:tabular-nums}
  .page.hpage .qa-bar.paused .pp{background:#8A94A6}
  .page.hpage .qa-bar .cl{flex:none;width:24px;height:24px;border:0;border-radius:50%;background:transparent;color:#9A8577;
    cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0}
  .page.hpage .qa-bar .cl:hover{background:#F6E6DC;color:#3A2A20}
  .page.hpage .qa-bar .cl:focus-visible{outline:2px solid #1968D8;outline-offset:1px}
  .page.hpage .qa-bar .cl svg{width:12px;height:12px}
  /* 읽기 timer: a small, quiet clock under the code; a ring around it shows the time running down */
  .page.hpage .rt{position:absolute;z-index:4;width:24px;height:24px;padding:0;border-radius:50%;border:1px solid rgba(243,205,182,.8);
    background:rgba(255,251,247,.85);color:#D29A74;cursor:pointer;display:flex;align-items:center;justify-content:center;opacity:.72;
    transition:opacity .15s,color .15s,background .15s,transform .12s}
  .page.hpage .rt.c{transform:translateX(-50%)}
  .page.hpage .rt:hover{opacity:1;color:#C8561E;background:#FFF3EA}
  .page.hpage .rt > svg{width:13px;height:13px}
  .page.hpage .rt .ring{position:absolute;inset:-3px;width:30px;height:30px;transform:rotate(-90deg);pointer-events:none}
  .page.hpage .rt .ring circle{fill:none;stroke-width:2.4;stroke-linecap:round}
  .page.hpage .rt.on,.page.hpage .rt.hold,.page.hpage .rt.end{opacity:1;color:#F26B2A;background:#fff;border-color:transparent}
  .page.hpage .rt.hold{color:#8A94A6}
  .page.hpage .rt.end{color:#fff;background:#E8264A}
  .page.hpage .rt:focus-visible{outline:2px solid #1968D8;outline-offset:3px}
  /* 정답 beside the clock: hidden until the time is up, then it pops in */
  .page.hpage .rt-an{position:absolute;z-index:4;height:24px;padding:0 8px;border-radius:12px;border:1px solid #F3CDB6;background:#FFFBF7;
    color:#C8561E;font:700 9.6px/1 "Malgun Gothic",sans-serif;cursor:pointer;box-shadow:0 1px 4px rgba(120,60,20,.12);
    animation:rtAn .35s cubic-bezier(.3,1.6,.5,1)}
  .page.hpage .rt-an[hidden]{display:none}
  .page.hpage .rt-an:hover{background:#FFEBDD}
  .page.hpage .rt-an.on{background:#F26B2A;border-color:#F26B2A;color:#fff}
  .page.hpage .rt-an:focus-visible{outline:2px solid #1968D8;outline-offset:2px}
  @keyframes rtAn{from{opacity:0;transform:scale(.4)}to{opacity:1;transform:none}}
  @media (prefers-reduced-motion:reduce){.page.hpage .rt-an{animation:none}}
  /* its bar: a compact pill that can be moved anywhere on the page */
  .page.hpage .rt-bar{position:absolute;z-index:5;display:flex;align-items:center;gap:5px;width:168px;height:28px;padding:0 3px;
    border-radius:14px;background:#fff;border:1px solid #F3CDB6;box-shadow:0 2px 10px rgba(30,20,10,.14);cursor:grab;touch-action:none;
    font:700 12px/1 "Malgun Gothic",sans-serif;color:#3A2A20;user-select:none}
  .page.hpage .rt-bar.moving{cursor:grabbing;box-shadow:0 6px 18px rgba(30,20,10,.24)}
  .page.hpage .rt-bar .pp{flex:none;width:21px;height:21px;border:0;border-radius:50%;background:#F26B2A;color:#fff;cursor:pointer;
    display:flex;align-items:center;justify-content:center;padding:0}
  .page.hpage .rt-bar .pp svg{width:9px;height:9px}
  .page.hpage .rt-bar.hold .pp{background:#8A94A6}
  .page.hpage .rt-bar .tm{flex:none;min-width:34px;font-variant-numeric:tabular-nums}
  .page.hpage .rt-bar .ln{flex:1;min-width:0;height:22px;display:flex;align-items:center;cursor:pointer;touch-action:none}
  .page.hpage .rt-bar .tr{position:relative;flex:1;height:3px;border-radius:2px;background:#F3DDD0}
  .page.hpage .rt-bar .fl{position:absolute;left:0;top:0;bottom:0;border-radius:2px;background:#F26B2A}
  .page.hpage .rt-bar .kn{position:absolute;top:50%;width:10px;height:10px;margin:-5px 0 0 -5px;border-radius:50%;background:#fff;
    border:2px solid #F26B2A;box-sizing:border-box}
  .page.hpage .rt-bar.last .tm,.page.hpage .rt-bar.end .tm{color:#E8264A}
  .page.hpage .rt-bar.end{border-color:#E8264A;animation:rtEnd .9s ease-in-out 3}
  .page.hpage .rt-bar.end .fl{background:#E8264A}
  .page.hpage .rt-bar.end .kn{border-color:#E8264A}
  @keyframes rtEnd{50%{box-shadow:0 0 0 5px rgba(232,38,74,.22)}}
  @media (prefers-reduced-motion:reduce){.page.hpage .rt-bar.end{animation:none}}
  .page.hpage .rt-bar .cl{flex:none;width:20px;height:20px;border:0;border-radius:50%;background:transparent;color:#9A8577;cursor:pointer;
    display:flex;align-items:center;justify-content:center;padding:0}
  .page.hpage .rt-bar .cl:hover{background:#F6E6DC;color:#3A2A20}
  .page.hpage .rt-bar .cl svg{width:10px;height:10px}
  .page.hpage .rt-bar .pp:focus-visible,.page.hpage .rt-bar .cl:focus-visible{outline:2px solid #1968D8;outline-offset:2px}
  /* 대본 / 정답: two small round badges hanging under the code */
  .page.hpage .qa-tools{position:absolute;z-index:4;display:flex;gap:4px;transform:translateX(-50%)}
  .page.hpage .qa-tools button{width:29px;height:29px;padding:0;border-radius:50%;border:1.2px solid #F3CDB6;background:#FFFBF7;
    color:#C8561E;font:700 9.6px/1 "Malgun Gothic",sans-serif;letter-spacing:-.2px;cursor:pointer;box-shadow:0 1px 4px rgba(120,60,20,.12);
    transition:background .15s,color .15s,transform .12s}
  .page.hpage .qa-tools button:hover{background:#FFEBDD;transform:translateY(-1px)}
  .page.hpage .qa-tools button.on{background:#F26B2A;border-color:#F26B2A;color:#fff}
  .page.hpage .qa-tools button:focus-visible{outline:2px solid #1968D8;outline-offset:2px}
  /* 정답: red marks drawn onto the page as if by the teacher's pen */
  .page.hpage .qa-marks{position:absolute;left:0;top:0;width:100%;height:100%;z-index:3;pointer-events:none;display:none;overflow:visible}
  .page.hpage .qa-marks.show{display:block}
  .page.hpage .qa-marks path{fill:none;stroke:#E8264A;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round;
    stroke-dasharray:1;stroke-dashoffset:1;animation:qaInk .55s ease-out forwards}
  .page.hpage .qa-marks path:nth-child(2){animation-delay:.25s}
  .page.hpage .qa-marks path:nth-child(3){animation-delay:.5s}
  .page.hpage .qa-marks path:nth-child(4){animation-delay:.75s}
  @keyframes qaInk{to{stroke-dashoffset:0}}
  @media (prefers-reduced-motion:reduce){.page.hpage .qa-marks path{animation:none;stroke-dashoffset:0}}
  /* 대본: a speech bubble coming out of the badge, the dialogue inside as chat bubbles */
  .page.hpage .qa-sc{position:absolute;z-index:6;width:318px;padding:9px 10px 11px;border-radius:18px;background:#FFFBF7;
    border:1.5px solid #F3CDB6;box-shadow:0 10px 30px rgba(90,45,15,.18);font-family:"Malgun Gothic",sans-serif;
    animation:qaPop .18s ease-out}
  @keyframes qaPop{from{opacity:0;transform:translateY(-6px) scale(.97)}to{opacity:1;transform:none}}
  .page.hpage .qa-sc::before{content:"";position:absolute;top:-8px;left:var(--tail,270px);width:14px;height:14px;background:#FFFBF7;
    border-left:1.5px solid #F3CDB6;border-top:1.5px solid #F3CDB6;transform:rotate(45deg);border-top-left-radius:3px}
  .page.hpage .qa-sc .hd{display:flex;align-items:center;gap:6px;margin:0 0 4px 4px;font-size:11.5px;font-weight:700;color:#C8561E}
  .page.hpage .qa-sc{cursor:grab;touch-action:none}
  .page.hpage .qa-sc .ln{cursor:pointer}
  .page.hpage .qa-sc.moving{cursor:grabbing;box-shadow:0 16px 40px rgba(90,45,15,.28)}
  .page.hpage .qa-sc.moved::before{display:none}
  .page.hpage .qa-sc .hd span{flex:1}
  .page.hpage .qa-sc .hd small{display:block;font-weight:400;color:#9A8577;font-size:9.5px;margin-top:2px}
  .page.hpage .qa-sc .x{width:24px;height:24px;border:0;border-radius:50%;background:transparent;color:#9A8577;cursor:pointer;
    display:flex;align-items:center;justify-content:center;padding:0;flex:none}
  .page.hpage .qa-sc .x:hover{background:#F6E6DC;color:#3A2A20}
  .page.hpage .qa-sc .x svg{width:11px;height:11px}
  .page.hpage .qa-sc .ln{display:flex;align-items:flex-end;gap:6px;margin-top:7px;cursor:pointer}
  .page.hpage .qa-sc .ln.r{flex-direction:row-reverse}
  .page.hpage .qa-sc .av{flex:none;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;
    color:#fff;font-size:10.5px;font-weight:700}
  .page.hpage .qa-sc .av.f{background:#E0799B}
  .page.hpage .qa-sc .av.m{background:#4F86D9}
  .page.hpage .qa-sc .col{display:flex;flex-direction:column;max-width:238px}
  .page.hpage .qa-sc .ln.r .col{align-items:flex-end}
  .page.hpage .qa-sc .nm{font-size:9.5px;color:#9A8577;margin:0 6px 2px}
  .page.hpage .qa-sc .bb{padding:6px 10px;border-radius:14px 14px 14px 4px;background:#fff;border:1px solid #EEDFD4;
    font-size:12.6px;line-height:1.45;color:#2B2320;transition:background .2s,border-color .2s,box-shadow .2s}
  .page.hpage .qa-sc .ln.r .bb{border-radius:14px 14px 4px 14px;background:#FFF3EA}
  .page.hpage .qa-sc .ln:hover .bb{border-color:#F3B38F}
  .page.hpage .qa-sc .ln.now .bb{background:#fff;border-color:#F26B2A;box-shadow:0 0 0 3px rgba(242,107,42,.16)}
  .page.hpage .qa-sc .wd{background-image:linear-gradient(#BCDDFF,#BCDDFF);background-repeat:no-repeat;background-position:0 62%;
    background-size:0% 78%;border-radius:3px;-webkit-box-decoration-break:clone;box-decoration-break:clone}
  .page.hpage .qa-sc .ln.now.paused .bb{background:#FFF6EF;border-style:dashed;box-shadow:none}
  .page.hpage .qa-sc .ln.now.paused .nm::after{content:" · pauza";color:#C8561E}
  .page.hpage .qa-bar .grip{flex:none;width:12px;height:18px;color:#C9A48E}
  .page.hpage .qa-bar.moving{cursor:grabbing;box-shadow:0 8px 24px rgba(30,20,10,.28)}
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
<script id="qa-v14">
(function(){
  // one recording at a time. Clicking a code plays it; a bar above the code shows play/pause, a line that can be
  // dragged or clicked to jump anywhere in the recording, and the time left. Clicking the code again pauses/resumes;
  // starting another code stops the first.
  var PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l12.5-7.5z"/></svg>',
      PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="5.5" y="4.5" width="4.5" height="15" rx="1"/><rect x="14" y="4.5" width="4.5" height="15" rx="1"/></svg>';
  var W = 276, H = 34, cur = null, sync = function(){}, one = null;   // one = a single 대본 line being played                  // { btn, audio, bar, pp, range, tm, seeking }
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
    if (one && one.audio === a && !a.paused && a.currentTime >= one.end) { a.pause(); a.currentTime = one.end; }
    sync();
  }
  // recordings are fetched ahead: when a page comes near the screen, its codes' audio starts loading, so a
  // click plays at once instead of waiting for the download
  var cache = {};
  function get(src){
    var a = cache[src];
    if (a && !a.error) return a;
    a = cache[src] = new Audio();
    a.preload = "auto"; a.src = src;
    ["play", "pause", "timeupdate", "loadedmetadata", "durationchange"].forEach(function(ev){
      a.addEventListener(ev, function(){ if (cur && cur.audio === a) draw(); });
    });
    a.addEventListener("ended", function(){ if (cur && cur.audio === a) stop(); });
    a.addEventListener("error", function(){ if (cur && cur.audio === a) { cur.tm.textContent = "xato"; cur.btn.classList.remove("on"); } });
    return a;
  }
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(e){
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        e.target.querySelectorAll(".qa").forEach(function(b){ get(b.dataset.src); });
      });
    }, { root: document.getElementById("stage-outer"), rootMargin: "1500px 0px" });
    document.querySelectorAll(".page.hpage").forEach(function(pg){ if (pg.querySelector(".qa")) io.observe(pg); });
  }
  function stop(){
    if (!cur) return;
    cur.audio.pause(); try { cur.audio.currentTime = 0; } catch (e) {}
    cur.bar.remove(); cur.btn.classList.remove("on"); cur = null; one = null; sync();
  }
  function start(btn){
    stop(); one = null;
    var page = btn.parentNode, audio = get(btn.dataset.src), bar = document.createElement("div");
    try { audio.currentTime = 0; } catch (e) {}
    bar.className = "qa-bar";
    bar.title = "Ushlab boshqa joyga surish mumkin";
    bar.innerHTML = '<svg class="grip" viewBox="0 0 12 18" fill="currentColor"><circle cx="3" cy="3" r="1.6"/><circle cx="9" cy="3" r="1.6"/>' +
      '<circle cx="3" cy="9" r="1.6"/><circle cx="9" cy="9" r="1.6"/><circle cx="3" cy="15" r="1.6"/><circle cx="9" cy="15" r="1.6"/></svg>' +
      '<button type="button" class="pp"></button><input type="range" min="0" max="1" step="0.05" value="0" ' +
      'aria-label="Audio joyi"><span class="tm">…</span>' +
      '<button type="button" class="cl" title="Yopish" aria-label="Yopish"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>';
    // above the code, kept inside the page
    var cx = btn.offsetLeft + btn.offsetWidth / 2, top = btn.offsetTop - H - 8;
    if (top < 4) top = btn.offsetTop + btn.offsetHeight + 8;
    bar.style.left = Math.max(6, Math.min(cx - W / 2, page.offsetWidth - W - 6)) + "px";
    bar.style.top = top + "px";
    page.appendChild(bar);
    cur = { btn: btn, audio: audio, bar: bar, pp: bar.querySelector(".pp"), range: bar.querySelector("input"),
            tm: bar.querySelector(".tm"), seeking: false, shown: null };
    var c = cur;
    // the line follows the pointer itself (mouse, finger or pen) so a drag is never taken for page scrolling
    var r = c.range;
    function seekTo(e){
      var b = r.getBoundingClientRect(), d = audio.duration || 0;
      if (!d || !b.width) return;
      r.value = Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)) * d;
      audio.currentTime = +r.value;
      draw();
    }
    r.addEventListener("pointerdown", function(e){
      e.preventDefault(); e.stopPropagation();
      c.seeking = true; one = null; try { r.setPointerCapture(e.pointerId); } catch (err) {}
      seekTo(e);
    });
    r.addEventListener("pointermove", function(e){ if (c.seeking) seekTo(e); });
    function endSeek(e){ if (!c.seeking) return; seekTo(e); c.seeking = false; draw(); }
    r.addEventListener("pointerup", endSeek);
    r.addEventListener("pointercancel", function(){ c.seeking = false; });
    r.addEventListener("input", function(){ if (!c.seeking) { audio.currentTime = +r.value; draw(); } });   // arrow keys
    c.pp.addEventListener("click", function(e){ e.stopPropagation(); toggle(); });
    bar.querySelector(".cl").addEventListener("click", function(e){ e.stopPropagation(); stop(); });
    // the whole bar can be picked up (anywhere but its button and line) and put elsewhere on the page
    var mv = null;
    bar.addEventListener("pointerdown", function(e){
      if (e.target.closest(".pp") || e.target.closest(".cl") || e.target === r) return;
      e.preventDefault(); e.stopPropagation();
      var k = page.getBoundingClientRect().width / page.offsetWidth || 1;     // the page is drawn scaled
      mv = { x: e.clientX, y: e.clientY, l: bar.offsetLeft, t: bar.offsetTop, k: k };
      try { bar.setPointerCapture(e.pointerId); } catch (err) {}
      bar.classList.add("moving");
    });
    bar.addEventListener("pointermove", function(e){
      if (!mv) return;
      var l = mv.l + (e.clientX - mv.x) / mv.k, t = mv.t + (e.clientY - mv.y) / mv.k;
      bar.style.left = Math.max(0, Math.min(l, page.offsetWidth - bar.offsetWidth)) + "px";
      bar.style.top = Math.max(0, Math.min(t, page.offsetHeight - bar.offsetHeight)) + "px";
    });
    function drop(){ mv = null; bar.classList.remove("moving"); }
    bar.addEventListener("pointerup", drop); bar.addEventListener("pointercancel", drop);
    bar.addEventListener("click", function(e){ e.stopPropagation(); });
    draw();
    audio.play().catch(function(){ draw(); });
  }
  function toggle(){ if (cur.audio.paused) cur.audio.play(); else cur.audio.pause(); }

  // ---------- 대본 (script bubble that follows the recording) and 정답 (marks on the page) ----------
  var LISTEN = window.QA_LISTEN || {}, open = {};           // open[yt] = script bubble element
  function esc(t){ return String(t).replace(/[&<>"]/g, function(c){ return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function codeFor(yt, page){ return page.querySelector('.qa[data-src$="/' + yt + '.mp3"]'); }
  sync = function(){
    Object.keys(open).forEach(function(yt){
      var box = open[yt], lines = LISTEN[yt].lines, now = -1;
      var mine = cur && cur.btn === codeFor(yt, box.parentNode);
      if (mine && one && one.yt === yt) now = one.k;
      else if (mine) {
        var t = cur.audio.currentTime;
        for (var k = 0; k < lines.length; k++) if (lines[k].t <= t + 0.15) now = k;
      }
      var paused = mine && cur.audio.paused;
      box.querySelectorAll(".ln").forEach(function(el, k){ el.classList.toggle("now", k === now); el.classList.toggle("paused", k === now && paused); });
    });
    paint();
    if (cur && !cur.audio.paused) run();
  };
  function openScript(tools){
    var yt = tools.dataset.yt, page = tools.parentNode, L = LISTEN[yt], btn = tools.querySelector(".qt-sc");
    if (open[yt]) { open[yt].remove(); delete open[yt]; btn.classList.remove("on"); return; }
    var sides = {}, order = 0;
    var html = '<div class="hd"><span>대본 · ' + esc(L.title || "") + '<small>Gapga bosing: faqat o‘sha gap eshittiriladi</small></span>' +
      '<button type="button" class="x" title="Yopish" aria-label="Yopish"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>';
    L.lines.forEach(function(l, k){
      if (!(l.n in sides)) sides[l.n] = order++ % 2 ? "r" : "";
      html += '<div class="ln ' + sides[l.n] + '" data-k="' + k + '" title="Bosing: shu gapni tinglash · yana bosing: to‘xtatish / davom ettirish"><span class="av ' + (l.g || "") + '">' +
        esc(l.n.charAt(0)) + '</span><span class="col"><span class="nm">' + esc(l.n) + '</span><span class="bb">' + l.x.split(" ").map(function(w, j, all){ return '<span class="wd">' + esc(w) + (j < all.length - 1 ? " " : "") + "</span>"; }).join("") + '</span></span></div>';
    });
    var box = document.createElement("div");
    box.className = "qa-sc"; box.innerHTML = html;
    page.appendChild(box);
    var W = box.offsetWidth, cx = tools.offsetLeft;                          // badges are centred on their left edge
    var left = Math.max(8, Math.min(cx + 36 - W, page.offsetWidth - W - 8));
    box.style.left = left + "px"; box.style.top = (tools.offsetTop + tools.offsetHeight + 12) + "px";
    var tail = cx - tools.offsetWidth / 2 + btn.offsetLeft + btn.offsetWidth / 2 - left - 7;
    box.style.setProperty("--tail", Math.max(14, Math.min(W - 28, tail)) + "px");
    open[yt] = box; btn.classList.add("on");
    box.querySelector(".x").addEventListener("click", function(e){ e.stopPropagation(); box.remove(); delete open[yt]; btn.classList.remove("on"); });
    // the bubble can be picked up by its title or any empty spot and put elsewhere; the lines stay clickable
    var mv = null;
    box.addEventListener("pointerdown", function(e){
      e.stopPropagation();
      if (e.target.closest(".ln") || e.target.closest(".x")) return;
      e.preventDefault();
      var k = page.getBoundingClientRect().width / page.offsetWidth || 1;     // the page is drawn scaled
      mv = { x: e.clientX, y: e.clientY, l: box.offsetLeft, t: box.offsetTop, k: k };
      try { box.setPointerCapture(e.pointerId); } catch (err) {}
      box.classList.add("moving");
    });
    box.addEventListener("pointermove", function(e){
      if (!mv) return;
      var l = mv.l + (e.clientX - mv.x) / mv.k, t = mv.t + (e.clientY - mv.y) / mv.k;
      box.style.left = Math.max(0, Math.min(l, page.offsetWidth - box.offsetWidth)) + "px";
      box.style.top = Math.max(0, Math.min(t, page.offsetHeight - box.offsetHeight)) + "px";
      box.classList.add("moved");                                          // no longer points at its badge
    });
    function drop(){ mv = null; box.classList.remove("moving"); }
    box.addEventListener("pointerup", drop); box.addEventListener("pointercancel", drop);
    box.addEventListener("click", function(e){
      e.stopPropagation();
      var ln = e.target.closest(".ln");
      if (!ln) return;
      var k = +ln.dataset.k, code = codeFor(yt, page), a;
      if (!code) return;
      if (one && one.yt === yt && one.k === k && cur && cur.btn === code) {     // same line: pause / resume
        a = cur.audio;
        if (!a.paused) a.pause();
        else { if (a.currentTime >= one.end - 0.05) a.currentTime = one.from; a.play(); watch(); }
        draw(); return;
      }
      if (!(cur && cur.btn === code)) start(code);
      a = cur.audio;
      var from = L.lines[k].t, end = k + 1 < L.lines.length ? L.lines[k + 1].t - 0.12 : Infinity;
      one = { yt: yt, k: k, from: from, end: end, audio: a };
      if (a.readyState >= 1) a.currentTime = from;
      else a.addEventListener("loadedmetadata", function h(){ a.removeEventListener("loadedmetadata", h); a.currentTime = from; });
      a.play(); watch(); draw();
    });
    sync();
  }
  function paint(){
    Object.keys(open).forEach(function(yt){
      var box = open[yt], lines = LISTEN[yt].lines, mine = cur && cur.btn === codeFor(yt, box.parentNode);
      var t = mine ? cur.audio.currentTime : -1, nowEl = box.querySelector(".ln.now"), now = nowEl ? +nowEl.dataset.k : -1;
      box.querySelectorAll(".ln").forEach(function(el, k){
        var w = lines[k].w || [], spans = el.querySelectorAll(".wd");
        for (var j = 0; j < spans.length; j++) {
          var p = 0, r = w[j];
          if (mine && k === now && r) p = t <= r[0] ? 0 : t >= r[1] ? 1 : (t - r[0]) / (r[1] - r[0]);
          p = Math.round(p * 1000) / 10;
          if (spans[j]._p !== p) { spans[j]._p = p; spans[j].style.backgroundSize = p + "% 78%"; }
        }
      });
    });
  }
  var painting = false;
  function frame(){
    paint();
    if (cur && !cur.audio.paused && Object.keys(open).length) requestAnimationFrame(frame); else painting = false;
  }
  function run(){ if (!painting) { painting = true; requestAnimationFrame(frame); } }
  function watch(){
    if (!one || !cur || cur.audio !== one.audio) return;
    var a = one.audio;
    if (!a.paused && a.currentTime >= one.end) { a.pause(); a.currentTime = one.end; draw(); return; }
    if (!a.paused) requestAnimationFrame(watch);
  }
  function toggleAnswer(tools){
    var svg = tools.parentNode.querySelector('.qa-marks[data-yt="' + tools.dataset.yt + '"]'), btn = tools.querySelector(".qt-an");
    if (!svg) return;
    var on = !svg.classList.contains("show");
    svg.classList.toggle("show", on); btn.classList.toggle("on", on);
  }
  document.addEventListener("click", function(e){
    var b = e.target.closest && e.target.closest(".qa-tools button");
    if (!b) return;
    e.preventDefault();
    if (b.classList.contains("qt-sc")) openScript(b.parentNode); else toggleAnswer(b.parentNode);
  });
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

// 읽기 timers (see .rt / .rt-bar above). Clicking the badge starts; clicking it or ⏸ pauses and resumes; the line
// can be dragged to give more or less time; × resets. The last ten seconds tick, the end rings.
const rtJs = `
<script id="rt-v3">
(function(){
  var PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l12.5-7.5z"/></svg>',
      PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="5.5" y="4.5" width="4.5" height="15" rx="1"/><rect x="14" y="4.5" width="4.5" height="15" rx="1"/></svg>',
      GRIP = '<svg class="grip" viewBox="0 0 12 18" fill="currentColor"><circle cx="3" cy="3" r="1.6"/><circle cx="9" cy="3" r="1.6"/>' +
        '<circle cx="3" cy="9" r="1.6"/><circle cx="9" cy="9" r="1.6"/><circle cx="3" cy="15" r="1.6"/><circle cx="9" cy="15" r="1.6"/></svg>',
      X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  var W = 168, ac = null,
      RING = '<svg class="ring" viewBox="0 0 30 30"><circle cx="15" cy="15" r="13" pathLength="100" stroke="transparent"/></svg>';
  function beep(hi){
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === "suspended") ac.resume();
      var o = ac.createOscillator(), g = ac.createGain(), len = hi ? 0.5 : 0.08;
      o.type = "sine"; o.frequency.value = hi ? 660 : 990;
      g.gain.setValueAtTime(0.18, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + len);
      o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + len);
    } catch (e) {}
  }
  function fmt(t){ t = Math.max(0, Math.ceil(t)); return ("0" + Math.floor(t / 60)).slice(-2) + ":" + ("0" + t % 60).slice(-2); }
  function Timer(badge){
    var total = +badge.dataset.min * 60, left = total, running = false, last = 0, raf = 0, bar = null, lastSec = null;
    badge.insertAdjacentHTML("beforeend", RING);
    var ring = badge.querySelector(".ring circle"), tip = badge.title;
    function paint(){
      var sec = Math.ceil(left);
      var busy = running || left < total;
      ring.style.stroke = !busy ? "transparent" : left <= 0 ? "#E8264A" : running ? "#F26B2A" : "#8A94A6";
      ring.style.strokeDasharray = (left / total * 100) + " 100";
      badge.title = busy ? fmt(left) + " qoldi" : tip;
      badge.classList.toggle("on", running && left > 0);
      badge.classList.toggle("hold", !running && left > 0 && left < total);
      badge.classList.toggle("end", left <= 0);
      if (!bar) return;
      var f = 1 - left / total;
      bar.fl.style.width = (f * 100) + "%"; bar.kn.style.left = (f * 100) + "%";
      bar.tm.textContent = fmt(left);
      bar.el.classList.toggle("hold", !running && left > 0);
      bar.el.classList.toggle("last", left > 0 && left <= 10);
      bar.el.classList.toggle("end", left <= 0);
      if (bar.shown !== running) { bar.shown = running; bar.pp.innerHTML = running ? PAUSE : PLAY; bar.pp.title = running ? "Pauza" : "Davom ettirish"; }
      if (running && sec !== lastSec) {
        if (sec <= 10 && sec > 0 && lastSec !== null) beep(false);
        lastSec = sec;
      }
    }
    function tick(now){
      if (!running) return;
      left = Math.max(0, left - (now - last) / 1000); last = now;
      if (left <= 0) { running = false; beep(true); unlock(); }
      paint();
      if (running) raf = requestAnimationFrame(tick);
    }
    function unlock(){
      var an = badge.parentNode.querySelector('.rt-an[data-id="' + badge.dataset.id + '"]');
      if (an && an.hidden) an.hidden = false;
    }
    function go(){ if (left <= 0) left = total; running = true; last = performance.now(); lastSec = null; raf = requestAnimationFrame(tick); paint(); }
    function hold(){ running = false; cancelAnimationFrame(raf); paint(); }
    function reset(){ hold(); left = total; if (bar) { bar.el.remove(); bar = null; } paint(); }
    function makeBar(){
      var page = badge.parentNode, el = document.createElement("div");
      el.className = "rt-bar"; el.title = "Ushlab boshqa joyga surish mumkin";
      el.innerHTML = '<button type="button" class="pp"></button><span class="tm"></span><span class="ln"><span class="tr"><span class="fl"></span>' +
        '<span class="kn"></span></span></span><button type="button" class="cl" title="Yopish" aria-label="Yopish">' + X + '</button>';
      var cx = badge.offsetLeft + (badge.classList.contains("c") ? 0 : badge.offsetWidth / 2);
      el.style.left = Math.max(6, Math.min(cx - W / 2, page.offsetWidth - W - 6)) + "px";
      el.style.top = (badge.offsetTop + badge.offsetHeight + 7) + "px";
      page.appendChild(el);
      bar = { el: el, pp: el.querySelector(".pp"), fl: el.querySelector(".fl"), kn: el.querySelector(".kn"), tm: el.querySelector(".tm"),
              ln: el.querySelector(".ln"), shown: null };
      bar.pp.addEventListener("click", function(e){ e.stopPropagation(); if (running) hold(); else go(); });
      el.querySelector(".cl").addEventListener("click", function(e){ e.stopPropagation(); reset(); });
      el.addEventListener("click", function(e){ e.stopPropagation(); });
      // the line: drag or click to set how much of the time has gone
      var seeking = false;
      function seek(e){
        var r = bar.ln.querySelector(".tr").getBoundingClientRect();
        left = total * (1 - Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
        lastSec = null; paint();
      }
      bar.ln.addEventListener("pointerdown", function(e){ e.preventDefault(); e.stopPropagation(); seeking = true;
        try { bar.ln.setPointerCapture(e.pointerId); } catch (err) {} seek(e); });
      bar.ln.addEventListener("pointermove", function(e){ if (seeking) seek(e); });
      bar.ln.addEventListener("pointerup", function(e){ if (seeking) { seek(e); seeking = false; last = performance.now();
        if (left <= 0) { running = false; beep(true); unlock(); paint(); } } });
      bar.ln.addEventListener("pointercancel", function(){ seeking = false; });
      // move the whole bar
      var mv = null;
      el.addEventListener("pointerdown", function(e){
        if (e.target.closest(".pp") || e.target.closest(".cl") || e.target.closest(".ln")) return;
        e.preventDefault(); e.stopPropagation();
        var k = page.getBoundingClientRect().width / page.offsetWidth || 1;
        mv = { x: e.clientX, y: e.clientY, l: el.offsetLeft, t: el.offsetTop, k: k };
        try { el.setPointerCapture(e.pointerId); } catch (err) {}
        el.classList.add("moving");
      });
      el.addEventListener("pointermove", function(e){
        if (!mv) return;
        el.style.left = Math.max(0, Math.min(mv.l + (e.clientX - mv.x) / mv.k, page.offsetWidth - el.offsetWidth)) + "px";
        el.style.top = Math.max(0, Math.min(mv.t + (e.clientY - mv.y) / mv.k, page.offsetHeight - el.offsetHeight)) + "px";
      });
      function drop(){ mv = null; el.classList.remove("moving"); }
      el.addEventListener("pointerup", drop); el.addEventListener("pointercancel", drop);
    }
    badge.addEventListener("click", function(e){
      e.preventDefault(); e.stopPropagation();
      if (!bar) makeBar();
      if (running) hold(); else go();
    });
    paint();
  }
  document.querySelectorAll(".page.hpage .rt").forEach(Timer);
  document.addEventListener("click", function(e){
    var b = e.target.closest && e.target.closest(".rt-an");
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    var svg = b.parentNode.querySelector('.qa-marks[data-id="' + b.dataset.id + '"]'), on = !svg.classList.contains("show");
    svg.classList.toggle("show", on); b.classList.toggle("on", on);
  });
  document.addEventListener("keydown", function(e){ if (e.key === "Escape") document.querySelectorAll(".rt-bar .cl").forEach(function(b){ b.click(); }); });
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
out = out.replace("</body>", fitJs + (qrs.length ? `<script>window.QA_LISTEN = ${JSON.stringify(LISTEN)};</script>` + qaJs : "") + (out.includes('class="rt') ? rtJs : "") + "</body>");
// no tap-to-translate on these books: skip the dictionary pass over book pages
out = out.replace("    var root = pagesEls[key];", "    var root = pagesEls[key];\n    if (root.classList.contains(\"hpage\")) return;");
const order = pages.map((_, i) => "p" + (i + 1));
const titles = Object.fromEntries(pages.map((p, i) => ["p" + (i + 1), "Sahifa " + p.n]));
out = out.replace(/ {2}var ORDER = \[[^\]]*\];/, "  var ORDER = " + JSON.stringify(order) + ";");
out = out.replace(/ {2}var TITLES = \{[^\n]*\};/, "  var TITLES = " + JSON.stringify(titles) + ";");
out = out.replace(/<title>[^<]*<\/title>/, `<title>GETTOPIK · ${title}</title>`);
fs.writeFileSync(outFile, out);
console.log(`${outFile}: ${pages.length} sahifa, ${pages.reduce((a, p) => a + p.runs.length, 0)} ta matn bo'lagi, ${qrs.length} ta audio QR, ${(out.length / 1024).toFixed(0)} KB`);
