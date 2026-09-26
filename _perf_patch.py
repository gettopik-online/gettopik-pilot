# Makes the book pages scroll smoothly and adds a back button. Safe to run again: every step checks
# whether it has already been applied. Run after rebuilding any book:  python _perf_patch.py
import re, sys, glob

BOOKS = ["sd1a", "sd1b", "sd2a", "sd2b", "sd3a", "sd3b", "topik1", "topik2", "yozish", "pilot"]

CSS = """<style id="perf-v1">
/* off-screen pages are skipped entirely until they come near the viewport */
#stage-inner > .page { content-visibility:auto; contain-intrinsic-size:auto 794px auto 1123px; }
/* a large blurred shadow on every page and a blurred bar over moving content are costly to repaint */
#stage-inner > .page { box-shadow:0 0 0 1px #E3E5E9, 0 2px 10px rgba(0,0,0,.10) !important; }
#nav-bar { backdrop-filter:none !important; -webkit-backdrop-filter:none !important; background:rgba(20,22,28,.95) !important; }
.page.hpage > img.pbg { position:absolute; left:0; top:0; width:100%; height:100%; display:block; pointer-events:none; user-select:none; }
#backBtn { display:inline-flex; align-items:center; gap:6px; height:30px; padding:0 12px 0 9px; border-radius:8px;
  background:rgba(255,255,255,.12); color:#fff; font-size:13px; font-weight:700; text-decoration:none; margin-right:6px; }
#backBtn:hover { background:rgba(255,255,255,.22); }
#backBtn:focus-visible { outline:2px solid #8DB8FF; outline-offset:2px; }
#backBtn svg { width:16px; height:16px; }
@media (max-width:560px) { #backBtn .txt { display:none; } #backBtn { padding:0 9px; } #nav-bar .lbl { min-width:0 !important; } }
</style>
"""

BACK = ('<a id="backBtn" href="menu.html" title="Menyuga qaytish">'
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" '
        'stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg><span class="txt">Orqaga</span></a>\n  ')

BACK_JS = """<script id="back-v1">
(function(){
  var b = document.getElementById("backBtn");
  if (!b) return;
  b.addEventListener("click", function(e){
    // came from the programme menu: step back so the teacher lands on the same book page
    if (document.referrer && /\\/menu\\.html/.test(document.referrer) && history.length > 1) {
      e.preventDefault(); history.back();
    }
  });
})();
</script>
"""

OLD_SCROLL = 'stageOuter.addEventListener("scroll", function(){ requestAnimationFrame(updateCurrentFromScroll); }, { passive: true });'
NEW_SCROLL = ('var scrollTick = false;\n'
              '  stageOuter.addEventListener("scroll", function(){ if (scrollTick) return; scrollTick = true; '
              'requestAnimationFrame(function(){ scrollTick = false; updateCurrentFromScroll(); }); }, { passive: true });')

OLD_FIND = """    var newCur = 0;
    for (var i = 0; i < ORDER.length; i++) {
      if (pagesEls[ORDER[i]].getBoundingClientRect().top <= midY) newCur = i; else break;
    }"""
NEW_FIND = """    var lo = 0, hi = ORDER.length - 1, newCur = 0;   // pages are stacked in order: binary search
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (pagesEls[ORDER[mid]].getBoundingClientRect().top <= midY) { newCur = mid; lo = mid + 1; } else hi = mid - 1;
    }"""

OLD_FIT = """<script>
(function(){
  function fit(){
    document.querySelectorAll(".page.hpage .t").forEach(function(el){
      el.style.transform = "";
      var target = +el.dataset.w, natural = el.offsetWidth;
      var rot = el.style.getPropertyValue("--rot");
      var sx = (natural > 0 && target > 0) ? target / natural : 1;
      if (Math.abs(sx - 1) < 0.01) sx = 1;
      el.style.transform = (rot ? "rotate(" + rot + ") " : "") + (sx !== 1 ? "scaleX(" + sx.toFixed(4) + ")" : "");
    });
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit); else window.addEventListener("load", fit);
  window.addEventListener("load", fit);
})();
</script>"""
# Fits each text run to its printed width, one page at a time as it nears the screen: all widths are read
# first and all transforms written after, so the browser lays the page out once instead of once per run.
NEW_FIT = """<script id="fit-v2">
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
</script>"""

