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

const pageHtml = pages.map((p, i) => {
  const runs = p.runs.map((r) => {
    const st = [
      `left:${px(r.x)}`, `top:${px(r.y)}`, `font-size:${px(r.s)}`, `line-height:${px(r.h)}`,
      r.b ? "font-weight:700" : "", r.c !== "#000000" ? `color:${r.c}` : "",
      r.r ? `--rot:${r.r}deg` : "",
    ].filter(Boolean).join(";");
    return `<span class="t" style="${st}" data-w="${(r.w * PT).toFixed(2)}">${esc(r.t)}</span>`;
  }).join("");
  return `<div class="page hpage" data-key="p${i + 1}" style="height:${px(p.h)};background-image:url(${dir}/${p.bg})">${runs}</div>`;
});

const css = `
  .page.hpage{padding:0;position:relative;overflow:hidden;background-color:#fff;background-size:100% 100%;background-repeat:no-repeat}
  .page.hpage .t{position:absolute;white-space:pre;transform-origin:0 0;
    font-family:"Malgun Gothic","맑은 고딕","Noto Sans KR","Apple SD Gothic Neo",sans-serif;color:#231F20;
    -webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}
`;

// fit every run to the width it has in the book, so lines end exactly where they did in print
const fitJs = `
<script>
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
out = out.replace("</body>", fitJs + "</body>");
const order = pages.map((_, i) => "p" + (i + 1));
const titles = Object.fromEntries(pages.map((p, i) => ["p" + (i + 1), "Sahifa " + p.n]));
out = out.replace(/ {2}var ORDER = \[[^\]]*\];/, "  var ORDER = " + JSON.stringify(order) + ";");
out = out.replace(/ {2}var TITLES = \{[^\n]*\};/, "  var TITLES = " + JSON.stringify(titles) + ";");
out = out.replace(/<title>[^<]*<\/title>/, `<title>GETTOPIK · ${title}</title>`);
fs.writeFileSync(outFile, out);
console.log(`${outFile}: ${pages.length} sahifa, ${pages.reduce((a, p) => a + p.runs.length, 0)} ta matn bo'lagi, ${(out.length / 1024).toFixed(0)} KB`);
