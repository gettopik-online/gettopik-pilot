# Turn book pages into HTML the way 파이널 패스 is built: the words become real HTML text (drawn by the
# browser, crisp at any zoom), everything else — photos, drawings, boxes, decorative lettering — stays
# in a background picture of the page with the text taken out.
#
#   python _pdf2html.py <book.pdf> <first_page> <last_page> <out_dir> <key>
#
# Writes <out_dir>/bg/p-NNN.webp and <out_dir>/<key>.pages.json (one entry per page: size + text runs).
import sys, os, json, subprocess, pymupdf

src, first, last, out_dir, key = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4], sys.argv[5]
BG_DPI = 200
WEB_FONTS = ("MalgunGothic", "Malgun", "CambriaMath", "Cambria")   # fonts the browser can stand in for
FFMPEG = sys.argv[6] if len(sys.argv) > 6 else "ffmpeg"

os.makedirs(os.path.join(out_dir, "bg"), exist_ok=True)
doc = pymupdf.open(src)
pages = []

def hexcolor(c):
    return "#%06X" % (c & 0xFFFFFF)

for pno in range(first - 1, last):
    page = doc[pno]
    W, H = page.rect.width, page.rect.height
    runs = []
    boxes = []
    kept_in_picture = 0          # characters in decorative fonts that stay part of the background
    d = page.get_text("dict", flags=pymupdf.TEXT_PRESERVE_WHITESPACE)
    for b in d["blocks"]:
        for line in b.get("lines", []):
            dx, dy = line["dir"]
            for s in line["spans"]:
                text = s["text"]
                if not text.strip():
                    continue
                if not any(s["font"].startswith(f) for f in WEB_FONTS):
                    kept_in_picture += len(text.strip())
                    continue                              # Type3 / decorative glyphs stay in the picture
                x0, y0, x1, y1 = s["bbox"]
                ox, oy = s["origin"]
                size = s["size"]
                asc, desc = s.get("ascender", 1.0), s.get("descender", -0.25)
                runs.append({
                    "t": text,
                    "x": round(ox, 2),
                    "y": round(oy - asc * size, 2),           # top of the em box
                    "h": round((asc - desc) * size, 2),
                    "w": round(x1 - x0, 2),
                    "s": round(size, 2),
                    "b": 1 if ("Bold" in s["font"] or s["flags"] & 16) else 0,
                    "c": hexcolor(s["color"]),
                    "r": round(-__import__("math").degrees(__import__("math").atan2(dy, dx)), 2) if abs(dy) > 0.01 else 0,
                })
                boxes.append(pymupdf.Rect(x0, y0, x1, y1))

    # background: the same page with those words removed (pictures and line art kept)
    tmp = pymupdf.open()
    tmp.insert_pdf(doc, from_page=pno, to_page=pno)
    tp = tmp[0]
    for r in boxes:
        tp.add_redact_annot(r)
    tp.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE,
                        graphics=pymupdf.PDF_REDACT_LINE_ART_NONE,
                        text=pymupdf.PDF_REDACT_TEXT_REMOVE)
    # lettering left in the picture must stay sharp too, so those pages get a finer background
    pix = tp.get_pixmap(dpi=300 if kept_in_picture else BG_DPI, alpha=False)
    png = os.path.join(out_dir, "bg", "p-%03d.png" % (pno + 1))
    webp = png[:-4] + ".webp"
    pix.save(png)
    subprocess.run([FFMPEG, "-nostdin", "-v", "error", "-y", "-i", png, "-c:v", "libwebp", "-quality", "80", webp], check=True)
    os.remove(png)
    tmp.close()

    pages.append({"n": pno + 1, "w": round(W, 2), "h": round(H, 2), "bg": "bg/p-%03d.webp" % (pno + 1), "runs": runs})
    print(f"sahifa {pno + 1}: {len(runs)} ta matn bo'lagi")

with open(os.path.join(out_dir, key + ".pages.json"), "w", encoding="utf-8") as f:
    json.dump(pages, f, ensure_ascii=False)
print("tayyor:", len(pages), "sahifa")
