# Turn book pages into HTML the way 파이널 패스 is built: the words become real HTML text (drawn by the
# browser, crisp at any zoom), everything else — photos, drawings, boxes — stays in a background
# picture of the page with the text taken out.
#
#   python _pdf2html.py <book.pdf> <first_page> <last_page|end> <out_dir> <key> [ffmpeg]
#
# Writes <out_dir>/bg/p-NNN.webp (or .jpg for scanned pages) and <out_dir>/<key>.pages.json.
import sys, os, json, math, re, subprocess, pymupdf
import numpy as np

args = [a for a in sys.argv[1:] if not a.startswith("--")]
RUNS_ONLY = "--runs-only" in sys.argv          # refresh the text layer, keep the existing backgrounds
src, first, last, out_dir, key = args[0], int(args[1]), args[2], args[3], args[4]
FFMPEG = args[5] if len(args) > 5 else "ffmpeg"
BG_DPI = 200
WEB_FONTS = ("MalgunGothic", "Malgun", "CambriaMath", "Cambria", "SegoeUI")   # fonts the browser has
# text from embedded (Type3) fonts is used only when it maps to ordinary characters
CLEAN = re.compile(r"^[가-힣ᄀ-ᇿ㄰-㆏ -~ -ÿ‐-‧‰-⁞"
                   r"←-⇿①-⓿■-◿☀-⛿　-〿·•ʻʼ‘’“”"
                   r"Ѐ-ӿ！-～]+$")

os.makedirs(os.path.join(out_dir, "bg"), exist_ok=True)
doc = pymupdf.open(src)
last = len(doc) if last == "end" else int(last)
pages = []
hexcolor = lambda c: "#%06X" % (c & 0xFFFFFF)

def webp(png, out, quality=80):
    subprocess.run([FFMPEG, "-nostdin", "-v", "error", "-y", "-i", png, "-c:v", "libwebp", "-quality", str(quality), out], check=True)

def luminance(c):
    return 0.299 * ((c >> 16) & 255) + 0.587 * ((c >> 8) & 255) + 0.114 * (c & 255)

MEASURE_DPI = 450

def _runs(mask):
    """Lengths of consecutive True runs along the last axis of a 2-D boolean array."""
    m = np.pad(mask.astype(np.int8), ((0, 0), (1, 1)))
    d = np.diff(m, axis=1)
    starts = np.argwhere(d == 1)
    ends = np.argwhere(d == -1)
    return ends[:, 1] - starts[:, 1]

def page_array(pix):
    return np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.stride)[:, :pix.width]

