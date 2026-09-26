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


NAV_ANCHOR = "  scaleStage();\n  updatePageChrome();"
NAV_JS = """  scaleStage();
  updatePageChrome();

  // ---------- nav-v1: where am I, go to a page, come back to the same page after a reload ----------
  (function(){
    var lbl = document.getElementById("pageLbl"), KEY = "gt-pos:" + location.pathname.split("/").pop();
    function where(){                                  // the page under the middle of the screen, and how far into it
      var el = pagesEls[ORDER[cur]], r = el.getBoundingClientRect(), o = stageOuter.getBoundingClientRect();
      return { k: ORDER[cur], f: r.height ? Math.max(0, Math.min(1, (o.top + 40 - r.top) / r.height)) : 0 };
    }
    var saveT = 0;
    function save(){
      clearTimeout(saveT);
      saveT = setTimeout(function(){
        var w = where();
        try { localStorage.setItem(KEY, JSON.stringify(w)); } catch (e) {}
        try { history.replaceState(null, "", location.pathname + location.search + "#" + (cur + 1)); } catch (e) {}
      }, 250);
    }
    stageOuter.addEventListener("scroll", save, { passive: true });
    function goTo(k, f){
      var el = pagesEls[k];
      if (!el) return;
      var r = el.getBoundingClientRect(), o = stageOuter.getBoundingClientRect();
      stageOuter.scrollTop += r.top - o.top + (f || 0) * r.height - 40 * (f ? 1 : 0);
    }
    // back to where the teacher was: #N in the address wins, then the last spot in this browser
    var want = null, m = location.hash.match(/^#p?(\\d+)$/);
    if (m && ORDER[+m[1] - 1]) want = { k: ORDER[+m[1] - 1], f: 0 };
    else { try { want = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) {} }
    if (want && pagesEls[want.k] && want.k !== ORDER[0]) {
      goTo(want.k, want.f);
      setTimeout(function(){ goTo(want.k, want.f); }, 700);           // again once pages have their real height
    }
    // the page label is also a box to type a page number into
    lbl.setAttribute("role", "button"); lbl.tabIndex = 0;
    lbl.title = "Bet raqamini yozib o'tish uchun bosing";
    function ask(){
      if (lbl.querySelector("input")) return;
      var box = document.createElement("input");
      box.type = "text"; box.inputMode = "numeric"; box.placeholder = (cur + 1) + ""; box.setAttribute("aria-label", "Bet raqami");
      box.className = "go-page";
      lbl.textContent = ""; lbl.appendChild(box);
      var total = document.createElement("span"); total.className = "go-total"; total.textContent = " / " + ORDER.length;
      lbl.appendChild(total);
      box.focus();
      var done = false;
      function finish(go){
        if (done) return; done = true;
        var n = parseInt(box.value, 10);
        updatePageChrome();
        if (go && n >= 1 && n <= ORDER.length) scrollToPage(ORDER[n - 1]);
      }
      box.addEventListener("keydown", function(e){
        e.stopPropagation();
        if (e.key === "Enter") finish(true);
        if (e.key === "Escape") finish(false);
      });
      box.addEventListener("input", function(){ box.value = box.value.replace(/[^0-9]/g, "").slice(0, 3); });
      box.addEventListener("blur", function(){ finish(true); });
    }
    lbl.addEventListener("click", ask);
    lbl.addEventListener("keydown", function(e){ if (e.key === "Enter" && e.target === lbl) ask(); });
  })();"""
NAV_CSS = """<style id="nav-v1">
#nav-bar #pageLbl { cursor:pointer; border-radius:8px; padding:5px 10px; background:rgba(255,255,255,.08); color:#fff;
  font-size:13.5px; font-weight:700; font-variant-numeric:tabular-nums; }
#nav-bar #pageLbl:hover { background:rgba(255,255,255,.18); }
#nav-bar #pageLbl:focus-visible { outline:2px solid #8DB8FF; outline-offset:2px; }
#nav-bar #pageLbl .go-page { width:52px; height:24px; border:0; border-radius:6px; padding:0 6px; text-align:center;
  font:700 14px/1 Calibri, Arial, sans-serif; color:#14161C; background:#fff; outline:2px solid #3D80E8; }
#nav-bar #pageLbl .go-total { color:#cfd6e4; font-weight:700; }
</style>
"""

ZOOM_ANCHOR = "  scaleStage();\n  updatePageChrome();\n\n  // ---------- nav-v1"
ZOOM_JS = """  // ---------- zoom-v2: the zoom the teacher chose comes back after a reload ----------
  (function(){
    var KEY = "gt-zoom:" + location.pathname.split("/").pop(), z = null;
    try { z = parseFloat(localStorage.getItem(KEY)); } catch (e) {}
    if (z >= 0.5 && z <= 2.5) {
      zoomFactor = z;
      var l = document.getElementById("zoomLbl");
      if (l) l.textContent = Math.round(z * 100) + "%";
    }
    var plain = scaleStage;
    scaleStage = function(){                       // every zoom change goes through here, so remember it
      plain();
      try { localStorage.setItem(KEY, String(zoomFactor)); } catch (e) {}
    };
  })();
""" + ZOOM_ANCHOR

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
    if "nav-v1" not in s and NAV_ANCHOR in s:
        s = s.replace(NAV_ANCHOR, NAV_JS, 1)
        s = s.replace("</head>", NAV_CSS + "</head>", 1)
    if "zoom-v2" not in s and ZOOM_ANCHOR in s:
        s = s.replace(ZOOM_ANCHOR, ZOOM_JS, 1)
    if OLD_FIT in s:
        s = s.replace(OLD_FIT, NEW_FIT, 1)
    # page backgrounds become lazy, asynchronously decoded images
    s, n = BG.subn(lambda m: m.group(1) + '"><img class="pbg" src="' + m.group(2)
                   + '" loading="lazy" decoding="async" alt="">', s)
    if s != before:
        open(p, "w", encoding="utf-8").write(s)
    print(f"{name}: {'patched' if s != before else 'already done'}, lazy backgrounds {n}, "
          f"scroll {'ok' if NEW_SCROLL in s else 'MISSING'}, search {'ok' if NEW_FIND in s else 'MISSING'}, "
          f"zoom {'ok' if 'anchor = null' in s else 'MISSING'}, nav {'ok' if 'nav-v1' in s else 'MISSING'}, "
          f"zoom-keep {'ok' if 'zoom-v2' in s else 'MISSING'}")

for b in (sys.argv[1:] or BOOKS):
    patch(b)
