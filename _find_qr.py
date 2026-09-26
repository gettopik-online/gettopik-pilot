# Finds the audio QR codes in a 서울대 teacher-book PDF, follows each link to its YouTube video and
# writes html_books/<key>/<key>.qr.json = [{page, x, y, w, h, url, yt}]  (x..h in PDF points)
# Usage: python _find_qr.py <pdf> <key>
import sys, json, os, re, subprocess
import numpy as np, pymupdf, zxingcpp

pdf, key = sys.argv[1], sys.argv[2]
out, seen_url = [], {}

def resolve(url):
    """Short naver link -> YouTube id (follows the redirects without downloading anything)."""
    if url in seen_url:
        return seen_url[url]
    r = subprocess.run(["curl", "-sIL", "-m", "20", url], capture_output=True, text=True)
    m = re.findall(r"(?:youtu\.be/|[?&]v=)([A-Za-z0-9_-]{11})", r.stdout + " " + url)
    seen_url[url] = m[0] if m else None
    return seen_url[url]

def decode(g):
    """Small, soft QR pictures: try several enlargements, plain and Otsu-thresholded."""
    import cv2
    for sc in (3, 4, 2, 6, 1, 8):
        gg = cv2.resize(g, None, fx=sc, fy=sc, interpolation=cv2.INTER_CUBIC)
        for im in (gg, cv2.threshold(gg, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]):
            r = zxingcpp.read_barcodes(im, formats=zxingcpp.BarcodeFormat.QRCode)
            if r:
                return r[0].text
    return None

doc = pymupdf.open(pdf)
tried = {}
for page in doc:
    hits = []
    for info in page.get_image_info(xrefs=True):
        x0, y0, x1, y1 = info["bbox"]
        w, h = x1 - x0, y1 - y0
        if not (14 <= w <= 70 and 14 <= h <= 70 and 0.75 <= w / h <= 1.33) or not info["xref"]:
            continue
        xr = info["xref"]
        if xr not in tried:
            pix = pymupdf.Pixmap(doc, xr)
            if pix.alpha or pix.n != 1:
                pix = pymupdf.Pixmap(pymupdf.csGRAY, pix)
            g = np.frombuffer(pix.samples, np.uint8).reshape(pix.height, pix.stride)[:, :pix.width].copy()
            tried[xr] = decode(g)
        if tried[xr]:
            hits.append({"page": page.number + 1, "x": round(x0, 1), "y": round(y0, 1),
                         "w": round(w, 1), "h": round(h, 1), "url": tried[xr]})
    for f in sorted(hits, key=lambda f: (f["x"] > 297, f["y"])):
        f["yt"] = resolve(f["url"])
        out.append(f)
        print(f["page"], f["url"], f["yt"], flush=True)

os.makedirs(f"html_books/{key}", exist_ok=True)
json.dump(out, open(f"html_books/{key}/{key}.qr.json", "w", encoding="utf-8"), ensure_ascii=False, indent=0)
print(key, "QR:", len(out), "no video:", sum(1 for f in out if not f["yt"]))