def stroke_width(pix, bbox, color, size, arr=None):
    """Typical stroke thickness of the text in bbox, as a share of the font size (bold ~0.11, regular ~0.07)."""
    z = MEASURE_DPI / 72
    if arr is None:
        arr = page_array(pix)
    x0, y0, x1, y1 = [int(v * z) for v in bbox]
    x0, y0 = max(x0, 0), max(y0, 0)
    x1, y1 = min(x1, arr.shape[1] - 1), min(y1, arr.shape[0] - 1)
    if x1 - x0 < 6 or y1 - y0 < 6:
        return None
    box = arr[y0:y1, x0:x1].astype(np.int16)
    bg, tg = int(np.median(box)), luminance(color)
    if abs(bg - tg) < 40:
        return None
    ink = np.abs(box - tg) < np.abs(box - bg)
    runs = np.concatenate([_runs(ink), _runs(ink.T)])
    if len(runs) < 8:
        return None
    runs.sort()
    core = runs[len(runs) // 5: max(len(runs) // 5 + 1, len(runs) * 3 // 5)]   # trimmed mean
    return float(core.mean()) / (size * z)

def classify_weights(doc):
    """-> (bold Type3 fonts, measured Type3 fonts, cuts). Hangul and Latin get separate references."""
    HANGUL, LATIN = re.compile(r"[\uAC00-\uD7A3]"), re.compile(r"[A-Za-z]")
    script = lambda t: "H" if HANGUL.search(t) else "L" if LATIN.search(t) else None
    samples, ref = {}, {("H", "REG"): [], ("H", "BOLD"): [], ("L", "REG"): [], ("L", "BOLD"): []}
    def wants(sp, sc):
        if sp["font"].startswith("Type3"):
            return len(samples.get(sp["font"], [])) < 14
        k = (sc, "BOLD" if sp["font"] == "MalgunGothicBold" else "REG")
        return sp["font"] in ("MalgunGothic", "MalgunGothicBold") and len(ref[k]) < 120
    for page in doc:
        need = [(sp, script(sp["text"])) for bl in page.get_text("dict")["blocks"] for l in bl.get("lines", [])
                for sp in l["spans"]]
        need = [(sp, sc) for sp, sc in need if sc and wants(sp, sc)]
        if not need:
            continue
        pix = page.get_pixmap(dpi=MEASURE_DPI, colorspace=pymupdf.csGRAY, alpha=False)
        arr = page_array(pix)
        for sp, sc in need:
            w = stroke_width(pix, sp["bbox"], sp["color"], sp["size"], arr)
            if w is None:
                continue
            if sp["font"].startswith("Type3"):
                samples.setdefault(sp["font"], []).append((sc, w))
            else:
                ref[(sc, "BOLD" if sp["font"] == "MalgunGothicBold" else "REG")].append(w)
    med = lambda v: sorted(v)[len(v) // 2]
    def cut(sc):
        reg, bold = ref[(sc, "REG")], ref[(sc, "BOLD")]
        r = med(reg) if len(reg) >= 8 else (0.07 if sc == "H" else 0.075)
        b = med(bold) if len(bold) >= 8 else r * 1.55
        # Uzbek (Latin) lines are nearly always regular in these books, so lean that way
        return r + (b - r) * (0.5 if sc == "H" else 0.7)
    cuts = {"H": cut("H"), "L": cut("L")}
    bold_fonts = set()
    for f, v in samples.items():
        sc = "H" if sum(1 for x in v if x[0] == "H") >= len(v) / 2 else "L"
        vals = [w for x, w in v if x == sc] or [w for _, w in v]
        if med(vals) > cuts[sc]:
            bold_fonts.add(f)
    return bold_fonts, set(samples), cuts

BOLD_T3, MEASURED_T3, CUTS = classify_weights(doc)
print(f"{key}: qalin maxsus shriftlar {len(BOLD_T3)} / {len(MEASURED_T3)}, chegaralar {CUTS}")

def line_runs(line):
    """Merge a line's spans into runs of equal size and colour (words split across embedded fonts join up)."""
    groups = []
    for sp in line["spans"]:
        if not sp["text"]:
            continue
        web = any(sp["font"].startswith(f) for f in WEB_FONTS)
        usable = web or CLEAN.match(sp["text"]) or not sp["text"].strip()
        g = groups[-1] if groups else None
        joinable = bool(g and usable and g["usable"] and web == g["web"]
                        and abs(g["size"] - sp["size"]) < 0.15 and g["color"] == sp["color"]
                        and sp["bbox"][0] - g["bbox"][2] < 0.6 * sp["size"])
        weight = ("Bold" in sp["font"]) if web else (sp["font"] in BOLD_T3)
        unknown = (not web) and sp["font"] not in MEASURED_T3              # e.g. a font holding only "?" or "/"
        if joinable and not unknown:
            joinable = weight == g["bold"]                               # weights never mix in one run
        if joinable:
            g["text"] += sp["text"]
            g["bbox"] = (min(g["bbox"][0], sp["bbox"][0]), min(g["bbox"][1], sp["bbox"][1]),
                         max(g["bbox"][2], sp["bbox"][2]), max(g["bbox"][3], sp["bbox"][3]))
        else:
            groups.append({"text": sp["text"], "bbox": tuple(sp["bbox"]), "size": sp["size"], "color": sp["color"],
                           "web": web, "usable": bool(usable), "font": sp["font"],
                           "malgun_bold": "Bold" in sp["font"], "flags": sp["flags"],
                           "bold": ("Bold" in sp["font"]) if web else (sp["font"] in BOLD_T3),
                           "origin": sp["origin"], "asc": sp.get("ascender", 1.0), "desc": sp.get("descender", -0.25)})
    return groups

stats = {"html": 0, "kept": 0, "scan": 0}
for pno in range(first - 1, last):
    page = doc[pno]
    W, H = page.rect.width, page.rect.height
    runs, boxes, kept = [], [], 0
    d = page.get_text("dict", flags=pymupdf.TEXT_PRESERVE_WHITESPACE)
    for blk in d["blocks"]:
        for line in blk.get("lines", []):
            dx, dy = line["dir"]
            for g in line_runs(line):
                text = g["text"]
                if not text.strip():
                    continue
                if not g["usable"]:
                    kept += len(text.strip())
                    continue                              # symbols with no real character stay in the picture
                x0, y0, x1, y1 = g["bbox"]
                size = g["size"]
                if g["web"]:
                    ox, oy = g["origin"]
                    top, h = oy - g["asc"] * size, (g["asc"] - g["desc"]) * size
                else:                                     # embedded font metrics are unreliable: use the box
                    ox, top, h = x0, y0, max(y1 - y0, size)
                bold = g["bold"] or bool(g["flags"] & 16)
                runs.append({
                    "t": text, "x": round(ox, 2), "y": round(top, 2), "h": round(h, 2),
                    "w": round(x1 - x0, 2), "s": round(size, 2), "b": 1 if bold else 0,
                    "c": hexcolor(g["color"]),
                    "r": round(-math.degrees(math.atan2(dy, dx)), 2) if abs(dy) > 0.01 else 0,
                })
                boxes.append(pymupdf.Rect(x0, y0, x1, y1))

    out_base = os.path.join(out_dir, "bg", "p-%03d" % (pno + 1))
    full = [im for im in page.get_images(full=True)
            if any(r.width * r.height > 0.85 * W * H for r in page.get_image_rects(im[0]))]
    if RUNS_ONLY:
        existing = [e for e in ("webp", "jpg", "png") if os.path.exists(out_base + "." + e)]
        if not existing:
            raise SystemExit(f"{out_base}: fon rasmi yo'q — avval to'liq rejimda ishga tushiring")
        bg = "bg/p-%03d.%s" % (pno + 1, existing[0])
    elif not runs and full and len(page.get_drawings()) == 0:
        # a scanned page: use the scan itself at its own resolution (re-rendering would only blur it)
        img = doc.extract_image(full[0][0])
        ext = "jpg" if img["ext"] in ("jpeg", "jpg") else img["ext"]
        with open(out_base + "." + ext, "wb") as f:
            f.write(img["image"])
        if ext not in ("jpg", "png", "webp"):
            webp(out_base + "." + ext, out_base + ".webp", 90); os.remove(out_base + "." + ext); ext = "webp"
        bg = "bg/p-%03d.%s" % (pno + 1, ext)
        stats["scan"] += 1
    else:
        tmp = pymupdf.open()
        tmp.insert_pdf(doc, from_page=pno, to_page=pno)
        tp = tmp[0]
        for r in boxes:
            tp.add_redact_annot(r)
        tp.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE,
                            graphics=pymupdf.PDF_REDACT_LINE_ART_NONE,
                            text=pymupdf.PDF_REDACT_TEXT_REMOVE)
        # lettering left in the picture must stay sharp too, so those pages get a finer background
        pix = tp.get_pixmap(dpi=300 if kept else BG_DPI, alpha=False)
        pix.save(out_base + ".png")
        webp(out_base + ".png", out_base + ".webp")
        os.remove(out_base + ".png")
        tmp.close()
        bg = "bg/p-%03d.webp" % (pno + 1)
    stats["html"] += len(runs); stats["kept"] += kept
    pages.append({"n": pno + 1, "w": round(W, 2), "h": round(H, 2), "bg": bg, "runs": runs})

with open(os.path.join(out_dir, key + ".pages.json"), "w", encoding="utf-8") as f:
    json.dump(pages, f, ensure_ascii=False)
print(f"{key}: {len(pages)} sahifa · HTML matn bo'laklari {stats['html']} · rasmda qolgan belgilar {stats['kept']} · skan sahifalar {stats['scan']}")