OLD_SCALE = """    stageInner.style.transform = "scale("+(fitScale*zoomFactor)+")";
  }"""
# zooming keeps the spot in the middle of the screen where it was, instead of leaving the scroll offset
# unchanged (which showed a different page after every zoom step)
NEW_SCALE = """    var so = stageOuter, mid = so.getBoundingClientRect().top + so.clientHeight / 2, anchor = null;
    if (stageInner.style.transform) {
      var lo = 0, hi = ORDER.length - 1, at = 0;
      while (lo <= hi) { var m = (lo + hi) >> 1;
        if (pagesEls[ORDER[m]].getBoundingClientRect().top <= mid) { at = m; lo = m + 1; } else hi = m - 1; }
      var r0 = pagesEls[ORDER[at]].getBoundingClientRect();
      anchor = { el: pagesEls[ORDER[at]], f: r0.height ? (mid - r0.top) / r0.height : 0 };
    }
    stageInner.style.transform = "scale("+(fitScale*zoomFactor)+")";
    if (anchor) {
      var r1 = anchor.el.getBoundingClientRect();
      so.scrollTop += r1.top + anchor.f * r1.height - mid;
    }
  }"""

BG = re.compile(r'(<div class="page hpage" data-key="[^"]+" style="height:[^;"]+);background-image:url\(([^)]+)\)">')

def patch(name):
    p = name + ".html"
    s = open(p, encoding="utf-8").read()
    before = s
    if 'id="perf-v1"' not in s:
        s = s.replace("</head>", CSS + "</head>", 1)
    if 'id="backBtn"' not in s:
        s = s.replace('<div id="nav-bar">\n  ', '<div id="nav-bar">\n  ' + BACK, 1)
        assert 'id="backBtn"' in s, name + ": nav-bar not found"
    if 'id="back-v1"' not in s:
        i = s.rfind("</body>")
        s = s[:i] + BACK_JS + s[i:]
    if OLD_SCROLL in s:
        s = s.replace(OLD_SCROLL, NEW_SCROLL, 1)
    if OLD_FIND in s:
        s = s.replace(OLD_FIND, NEW_FIND, 1)
    if OLD_SCALE in s and "anchor = null" not in s:
        s = s.replace(OLD_SCALE, NEW_SCALE, 1)
    OLD2 = """    stageInner.style.transform = "scale("+((availW / natW)*zoomFactor)+")";
  }"""
    if OLD2 in s and "anchor = null" not in s:                 # TOPIK I / II shell spells it this way
        s = s.replace(OLD2, NEW_SCALE.replace("(fitScale*zoomFactor)", "((availW / natW)*zoomFactor)"), 1)
    if OLD_FIT in s:
        s = s.replace(OLD_FIT, NEW_FIT, 1)
    # page backgrounds become lazy, asynchronously decoded images
    s, n = BG.subn(lambda m: m.group(1) + '"><img class="pbg" src="' + m.group(2)
                   + '" loading="lazy" decoding="async" alt="">', s)
    if s != before:
        open(p, "w", encoding="utf-8").write(s)
    print(f"{name}: {'patched' if s != before else 'already done'}, lazy backgrounds {n}, "
          f"scroll {'ok' if NEW_SCROLL in s else 'MISSING'}, search {'ok' if NEW_FIND in s else 'MISSING'}, "
          f"zoom {'ok' if 'anchor = null' in s else 'MISSING'}")

for b in (sys.argv[1:] or BOOKS):
    patch(b)
